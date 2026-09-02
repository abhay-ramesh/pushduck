/**
 * @fileoverview Multipart under conditions nobody designs for.
 *
 * Multipart has a wide blast radius: a session that outlives its usefulness
 * costs money, a mis-sized part corrupts an object, and a client that trusts
 * the server's arithmetic can write past the end of a file. These tests are
 * deliberately adversarial — a hostile or merely buggy server, a file that
 * changes under the client, a provider that answers nonsense.
 *
 * Where a scenario has no single right answer, the assertion encodes the
 * choice: fail loudly rather than silently produce a wrong object.
 */

import { describe, expect, it, vi } from "vitest";
import { createUploadEngine } from "../core/upload";
import { MIB } from "../core/upload/multipart/limits";
import { createMemoryStore } from "../core/upload/multipart/store";
import { planMultipart } from "../core/upload/multipart/plan";

function makeFile(size: number, name = "big.bin"): File {
  // `lastModified` is pinned because it is part of the resume fingerprint. Left
  // to default it becomes `Date.now()`, every stored record misses, and the
  // resume tests below silently exercise a fresh upload instead.
  return new File([new Uint8Array(size)], name, {
    type: "application/octet-stream",
    lastModified: 0,
  });
}

/** A configurable server, so each scenario can misbehave in one specific way. */
function createServer(
  overrides: {
    partSize?: number;
    signResponse?: (partNumbers: number[]) => unknown;
    heldParts?: Array<{ partNumber: number; etag: string }>;
    failAction?: string;
  } = {}
) {
  const actions: string[] = [];
  const signedParts: number[] = [];
  const completedWith: Array<Array<{ partNumber: number; etag: string }>> = [];

  const fetcher = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const action =
      new URL(String(input), "http://x").searchParams.get("action") ?? "presign";
    actions.push(action);

    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const reply = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    if (action === overrides.failAction) {
      return reply(
        { type: "x", title: "nope", status: 500, code: "INTERNAL_ERROR" },
        500
      );
    }

    switch (action) {
      case "multipart-init":
        return reply({
          success: true,
          session: "session-1",
          key: `uploads/${body.file.name}`,
          partSize: overrides.partSize ?? 5 * MIB,
          metadata: {},
        });

      case "multipart-parts":
        return reply({ success: true, parts: overrides.heldParts ?? [] });

      case "multipart-sign":
        signedParts.push(...body.partNumbers);
        return reply(
          overrides.signResponse?.(body.partNumbers) ??
            body.partNumbers.map((partNumber: number) => ({
              partNumber,
              url: `https://storage.example/part/${partNumber}`,
            }))
        );

      case "multipart-complete":
        completedWith.push(body.parts);
        return reply({
          success: true,
          key: `uploads/${body.file.name}`,
          url: `https://cdn.example/uploads/${body.file.name}`,
        });

      default:
        return reply({ success: true });
    }
  });

  return { fetcher, actions, signedParts, completedWith };
}

/** Records the byte ranges actually transferred. */
function recordingTransport() {
  const sent: Array<{ partNumber: number; size: number }> = [];

  const transport = vi.fn(async ({ url, body, onProgress }: any) => {
    const partNumber = Number(url.split("/part/")[1]);
    sent.push({ partNumber, size: body.size });
    onProgress?.(body.size, body.size);
    return { etag: `"etag-${partNumber}"` };
  });

  return { transport, sent };
}

function buildEngine(
  server: ReturnType<typeof createServer>,
  transport: any,
  multipart: Record<string, unknown> = {}
) {
  return createUploadEngine({
    route: "upload",
    endpoint: "/api/upload",
    fetcher: server.fetcher,
    transport,
    multipart: {
      threshold: 6 * MIB,
      partSize: 5 * MIB,
      concurrency: 2,
      maxAttempts: 1,
      ...multipart,
    } as never,
  });
}

