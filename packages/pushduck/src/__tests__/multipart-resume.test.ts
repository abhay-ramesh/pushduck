/**
 * @fileoverview Resuming an interrupted multipart upload.
 *
 * This is the feature multipart exists for on mobile. A network drop currently
 * restarts a 500 MB file from zero, on a metered connection; resume continues
 * from the parts that landed.
 *
 * The tests are weighted towards the ways resume can be *wrong* rather than the
 * happy path, because its failure mode is uniquely bad: stitching one file's
 * parts onto another produces an object that completes successfully and whose
 * contents are garbage. Nothing errors, and nobody notices until it is opened.
 */

import { describe, expect, it, vi } from "vitest";
import { createUploadEngine } from "../core/upload";
import {
  createMemoryStore,
  createWebStore,
  fingerprintFile,
} from "../core/upload/multipart/store";
import { MIB } from "../core/upload/multipart/limits";

function makeFile(size: number, name = "big.bin", lastModified = 1000): File {
  return new File([new Uint8Array(size)], name, {
    type: "application/octet-stream",
    lastModified,
  });
}

/**
 * A server that can be told to lose parts, so an interruption is reproducible.
 *
 * `heldParts` is what the provider actually holds — the authority a resume
 * reconciles against.
 */
function createServer() {
  const heldParts = new Map<number, string>();
  const actions: string[] = [];
  const signedParts: number[] = [];
  let sessionCount = 0;

  const fetcher = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const action =
      new URL(String(input), "http://x").searchParams.get("action") ?? "presign";
    actions.push(action);

    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const reply = (payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    switch (action) {
      case "multipart-init":
        sessionCount++;
        return reply({
          success: true,
          session: `session-${sessionCount}`,
          key: `uploads/${body.file.name}`,
          partSize: 5 * MIB,
          metadata: {},
        });

      case "multipart-parts":
        return reply({
          success: true,
          parts: [...heldParts.entries()]
            .map(([partNumber, etag]) => ({ partNumber, etag }))
            .sort((a, b) => a.partNumber - b.partNumber),
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

      default:
        return reply({ success: true });
    }
  });

  /** Records each part the provider "stores", and can fail on demand. */
  const makeTransport = (failFrom?: number) =>
    vi.fn(async ({ url, body, onProgress }: any) => {
      const partNumber = Number(url.split("/part/")[1]);

      if (failFrom !== undefined && partNumber >= failFrom) {
        throw new Error("network dropped");
      }

      onProgress?.(body.size, body.size);
      heldParts.set(partNumber, `"etag-${partNumber}"`);
      return { etag: `"etag-${partNumber}"` };
    });

  return { fetcher, makeTransport, heldParts, actions, signedParts, };
}

/** 22 MiB at 5 MiB parts → 5 parts. */
const FILE_SIZE = 22 * MIB;

function buildEngine(server: ReturnType<typeof createServer>, options: {
  store?: ReturnType<typeof createMemoryStore>;
  failFrom?: number;
} = {}) {
  return createUploadEngine({
    route: "videoUpload",
    endpoint: "/api/upload",
    fetcher: server.fetcher,
    transport: server.makeTransport(options.failFrom),
    multipart: {
      threshold: 6 * MIB,
      partSize: 5 * MIB,
      concurrency: 1, // deterministic ordering, so "parts 1-2 landed" is exact
      store: options.store,
      maxAttempts: 1,
    } as never,
  });
}

describe("resume", () => {
  it("continues from the parts the provider already holds", async () => {
    const store = createMemoryStore();
    const server = createServer();

    // First attempt: parts 1-2 land, part 3 onwards drops.
    const first = buildEngine(server, { store, failFrom: 3 });
    await first.upload([makeFile(FILE_SIZE)]);
    expect(first.getSnapshot().files[0].status).toBe("error");
    expect(server.heldParts.size).toBe(2);

    server.signedParts.length = 0;

    // Second attempt: same file, same store.
    const second = buildEngine(server, { store });
    await second.upload([makeFile(FILE_SIZE)]);

    expect(second.getSnapshot().files[0].status).toBe("success");
    // Only the missing parts are signed and transferred — the whole point.
    expect(server.signedParts.sort((a, b) => a - b)).toEqual([3, 4, 5]);
  });

  it("reuses the session rather than starting a new one", async () => {
    // A new session would orphan the already-uploaded parts, which are billed
    // until removed, and lose everything transferred so far.
    const store = createMemoryStore();
    const server = createServer();

    await buildEngine(server, { store, failFrom: 3 }).upload([
      makeFile(FILE_SIZE),
    ]);

    const initsBefore = server.actions.filter(
      (a) => a === "multipart-init"
    ).length;

    await buildEngine(server, { store }).upload([makeFile(FILE_SIZE)]);

    expect(
      server.actions.filter((a) => a === "multipart-init").length
    ).toBe(initsBefore);
  });

  it("reports progress that already accounts for the resumed parts", async () => {
    // Restarting the bar at 0% after a resume tells the user their transfer
    // was discarded, which is exactly the anxiety resume exists to remove.
    const store = createMemoryStore();
    const server = createServer();

    await buildEngine(server, { store, failFrom: 3 }).upload([
      makeFile(FILE_SIZE),
    ]);

    const progressValues: number[] = [];
    const engine = createUploadEngine({
      route: "videoUpload",
      endpoint: "/api/upload",
      fetcher: server.fetcher,
      transport: server.makeTransport(),
      onProgress: (p) => progressValues.push(p),
      multipart: {
        threshold: 6 * MIB,
        partSize: 5 * MIB,
        concurrency: 1,
        store,
      } as never,
    });

    await engine.upload([makeFile(FILE_SIZE)]);

    // 10 of 22 MiB were already held, so the first real report is well above 0.
    const meaningful = progressValues.filter((p) => p > 0);
    expect(meaningful[0]).toBeGreaterThan(30);
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  it("clears the record once the upload completes", async () => {
    // A stale record would resume into a session the provider has finished.
    const store = createMemoryStore();
    const server = createServer();
    const file = makeFile(FILE_SIZE);

    await buildEngine(server, { store }).upload([file]);

    const fingerprint = fingerprintFile(
      file,
      { name: file.name, size: file.size },
      "videoUpload"
    );
    await expect(store.get(fingerprint)).resolves.toBeUndefined();
  });
});

describe("resume must not corrupt", () => {
  it("refuses to resume into a different file with the same name", async () => {
    // The corruption case. Same name, different bytes: stitching the new
    // file's parts onto the old file's committed parts completes successfully
    // and produces garbage.
    const store = createMemoryStore();
    const server = createServer();

    await buildEngine(server, { store, failFrom: 3 }).upload([
      makeFile(FILE_SIZE, "report.pdf", 1000),
    ]);

    const initsBefore = server.actions.filter(
      (a) => a === "multipart-init"
    ).length;

    // Same name, different size and timestamp — a different file.
    await buildEngine(server, { store }).upload([
      makeFile(11 * MIB, "report.pdf", 9999),
    ]);

    // A *new* session, not a resume.
    expect(
      server.actions.filter((a) => a === "multipart-init").length
    ).toBe(initsBefore + 1);
  });

  it("distinguishes files that differ only by modification time", async () => {
    const a = makeFile(FILE_SIZE, "same.bin", 1000);
    const b = makeFile(FILE_SIZE, "same.bin", 2000);

    expect(
      fingerprintFile(a, { name: a.name, size: a.size }, "r")
    ).not.toBe(fingerprintFile(b, { name: b.name, size: b.size }, "r"));
  });

  it("scopes a record to its route", async () => {
    // A file uploaded through two routes lands at two keys; sharing a session
    // between them would write one object and report two.
    const file = makeFile(FILE_SIZE);

    expect(
      fingerprintFile(file, { name: file.name, size: file.size }, "routeA")
    ).not.toBe(
      fingerprintFile(file, { name: file.name, size: file.size }, "routeB")
    );
  });

  it("starts fresh when the provider has lost the session", async () => {
    // Providers expire abandoned uploads — 7 days on R2, 30 on Spaces. A
    // record can outlive the session it names.
    const store = createMemoryStore();
    const server = createServer();

    await buildEngine(server, { store, failFrom: 3 }).upload([
      makeFile(FILE_SIZE),
    ]);

    // The provider forgets everything.
    server.heldParts.clear();
    server.signedParts.length = 0;

    await buildEngine(server, { store }).upload([makeFile(FILE_SIZE)]);

    // All five parts re-uploaded, rather than completing with two missing.
    expect(server.signedParts.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("stores", () => {
  it("memory store round-trips and deletes", async () => {
    const store = createMemoryStore();
    const record = {
      session: "s",
      key: "k",
      partSize: 5 * MIB,
      totalSize: FILE_SIZE,
      fingerprint: "fp",
      route: "r",
      createdAt: 1,
    };

    await store.set(record);
    await expect(store.get("fp")).resolves.toEqual(record);

    await store.delete("fp");
    await expect(store.get("fp")).resolves.toBeUndefined();
  });

  it("web store ignores records past their age limit", async () => {
    // A provider may already have expired the session a stale record names.
    const backing = new Map<string, string>();
    const storage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
      removeItem: (k: string) => void backing.delete(k),
    };

    let clock = 0;
    const store = createWebStore({
      storage,
      maxAgeMs: 1000,
      now: () => clock,
    });

    await store.set({
      session: "s",
      key: "k",
      partSize: 5 * MIB,
      totalSize: FILE_SIZE,
      fingerprint: "fp",
      route: "r",
      createdAt: 0,
    });

    clock = 500;
    await expect(store.get("fp")).resolves.toBeDefined();

    clock = 2000;
    await expect(store.get("fp")).resolves.toBeUndefined();
    // Expired records are removed, not merely ignored.
    expect(backing.size).toBe(0);
  });

  it("web store degrades to no-resume when storage throws", async () => {
    // Private browsing and quota limits make storage throw. Losing a resume is
    // acceptable; breaking the upload it was meant to help is not.
    const store = createWebStore({
      storage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: () => {
          throw new Error("SecurityError");
        },
      },
    });

    await expect(store.set({} as never)).resolves.toBeUndefined();
    await expect(store.get("fp")).resolves.toBeUndefined();
    await expect(store.delete("fp")).resolves.toBeUndefined();
  });

  it("web store is safe to construct where localStorage does not exist", async () => {
    // Merely creating it during SSR must not throw.
    const store = createWebStore();
    await expect(store.get("fp")).resolves.toBeUndefined();
  });
});
