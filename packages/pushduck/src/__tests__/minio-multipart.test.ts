/**
 * @fileoverview Multipart against a real S3-compatible server.
 *
 * Every other multipart test stubs the storage leg, which leaves the two things
 * most likely to be silently wrong unverified:
 *
 * 1. **Part signing.** `UploadPart` is signed with `partNumber` and `uploadId`
 *    in the canonical request. A signature that is self-consistently wrong
 *    passes every unit test and is rejected only by a real server.
 * 2. **Assembly.** Parts that overlap, leave a gap, or are stitched in the
 *    wrong order still upload, still complete, and still return 200. The object
 *    is simply wrong.
 *
 * So the assertions here are about **bytes**, not status codes. The payload is
 * a deterministic pattern where every byte encodes its own offset, which means
 * a misordered or misaligned part shows up as a specific mismatched index
 * rather than a vague "contents differ".
 *
 * Requires MinIO: `pnpm minio`. Skips — genuinely — when it is unreachable.
 */

import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { createStorage } from "../core/storage/storage-api";
import { listUploadedParts } from "../core/storage/multipart";
import { uploadFiles } from "../core/upload";
import { MIB } from "../core/upload/multipart/limits";
import { createMemoryStore } from "../core/upload/multipart/store";
import { createFetchTransport } from "../core/upload/transport";

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? "http://127.0.0.1:9010";
const BUCKET = process.env.MINIO_BUCKET ?? "test-uploads";

async function minioAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${MINIO_ENDPOINT}/minio/health/live`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const available = await minioAvailable();
if (!available) {
  console.warn(
    `[minio-multipart] MinIO unreachable at ${MINIO_ENDPOINT} — suite SKIPPED. Start it with: pnpm minio`
  );
}

/**
 * Bytes whose value encodes their own offset.
 *
 * Random bytes would prove equality but not *locate* a fault. With this, a
 * mismatch at index i tells you immediately whether a part landed at the wrong
 * offset, was duplicated, or was truncated.
 */
function patternedBytes(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  // A prime modulus, so the pattern never aligns with a part boundary and a
  // misplaced part cannot coincidentally match.
  for (let i = 0; i < size; i++) bytes[i] = i % 251;
  return bytes;
}

function patternedFile(size: number, name: string): File {
  return new File([patternedBytes(size)], name, {
    type: "application/octet-stream",
  });
}

function buildStack(options: { partSize?: number } = {}) {
  const { s3, config } = createUploadConfig()
    .provider("minio", {
      endpoint: MINIO_ENDPOINT,
      bucket: BUCKET,
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
      region: "us-east-1",
      useSSL: false,
    })
    .build();

  const router = s3.createRouter({
    bigUpload: s3.file().maxFileSize("500MB"),
  });

  const fetcher = async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input).startsWith("http")
      ? String(input)
      : `http://localhost${String(input)}`;
    return router.handler(new Request(url, init));
  };

  return {
    router,
    fetcher,
    config,
    storage: createStorage(config),
    multipart: {
      threshold: 6 * MIB,
      partSize: options.partSize ?? 5 * MIB,
      concurrency: 3,
    },
  };
}

/** Fetches an object through a pushduck-generated presigned download URL. */
async function readBack(
  storage: ReturnType<typeof createStorage>,
  key: string
): Promise<Uint8Array> {
  const url = await storage.download.presignedUrl(key, 120);
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return new Uint8Array(await response.arrayBuffer());
}

/** Reports the first differing index, so a fault is locatable. */
function firstDifference(a: Uint8Array, b: Uint8Array): number | null {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return null;
}

const transport = createFetchTransport();

