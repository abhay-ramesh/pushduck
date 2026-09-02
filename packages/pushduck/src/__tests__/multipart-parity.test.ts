/**
 * @fileoverview Multipart must be invisible above the engine.
 *
 * The requirement is not "multipart works" — it is that a caller **cannot tell
 * which strategy ran**. Same `S3UploadedFile` fields, same status transitions,
 * same `progress` / `uploadSpeed` / `eta` semantics, same callbacks, same
 * cancellation.
 *
 * So these tests run the *same assertions* against a small file (single `PUT`)
 * and a large one (multipart) and require both to satisfy them. A parity test
 * written as two separate suites would drift; sharing the assertion body is
 * what makes the guarantee real.
 */

import { describe, expect, it, vi } from "vitest";
import { createUploadEngine, type UploadEngineState } from "../core/upload";
import { MIB } from "../core/upload/multipart/limits";
import type { S3UploadedFile } from "../types";

/** A file of `size` bytes whose slices are real, so part bodies are checkable. */
function makeFile(size: number, name = "file.bin"): File {
  return new File([new Uint8Array(size)], name, {
    type: "application/octet-stream",
  });
}

/**
 * A server that answers both strategies.
 *
 * One fetcher for both paths, because the engine picks per file and a batch
 * may contain each.
 */
function createServer(options: { failParts?: Set<number> } = {}) {
  const signedParts: number[] = [];
  const actions: string[] = [];

  const fetcher = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const action = new URL(url, "http://x").searchParams.get("action") ?? "presign";
    actions.push(action);

    const body = init?.body ? JSON.parse(String(init.body)) : {};

    const reply = (payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    switch (action) {
      case "presign":
        return reply({
          success: true,
          results: body.files.map((file: { name: string }) => ({
            success: true,
            presignedUrl: `https://storage.example/${file.name}`,
            key: `uploads/${file.name}`,
            requiredHeaders: {},
            // Both strategies return the middleware's output, so the fixture
            // must too — otherwise the parity comparison is unfair rather than
            // informative.
            metadata: { serverSaid: "hello" },
          })),
        });

      case "complete":
        return reply({
          success: true,
          results: body.completions.map((c: { key: string }) => ({
            success: true,
            key: c.key,
            url: `https://cdn.example/${c.key}`,
          })),
        });

      case "multipart-init":
        return reply({
          success: true,
          session: "session-token",
          key: `uploads/${body.file.name}`,
          partSize: 5 * MIB,
          metadata: { serverSaid: "hello" },
        });

      case "multipart-sign":
        signedParts.push(...body.partNumbers);
        return reply(
          body.partNumbers.map((partNumber: number) => ({
            partNumber,
            url: `https://storage.example/part/${partNumber}`,
          }))
        );

      case "multipart-complete":
        return reply({
          success: true,
          key: `uploads/${body.file.name}`,
          url: `https://cdn.example/uploads/${body.file.name}`,
        });

      case "multipart-abort":
        return reply({ success: true });

      default:
        return reply({ success: false, error: `unknown action ${action}` });
    }
  });

  /** Transport that reports progress and returns an ETag, like a real one. */
  const transport = vi.fn(async ({ url, body, onProgress }: any) => {
    const partNumber = Number(url.split("/part/")[1]);

    if (options.failParts?.has(partNumber)) {
      options.failParts.delete(partNumber); // fail once, then succeed
      throw new Error("transient network failure");
    }

    onProgress?.(body.size, body.size);
    return { etag: `"etag-${partNumber || 0}"` };
  });

  return { fetcher, transport, signedParts, actions };
}

/** Builds an engine with a low threshold so tests need only small files. */
function buildEngine(over: Record<string, unknown> = {}) {
  const server = createServer(over.server as any);

  const engine = createUploadEngine({
    route: "upload",
    endpoint: "/api/upload",
    fetcher: server.fetcher,
    transport: server.transport,
    // 6 MiB: above it a file splits into 5 MiB parts, below it stays single.
    multipart: { threshold: 6 * MIB, partSize: 5 * MIB, concurrency: 2 },
    ...over,
  });

  return { engine, ...server };
}

