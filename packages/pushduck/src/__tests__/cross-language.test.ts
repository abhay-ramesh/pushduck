/**
 * @fileoverview The JavaScript client against the Go server.
 *
 * This is the claim the protocol exists to support, tested rather than
 * asserted: a JavaScript frontend and a Go backend, sharing no code, moving
 * real bytes into real storage.
 *
 * Everything else stops short of it. The conformance suite proves both servers
 * obey the protocol, but it drives them with hand-built requests rather than
 * the client. The interop tests prove the signatures and keys agree, but
 * compute them in isolation. Only this exercises the actual upload engine —
 * presign, transfer, completion, and the whole multipart handshake — against a
 * server written in another language.
 *
 * Requires the Go server and MinIO:
 *
 *     cd packages/pushduck-go && go run ./cmd/minio-server
 *     pnpm minio
 *
 * Skips — genuinely — when either is unreachable, so a contributor without Go
 * installed is not blocked.
 */

import { describe, expect, it } from "vitest";
import { uploadFiles } from "../core/upload";
import { MIB } from "../core/upload/multipart/limits";
import { createFetchTransport } from "../core/upload/transport";
import { createUploadConfig } from "../core/config/upload-config";
import { createStorage } from "../core/storage/storage-api";

const GO_SERVER = process.env.GO_SERVER ?? "http://localhost:4321/api/upload";
const MINIO = process.env.MINIO_ENDPOINT ?? "http://127.0.0.1:9010";

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

const available =
  (await reachable(GO_SERVER)) && (await reachable(`${MINIO}/minio/health/live`));

if (!available) {
  console.warn(
    `[cross-language] Go server or MinIO unreachable — suite SKIPPED.\n` +
      `  cd packages/pushduck-go && go run ./cmd/minio-server\n` +
      `  pnpm minio`
  );
}

/**
 * Bytes whose value encodes their own offset.
 *
 * A mismatch then reports *where* assembly went wrong rather than only that it
 * did — the difference between "part 2 landed at the wrong offset" and
 * "contents differ".
 */
function patterned(size: number): Uint8Array<ArrayBuffer> {
  // Allocated from an explicit ArrayBuffer: a plain `new Uint8Array(n)` is
  // typed over `ArrayBufferLike`, which TypeScript will not accept as a
  // `BlobPart` because it admits SharedArrayBuffer.
  const bytes = new Uint8Array(new ArrayBuffer(size));
  for (let i = 0; i < size; i++) bytes[i] = i % 251;
  return bytes;
}

function firstDifference(a: Uint8Array, b: Uint8Array): number | null {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return null;
}

/**
 * Reads an object back, signing the request with the TypeScript implementation.
 *
 * Deliberately not through either server: the point is what actually landed in
 * storage, so the verification path shares nothing with the upload path.
 */
async function readBack(key: string): Promise<Uint8Array> {
  const { config } = createUploadConfig()
    .provider("minio", {
      endpoint: MINIO,
      bucket: "test-uploads",
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
      region: "us-east-1",
      useSSL: false,
    })
    .build();

  const url = await createStorage(config).download.presignedUrl(key, 120);
  const response = await fetch(url);
  expect(response.status, `download ${key}`).toBe(200);
  return new Uint8Array(await response.arrayBuffer());
}

const transport = createFetchTransport();

describe.skipIf(!available)("JavaScript client against the Go server", () => {
  it("uploads a small file through the single-PUT path", async () => {
    const bytes = patterned(4096);
    const name = `js-to-go-${Date.now()}.bin`;

    const result = await uploadFiles({
      files: [new File([bytes], name, { type: "application/octet-stream" })],
      route: "bigUpload",
      endpoint: GO_SERVER,
      transport,
    } as never);

    expect(result.failedFiles).toEqual([]);
    expect(result.files[0].status).toBe("success");

    const stored = await readBack(result.files[0].key!);
    expect(firstDifference(stored, bytes)).toBeNull();
  }, 60_000);

  it("uploads a large file through the full multipart handshake", async () => {
    // 12 MiB at 5 MiB parts — three parts including a short final one. Every
    // multipart action crosses the language boundary: init, sign, the part
    // PUTs, and complete.
    const bytes = patterned(12 * MIB);
    const name = `js-to-go-multi-${Date.now()}.bin`;

    const result = await uploadFiles({
      files: [new File([bytes], name, { type: "application/octet-stream" })],
      route: "bigUpload",
      endpoint: GO_SERVER,
      transport,
      multipart: { threshold: 6 * MIB, partSize: 5 * MIB, concurrency: 3 },
    } as never);

    expect(result.failedFiles).toEqual([]);
    expect(result.files[0].status).toBe("success");

    const stored = await readBack(result.files[0].key!);
    expect(stored.length).toBe(bytes.length);
    expect(firstDifference(stored, bytes)).toBeNull();
  }, 120_000);

  it("assembles an odd-sized object correctly across the boundary", async () => {
    // Not a multiple of the part size: where an off-by-one in either
    // implementation's range arithmetic truncates or overruns the object.
    const bytes = patterned(13 * MIB + 7777);
    const name = `js-to-go-odd-${Date.now()}.bin`;

    const result = await uploadFiles({
      files: [new File([bytes], name, { type: "application/octet-stream" })],
      route: "bigUpload",
      endpoint: GO_SERVER,
      transport,
      multipart: { threshold: 6 * MIB, partSize: 5 * MIB, concurrency: 2 },
    } as never);

    const stored = await readBack(result.files[0].key!);
    expect(stored.length).toBe(bytes.length);
    expect(firstDifference(stored, bytes)).toBeNull();
  }, 120_000);

  it("surfaces the Go server's validation as a per-file failure", async () => {
    // The Go server enforces its own constraints, and the client must read
    // them exactly as it reads the TypeScript server's: an entry marked failed
    // inside a 200, not an exception and not a 4xx.
    const oversized = new File([patterned(6 * MIB)], "too-big.jpg", {
      type: "image/jpeg",
    });

    const result = await uploadFiles({
      files: [oversized],
      route: "imageUpload", // 5 MB limit on the Go side
      endpoint: GO_SERVER,
      transport,
      multipart: { enabled: false },
    } as never).catch(() => null);

    // Resolves rather than throwing: a per-file rejection is a reported
    // outcome, and `failedFiles` is where the client puts it.
    expect(result, "the batch should settle, not throw").not.toBeNull();
    expect(result!.failedFiles).toHaveLength(1);
    expect(String(result!.failedFiles[0].error)).toMatch(/exceeds maximum/i);
  }, 60_000);

  it("reports an unknown route as a typed error, not a crash", async () => {
    const result = await uploadFiles({
      files: [new File([patterned(16)], "a.bin")],
      route: "noSuchRoute",
      endpoint: GO_SERVER,
      transport,
    } as never).catch((error: unknown) => error);

    // The client turns the Go server's RFC 9457 document into the same typed
    // error it produces for the TypeScript server.
    expect(String(result)).toMatch(/not found/i);
  }, 60_000);
});