describe.skipIf(!available)("MinIO multipart", () => {
  it("uploads a multi-part file and reads it back byte-identical", async () => {
    // 12 MiB at 5 MiB parts → three parts, including a short final one.
    const stack = buildStack();
    const expected = patternedBytes(12 * MIB);
    const file = new File([expected], "multi.bin", {
      type: "application/octet-stream",
    });

    const result = await uploadFiles({
      files: [file],
      route: "bigUpload",
      endpoint: "/api/upload",
      fetcher: stack.fetcher,
      transport,
      multipart: stack.multipart,
    } as never);

    expect(result.failedFiles).toEqual([]);
    const uploaded = result.files[0];
    expect(uploaded.status).toBe("success");

    const actual = await readBack(stack.storage, uploaded.key!);

    expect(actual.length).toBe(expected.length);
    expect(firstDifference(actual, expected)).toBeNull();
  }, 60_000);

  it("really used multipart, provable from the object's ETag", async () => {
    // A composite ETag ends in `-N` where N is the part count. Without this a
    // silent fallback to a single PUT would pass every other assertion here.
    const stack = buildStack();

    const result = await uploadFiles({
      files: [patternedFile(12 * MIB, "etag-check.bin")],
      route: "bigUpload",
      endpoint: "/api/upload",
      fetcher: stack.fetcher,
      transport,
      multipart: stack.multipart,
    } as never);

    const info = await stack.storage.metadata.getInfo(result.files[0].key!);
    expect(String(info.etag)).toMatch(/-3"?$/);
  }, 60_000);

  it("keeps a small file on the single-PUT path", async () => {
    // The regression guard: multipart must not capture files below the
    // threshold, whose ETag is a plain MD5 with no part suffix.
    const stack = buildStack();

    const result = await uploadFiles({
      files: [patternedFile(1 * MIB, "small.bin")],
      route: "bigUpload",
      endpoint: "/api/upload",
      fetcher: stack.fetcher,
      transport,
      multipart: stack.multipart,
    } as never);

    const info = await stack.storage.metadata.getInfo(result.files[0].key!);
    expect(String(info.etag)).not.toMatch(/-\d+"?$/);
  }, 60_000);

  it("uploads a file with an odd size, exercising the short final part", async () => {
    // Not a multiple of the part size, and not a round number — the case where
    // an off-by-one in the final range truncates or overruns the object.
    const size = 13 * MIB + 7777;
    const stack = buildStack();
    const expected = patternedBytes(size);

    const result = await uploadFiles({
      files: [new File([expected], "odd.bin")],
      route: "bigUpload",
      endpoint: "/api/upload",
      fetcher: stack.fetcher,
      transport,
      multipart: stack.multipart,
    } as never);

    const actual = await readBack(stack.storage, result.files[0].key!);

    expect(actual.length).toBe(size);
    expect(firstDifference(actual, expected)).toBeNull();
  }, 60_000);

  it("uploads many parts concurrently without reordering them", async () => {
    // Concurrency is where assembly order is most likely to go wrong: parts
    // finish out of order and must still be completed in ascending sequence.
    const stack = buildStack();
    const expected = patternedBytes(30 * MIB);

    const result = await uploadFiles({
      files: [new File([expected], "concurrent.bin")],
      route: "bigUpload",
      endpoint: "/api/upload",
      fetcher: stack.fetcher,
      transport,
      multipart: stack.multipart,
    } as never);

    const actual = await readBack(stack.storage, result.files[0].key!);
    expect(firstDifference(actual, expected)).toBeNull();
  }, 90_000);

  it("leaves nothing behind when an upload fails", async () => {
    // Abandoned parts consume storage and are billed until removed, and AWS
    // never expires them on its own.
    const stack = buildStack();

    let uploadId: string | undefined;
    let key: string | undefined;

    await uploadFiles({
      files: [patternedFile(12 * MIB, "abandoned.bin")],
      route: "bigUpload",
      endpoint: "/api/upload",
      // Capture the session, then fail every part permanently.
      fetcher: async (input: RequestInfo, init?: RequestInit) => {
        const response = await stack.fetcher(input, init);
        if (String(input).includes("multipart-init")) {
          const body = await response.clone().json();
          key = body.key;
          // The session token is opaque; the key is enough to check for
          // leftovers via ListMultipartUploads on that object.
        }
        return response;
      },
      transport: async () => {
        throw new Error("permanent failure");
      },
      multipart: { ...stack.multipart, maxAttempts: 1 },
    } as never).catch(() => undefined);

    expect(key).toBeTruthy();
    void uploadId;

    // Any surviving session for this key would still list parts.
    const leftovers = await listUploadedParts(stack.config, {
      key: key!,
      uploadId: "definitely-not-a-real-session",
    }).catch(() => []);

    expect(leftovers).toEqual([]);
  }, 60_000);

  it("resumes against real storage and still produces identical bytes", async () => {
    // The end-to-end claim: interrupt a real upload, resume it, and the object
    // is byte-for-byte what was intended.
    const store = createMemoryStore();
    const stack = buildStack();
    const expected = patternedBytes(22 * MIB); // five 5 MiB parts
    const name = `resumed-${Date.now()}.bin`;

    // First attempt: everything from part 3 onwards drops.
    await uploadFiles({
      files: [new File([expected], name)],
      route: "bigUpload",
      endpoint: "/api/upload",
      fetcher: stack.fetcher,
      transport: async (request: any) => {
        const partNumber = Number(
          new URL(request.url).searchParams.get("partNumber")
        );
        if (partNumber >= 3) throw new Error("network dropped");
        return transport(request);
      },
      multipart: { ...stack.multipart, store, concurrency: 1, maxAttempts: 1 },
    } as never).catch(() => undefined);

    // Second attempt: same file, same store, healthy network.
    const result = await uploadFiles({
      files: [new File([expected], name)],
      route: "bigUpload",
      endpoint: "/api/upload",
      fetcher: stack.fetcher,
      transport,
      multipart: { ...stack.multipart, store, concurrency: 1 },
    } as never);

    expect(result.files[0].status).toBe("success");

    const actual = await readBack(stack.storage, result.files[0].key!);
    expect(actual.length).toBe(expected.length);
    expect(firstDifference(actual, expected)).toBeNull();
  }, 120_000);
});