describe("a server that answers wrongly", () => {
  it("does not write past the end of the file when the server inflates partSize", async () => {
    // The client plans from the server's partSize. If it trusted a value larger
    // than intended, the last part's range would extend beyond the blob and the
    // object would be short — silently, since a short slice still uploads.
    const server = createServer({ partSize: 8 * MIB });
    const { transport, sent } = recordingTransport();

    await buildEngine(server, transport).upload([makeFile(20 * MIB)]);

    const total = sent.reduce((sum, part) => sum + part.size, 0);
    expect(total).toBe(20 * MIB);
    // No part may exceed what remains of the file.
    expect(Math.max(...sent.map((p) => p.size))).toBeLessThanOrEqual(8 * MIB);
  });

  it("fails rather than completing when the server signs nothing", async () => {
    // An empty sign response used to destructure to `undefined` and upload to
    // the string "undefined"; a completed object with garbage is worse than an
    // error.
    const server = createServer({ signResponse: () => [] });
    const { transport } = recordingTransport();

    const engine = buildEngine(server, transport);
    await engine.upload([makeFile(12 * MIB)]);

    const file = engine.getSnapshot().files[0];
    expect(file.status).toBe("error");
    // Diagnosable, not a raw destructuring TypeError — and above all, not a
    // PUT to the literal string "undefined", which some servers accept.
    expect(file.error).toMatch(/upload URL for part/i);
    expect(server.actions).toContain("multipart-abort");
    expect(transport).not.toHaveBeenCalled();
  });

  it("surfaces a server failure mid-upload, and cleans up", async () => {
    const server = createServer({ failAction: "multipart-complete" });
    const { transport } = recordingTransport();

    const engine = buildEngine(server, transport);
    await engine.upload([makeFile(12 * MIB)]);

    expect(engine.getSnapshot().files[0].status).toBe("error");
    expect(server.actions).toContain("multipart-abort");
  });

  it("still fails cleanly when even the abort fails", async () => {
    // Cleanup runs on the unhappy path, which is exactly when the network is
    // least reliable. A failing abort must not replace the original error or
    // produce an unhandled rejection.
    const server = createServer({ failAction: "multipart-sign" });
    server.fetcher.mockImplementation(async (input: RequestInfo) => {
      const action = new URL(String(input), "http://x").searchParams.get(
        "action"
      );
      if (action === "multipart-init") {
        return new Response(
          JSON.stringify({
            success: true,
            session: "s",
            key: "k",
            partSize: 5 * MIB,
            metadata: {},
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      // Everything else, including the abort, fails.
      throw new Error("network is gone");
    });

    const engine = buildEngine(server, recordingTransport().transport);
    await engine.upload([makeFile(12 * MIB)]);

    expect(engine.getSnapshot().files[0].status).toBe("error");
  });
});

describe("a stale or hostile resume record", () => {
  it("ignores held parts that fall outside the current plan", async () => {
    // A session belonging to a larger file would report parts the current plan
    // has no range for. Counting them would push progress past 100% and
    // complete with parts that do not belong to this object.
    const store = createMemoryStore();
    await store.set({
      session: "old",
      key: "k",
      partSize: 5 * MIB,
      totalSize: 12 * MIB,
      fingerprint: "upload:big.bin:12582912:0",
      route: "upload",
      createdAt: Date.now(),
    });

    const server = createServer({
      heldParts: [
        { partNumber: 1, etag: '"a"' },
        { partNumber: 99, etag: '"ghost"' }, // no such part in a 3-part plan
      ],
    });
    const { transport } = recordingTransport();

    const engine = buildEngine(server, transport, { store });
    await engine.upload([makeFile(12 * MIB)]);

    const state = engine.getSnapshot();
    expect(state.files[0].status).toBe("success");
    expect(state.progress).toBe(100);
    // Progress must never exceed the file, whatever the server claims.
    expect(state.files[0].progress).toBeLessThanOrEqual(100);

    // The real damage a ghost part does is downstream: forwarded to
    // CompleteMultipartUpload it is rejected as `InvalidPart`, after every
    // byte has already been transferred. It must never reach the request.
    const parts = server.completedWith[0];
    expect(parts.map((p) => p.partNumber).sort((a, b) => a - b)).toEqual([
      1, 2, 3,
    ]);
  });

  it("survives a provider that lists a part twice", async () => {
    const store = createMemoryStore();
    await store.set({
      session: "old",
      key: "k",
      partSize: 5 * MIB,
      totalSize: 12 * MIB,
      fingerprint: "upload:big.bin:12582912:0",
      route: "upload",
      createdAt: Date.now(),
    });

    const server = createServer({
      heldParts: [
        { partNumber: 1, etag: '"a"' },
        { partNumber: 1, etag: '"a"' },
      ],
    });

    const engine = buildEngine(server, recordingTransport().transport, { store });
    await engine.upload([makeFile(12 * MIB)]);

    expect(engine.getSnapshot().files[0].progress).toBeLessThanOrEqual(100);

    // A duplicate part number in the completion request is rejected by the
    // provider, so the listing must be deduplicated before it is believed.
    const numbers = server.completedWith[0].map((p) => p.partNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("re-uploads everything when the part listing fails", async () => {
    // Failing to read the listing must degrade to a full upload, never to a
    // completion that omits parts.
    const store = createMemoryStore();
    await store.set({
      session: "old",
      key: "k",
      partSize: 5 * MIB,
      totalSize: 12 * MIB,
      fingerprint: "upload:big.bin:12582912:0",
      route: "upload",
      createdAt: Date.now(),
    });

    const server = createServer({ failAction: "multipart-parts" });
    const { transport, sent } = recordingTransport();

    await buildEngine(server, transport, { store }).upload([makeFile(12 * MIB)]);

    expect(sent.map((p) => p.partNumber).sort()).toEqual([1, 2, 3]);
  });
});

describe("cancellation", () => {
  it("stops promptly and aborts the session", async () => {
    const server = createServer();
    let engine: ReturnType<typeof buildEngine>;

    const transport = vi.fn(async ({ url, body, onProgress }: any) => {
      const partNumber = Number(url.split("/part/")[1]);
      if (partNumber === 2) engine.cancelAll();
      onProgress?.(body.size, body.size);
      return { etag: `"e${partNumber}"` };
    });

    engine = buildEngine(server, transport, { concurrency: 1 });
    await engine.upload([makeFile(22 * MIB)]);

    const file = engine.getSnapshot().files[0];
    expect(file.status).toBe("error");
    expect(file.errorCode).toBe("UPLOAD_CANCELLED");
    expect(server.actions).toContain("multipart-abort");
  });

  it("does not retry a cancelled part", async () => {
    // Retrying after cancellation burns the user's bandwidth to reach the same
    // end, and on mobile that is metered data.
    const server = createServer();
    let attempts = 0;
    let engine: ReturnType<typeof buildEngine>;

    const transport = vi.fn(async () => {
      attempts++;
      engine.cancelAll();
      throw new Error("interrupted");
    });

    engine = buildEngine(server, transport, { concurrency: 1, maxAttempts: 5 });
    await engine.upload([makeFile(12 * MIB)]);

    expect(attempts).toBe(1);
  });
});

describe("degenerate configuration", () => {
  it("clamps concurrency above the part count", async () => {
    const server = createServer();
    const { transport, sent } = recordingTransport();

    await buildEngine(server, transport, { concurrency: 100 }).upload([
      makeFile(12 * MIB),
    ]);

    expect(sent).toHaveLength(3);
  });

  it("treats concurrency of zero as one rather than hanging", async () => {
    // A pool of zero workers would never drain the queue, and the upload would
    // hang forever with no error.
    const server = createServer();
    const { transport, sent } = recordingTransport();

    await buildEngine(server, transport, { concurrency: 0 }).upload([
      makeFile(12 * MIB),
    ]);

    expect(sent).toHaveLength(3);
  }, 10_000);

  it("still splits a file too large for a single PUT, even with multipart off", async () => {
    // `enabled: false` means "multipart is not worth it", not "attempt what
    // the provider rejects". Above 5 GiB a single PUT is not a legal option at
    // all, so honouring the opt-out there turns it into a broken upload with
    // an opaque `EntityTooLarge`.
    const server = createServer({ partSize: 5 * MIB });
    const { transport } = recordingTransport();

    // 6 GiB, declared rather than allocated. A reader supplies the ranges, so
    // no test needs six gigabytes of memory — and it is what a file this size
    // would realistically use anyway.
    const size = 6 * 1024 * MIB;
    const engine = buildEngine(server, transport, {
      enabled: false,
      createChunkReader: () => ({
        size,
        read: async (start: number, end: number) =>
          new Uint8Array(new ArrayBuffer(end - start)),
      }),
    });
    const huge = {
      uri: "file:///huge.bin",
      name: "huge.bin",
      size,
      mimeType: "application/octet-stream",
    };

    await engine.upload([huge as never]);

    expect(server.actions).toContain("multipart-init");
  });

  it("keeps an ordinary large file on a single PUT when multipart is off", async () => {
    // The opt-out must still work for everything below the hard ceiling.
    const server = createServer();
    const { transport } = recordingTransport();

    const engine = buildEngine(server, transport, { enabled: false });
    await engine.upload([makeFile(12 * MIB)]);

    expect(server.actions).not.toContain("multipart-init");
  });

  it("uploads a file exactly one byte over the threshold", async () => {
    const server = createServer();
    const { transport, sent } = recordingTransport();

    await buildEngine(server, transport).upload([makeFile(6 * MIB + 1)]);

    const total = sent.reduce((sum, p) => sum + p.size, 0);
    expect(total).toBe(6 * MIB + 1);
  });

  it("plans a single part when the file is smaller than one part", async () => {
    // Threshold below part size: multipart with exactly one part is legal, and
    // the final part has no minimum.
    const server = createServer();
    const { transport, sent } = recordingTransport();

    await buildEngine(server, transport, { threshold: 1 * MIB }).upload([
      makeFile(2 * MIB),
    ]);

    expect(sent).toHaveLength(1);
    expect(sent[0].size).toBe(2 * MIB);
  });
});

describe("assembly order", () => {
  it("completes with parts ascending even when they finish out of order", async () => {
    // Providers reject an unordered part list, and concurrency guarantees they
    // will finish out of order.
    const server = createServer();

    const transport = vi.fn(async ({ url, body, onProgress }: any) => {
      const partNumber = Number(url.split("/part/")[1]);
      // Later parts finish first.
      await new Promise((r) => setTimeout(r, (5 - partNumber) * 5));
      onProgress?.(body.size, body.size);
      return { etag: `"e${partNumber}"` };
    });

    await buildEngine(server, transport, { concurrency: 4 }).upload([
      makeFile(22 * MIB),
    ]);

    const parts = server.completedWith[0];
    expect(parts.map((p) => p.partNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it("sends each part's own ETag, not a shared one", async () => {
    // Mixing them up produces `InvalidPart`, or worse, an object assembled
    // from the wrong bytes.
    const server = createServer();
    const { transport } = recordingTransport();

    await buildEngine(server, transport).upload([makeFile(22 * MIB)]);

    const parts = server.completedWith[0];
    for (const part of parts) {
      expect(part.etag).toBe(`"etag-${part.partNumber}"`);
    }
  });
});

describe("planning invariants hold for the sizes actually used", () => {
  it("never plans a non-final part below the provider minimum", () => {
    // R2 and every other provider reject a short non-final part at completion,
    // after the bytes have already been transferred.
    for (const size of [6 * MIB, 12 * MIB, 22 * MIB, 100 * MIB + 1]) {
      const plan = planMultipart(size, { partSize: 5 * MIB, threshold: 0 });

      for (const part of plan.parts.slice(0, -1)) {
        expect(part.size).toBeGreaterThanOrEqual(5 * MIB);
      }
    }
  });
});