/**
 * The shared contract. Both strategies must satisfy every assertion here.
 */
async function expectStandardSurface(file: File) {
  const progressValues: number[] = [];
  const server = createServer();

  const engine = createUploadEngine({
    route: "upload",
    endpoint: "/api/upload",
    fetcher: server.fetcher,
    transport: server.transport,
    multipart: { threshold: 6 * MIB, partSize: 5 * MIB, concurrency: 2 },
    onProgress: (p) => progressValues.push(p),
  });

  const states: UploadEngineState[] = [];
  engine.subscribe(() => states.push(engine.getSnapshot()));

  await engine.upload([file]);
  const final = engine.getSnapshot();

  // ---- the file record ----
  expect(final.files).toHaveLength(1);
  const uploaded: S3UploadedFile = final.files[0];

  expect(uploaded.name).toBe(file.name);
  expect(uploaded.size).toBe(file.size);
  expect(uploaded.status).toBe("success");
  expect(uploaded.progress).toBe(100);
  expect(uploaded.key).toBeTruthy();
  expect(uploaded.url).toBeTruthy();
  expect(uploaded.id).toBeTruthy();
  expect(uploaded.error).toBeUndefined();
  expect(uploaded.errorCode).toBeUndefined();

  // ---- batch state ----
  expect(final.isUploading).toBe(false);
  expect(final.errors).toEqual([]);
  expect(final.progress).toBe(100);

  // ---- observable transitions ----
  const statuses = states.map((s) => s.files[0]?.status).filter(Boolean);
  expect(statuses).toContain("uploading");
  expect(statuses[statuses.length - 1]).toBe("success");

  // ---- progress reporting ----
  expect(progressValues).toContain(0);
  expect(progressValues[progressValues.length - 1]).toBe(100);
  // Monotonic: a bar that goes backwards is a visible defect.
  for (let i = 1; i < progressValues.length; i++) {
    expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
  }

  return { uploaded, final, server };
}

describe("surface parity between single-PUT and multipart", () => {
  it("small file — single PUT — satisfies the standard surface", async () => {
    const { server } = await expectStandardSurface(makeFile(1 * MIB));

    // Confirms the strategy actually taken, so a parity pass cannot be an
    // accident of both files going down the same path.
    expect(server.actions).toContain("presign");
    expect(server.actions).not.toContain("multipart-init");
  });

  it("large file — multipart — satisfies the identical surface", async () => {
    const { server } = await expectStandardSurface(makeFile(12 * MIB));

    expect(server.actions).toContain("multipart-init");
    expect(server.actions).toContain("multipart-complete");
    expect(server.actions).not.toContain("presign");
  });

  it("returns the same field set from both strategies", async () => {
    // Not just "the fields we asserted" — the whole shape, so a field added to
    // one path and not the other is caught.
    const small = await expectStandardSurface(makeFile(1 * MIB));
    const large = await expectStandardSurface(makeFile(12 * MIB));

    const shape = (f: S3UploadedFile) =>
      Object.keys(f)
        .filter((k) => f[k as keyof S3UploadedFile] !== undefined)
        .sort();

    const only = (a: string[], b: string[]) => a.filter((k) => !b.includes(k));
    expect(
      {
        onlyMultipart: only(shape(large.uploaded), shape(small.uploaded)),
        onlySinglePut: only(shape(small.uploaded), shape(large.uploaded)),
      },
      "field sets must match"
    ).toEqual({ onlyMultipart: [], onlySinglePut: [] });
  });

  it("mixes both strategies in one batch, in order", async () => {
    // The realistic case: a video and its thumbnail submitted together.
    const { engine } = buildEngine();

    await engine.upload([
      makeFile(12 * MIB, "video.bin"),
      makeFile(1 * MIB, "thumb.bin"),
    ]);

    const { files, progress, errors } = engine.getSnapshot();

    expect(files.map((f) => f.name)).toEqual(["video.bin", "thumb.bin"]);
    expect(files.every((f) => f.status === "success")).toBe(true);
    expect(progress).toBe(100);
    expect(errors).toEqual([]);
  });
});

describe("multipart mechanics, observed only through the public surface", () => {
  it("splits into the expected number of parts", async () => {
    const { engine, signedParts } = buildEngine();

    await engine.upload([makeFile(12 * MIB)]);

    // 12 MiB at 5 MiB parts → 5 + 5 + 2.
    expect(signedParts.sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("respects the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const server = createServer();

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: server.fetcher,
      multipart: { threshold: 6 * MIB, partSize: 5 * MIB, concurrency: 2 },
      transport: async ({ body, onProgress }: any) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        onProgress?.(body.size, body.size);
        inFlight--;
        return { etag: '"e"' };
      },
    });

    // 26 MiB → 6 parts, so an unbounded implementation would peak at 6.
    await engine.upload([makeFile(26 * MIB)]);

    expect(peak).toBeLessThanOrEqual(2);
  });

  it("retries a transient part failure without failing the file", async () => {
    const { engine } = buildEngine({
      server: { failParts: new Set([2]) },
    });

    await engine.upload([makeFile(12 * MIB)]);

    const { files, errors } = engine.getSnapshot();
    expect(files[0].status).toBe("success");
    expect(errors).toEqual([]);
  });

  it("aborts the session when a part fails permanently", async () => {
    // Abandoned parts are billed until removed, and AWS never expires them.
    const server = createServer();

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: server.fetcher,
      multipart: { threshold: 6 * MIB, partSize: 5 * MIB },
      transport: async () => {
        throw new Error("permanent failure");
      },
    });

    await engine.upload([makeFile(12 * MIB)]);

    expect(server.actions).toContain("multipart-abort");
    expect(engine.getSnapshot().files[0].status).toBe("error");
  });

  it("reports a missing ETag as a CORS problem, not a mystery", async () => {
    // A cross-origin response header is invisible to JavaScript unless the
    // bucket exposes it. Without this the failure surfaces much later as
    // InvalidPart, with nothing pointing at the cause.
    const server = createServer();

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: server.fetcher,
      multipart: { threshold: 6 * MIB, partSize: 5 * MIB },
      transport: async ({ body, onProgress }: any) => {
        onProgress?.(body.size, body.size);
        return {}; // no etag, exactly as a misconfigured bucket behaves
      },
    });

    await engine.upload([makeFile(12 * MIB)]);

    expect(engine.getSnapshot().files[0].error).toContain("ExposeHeaders");
  });

  it("surfaces server metadata, like the single-PUT path", async () => {
    const { engine } = buildEngine();

    await engine.upload([makeFile(12 * MIB)]);

    expect(engine.getSnapshot().files[0].metadata).toEqual({
      serverSaid: "hello",
    });
  });
});

describe("configuration", () => {
  it("keeps every file on a single PUT when multipart is disabled", async () => {
    const server = createServer();

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: server.fetcher,
      transport: server.transport,
      multipart: { enabled: false, threshold: 6 * MIB },
    });

    await engine.upload([makeFile(12 * MIB)]);

    expect(server.actions).toContain("presign");
    expect(server.actions).not.toContain("multipart-init");
  });

  it("uses the single-PUT path by default for ordinary files", async () => {
    // With no multipart config at all, the 100 MiB default threshold means
    // nothing an existing user uploads changes strategy.
    const server = createServer();

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: server.fetcher,
      transport: server.transport,
    });

    await engine.upload([makeFile(12 * MIB)]);

    expect(server.actions).toContain("presign");
    expect(server.actions).not.toContain("multipart-init");
  });
});
