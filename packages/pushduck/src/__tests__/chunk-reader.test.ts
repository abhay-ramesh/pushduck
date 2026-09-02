/**
 * @fileoverview Reading parts without holding the whole file.
 *
 * Two things are worth testing here and the rest is plumbing:
 *
 * 1. **The base64 decoder is byte-exact.** It is hand-rolled because neither
 *    `Buffer` nor `atob` is portable to React Native, and a decoder that is
 *    subtly wrong produces an object that uploads and completes with corrupt
 *    contents. It is checked against Node's `Buffer` across every padding case
 *    and the full byte range.
 *
 * 2. **The reader seam actually avoids loading the file.** The entire point is
 *    that a 500 MB video on a phone is never materialised, so the test asserts
 *    the fallback path is not taken — not merely that the upload succeeded.
 */

import { describe, expect, it, vi } from "vitest";
import { createUploadEngine } from "../core/upload";
import {
  createBlobChunkReader,
  createRangeChunkReader,
  decodeBase64,
} from "../core/upload/multipart/chunk-reader";
import { MIB } from "../core/upload/multipart/limits";

describe("decodeBase64", () => {
  it("matches Node's decoder across every padding case", () => {
    // Lengths 0-32 cover all three residues mod 3, so every padding branch
    // ("==", "=", none) is exercised repeatedly rather than incidentally.
    for (let length = 0; length <= 32; length++) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) bytes[i] = (i * 37 + length) % 256;

      const encoded = Buffer.from(bytes).toString("base64");

      expect(Array.from(decodeBase64(encoded)), `length ${length}`).toEqual(
        Array.from(bytes)
      );
    }
  });

  it("round-trips every byte value", () => {
    // A lookup table with one wrong entry corrupts exactly one byte value and
    // would survive any test using text or a short fixture.
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;

    const decoded = decodeBase64(Buffer.from(all).toString("base64"));
    expect(Array.from(decoded)).toEqual(Array.from(all));
  });

  it("tolerates the line wrapping some file APIs add", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const wrapped = Buffer.from(bytes)
      .toString("base64")
      .replace(/(.{4})/g, "$1\n");

    expect(Array.from(decodeBase64(wrapped))).toEqual(Array.from(bytes));
  });

  it("decodes an empty string to no bytes", () => {
    expect(decodeBase64("").byteLength).toBe(0);
  });
});

describe("createBlobChunkReader", () => {
  it("returns exactly the requested range", async () => {
    const bytes = new Uint8Array(100);
    for (let i = 0; i < 100; i++) bytes[i] = i;

    const reader = createBlobChunkReader(new Blob([bytes]));
    expect(reader.size).toBe(100);

    const chunk = (await reader.read(10, 20)) as Blob;
    expect(new Uint8Array(await chunk.arrayBuffer())).toEqual(
      bytes.slice(10, 20)
    );
  });
});

describe("createRangeChunkReader", () => {
  const source = new Uint8Array(new ArrayBuffer(1000));
  for (let i = 0; i < 1000; i++) source[i] = i % 251;

  it("reads only the requested range, never the whole file", async () => {
    const readRange = vi.fn(async (start: number, end: number) =>
      source.slice(start, end)
    );
    const reader = createRangeChunkReader({ size: source.length, readRange });

    const chunk = await reader.read(300, 400);

    expect(chunk).toEqual(source.slice(300, 400));
    expect(readRange).toHaveBeenCalledWith(300, 400);
  });

  it("accepts a raw ArrayBuffer as well as a view", async () => {
    // expo-file-system and friends variously return one or the other.
    const reader = createRangeChunkReader({
      size: source.length,
      readRange: async (start, end) => source.slice(start, end).buffer,
    });

    expect(await reader.read(0, 10)).toEqual(source.slice(0, 10));
  });

  it("rejects a short read rather than uploading a truncated part", async () => {
    // The failure this exists to prevent: a part that is silently short
    // uploads, completes, and produces a corrupt object with nothing having
    // errored.
    const reader = createRangeChunkReader({
      size: source.length,
      readRange: async (start, end) => source.slice(start, end - 1),
    });

    await expect(reader.read(0, 100)).rejects.toThrow(
      /returned 99 bytes for a 100-byte range/
    );
  });

  it("rejects an over-long read too", async () => {
    const reader = createRangeChunkReader({
      size: source.length,
      readRange: async () => source.slice(0, 500),
    });

    await expect(reader.read(0, 100)).rejects.toThrow(/500 bytes/);
  });

  it("passes close through, so a handle can be released", async () => {
    const close = vi.fn();
    const reader = createRangeChunkReader({
      size: 10,
      readRange: async (start, end) => source.slice(start, end),
      close,
    });

    await reader.close?.();
    expect(close).toHaveBeenCalled();
  });
});

/** A server that answers the multipart handshake and nothing more. */
function createServer() {
  return vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const action =
      new URL(String(input), "http://x").searchParams.get("action") ?? "presign";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const reply = (payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    switch (action) {
      case "multipart-init":
        return reply({
          success: true,
          session: "s",
          key: "uploads/video.mp4",
          partSize: 5 * MIB,
          metadata: {},
        });
      case "multipart-parts":
        return reply({ success: true, parts: [] });
      case "multipart-sign":
        return reply(
          body.partNumbers.map((partNumber: number) => ({
            partNumber,
            url: `https://storage.example/part/${partNumber}`,
          }))
        );
      case "multipart-complete":
        return reply({
          success: true,
          key: "uploads/video.mp4",
          url: "https://cdn.example/uploads/video.mp4",
        });
      default:
        return reply({ success: true });
    }
  });
}

describe("the engine's reader seam", () => {
  const SIZE = 12 * MIB;

  /** A React Native picker asset: a URI and metadata, no bytes. */
  const asset = {
    uri: "file:///var/mobile/video.mp4",
    name: "video.mp4",
    size: SIZE,
    mimeType: "video/mp4",
  };

  function buildEngine(overrides: Record<string, unknown>) {
    return createUploadEngine({
      route: "videoUpload",
      endpoint: "/api/upload",
      fetcher: createServer(),
      transport: async ({ body }: any) => {
        // Every part must arrive as bytes, whatever produced them.
        expect(body.byteLength ?? body.size).toBeGreaterThan(0);
        return { etag: '"e"' };
      },
      multipart: {
        threshold: 6 * MIB,
        partSize: 5 * MIB,
        concurrency: 2,
        ...overrides,
      } as never,
    });
  }

  it("uploads from a reader without ever materialising the file", async () => {
    // The whole point. `blobFetcher` is the fallback that would read the file
    // into memory; on a 500 MB video that gets the app killed by the OS, so
    // the assertion is that it is never reached.
    const blobFetcher = vi.fn();
    const ranges: Array<[number, number]> = [];

    const engine = createUploadEngine({
      route: "videoUpload",
      endpoint: "/api/upload",
      fetcher: createServer(),
      blobFetcher: blobFetcher as never,
      transport: async () => ({ etag: '"e"' }),
      multipart: {
        threshold: 6 * MIB,
        partSize: 5 * MIB,
        concurrency: 1,
        createChunkReader: (_input: unknown, meta: { size: number }) =>
          createRangeChunkReader({
            size: meta.size,
            readRange: async (start, end) => {
              ranges.push([start, end]);
              return new Uint8Array(new ArrayBuffer(end - start));
            },
          }),
      } as never,
    });

    await engine.upload([asset as never]);

    expect(engine.getSnapshot().files[0].status).toBe("success");
    expect(blobFetcher).not.toHaveBeenCalled();

    // Three parts, contiguous, covering the file exactly once.
    expect(ranges).toEqual([
      [0, 5 * MIB],
      [5 * MIB, 10 * MIB],
      [10 * MIB, SIZE],
    ]);
  });

  it("closes the reader once the upload settles", async () => {
    const close = vi.fn();
    const engine = buildEngine({
      createChunkReader: (_i: unknown, meta: { size: number }) =>
        createRangeChunkReader({
          size: meta.size,
          readRange: async (start, end) =>
            new Uint8Array(new ArrayBuffer(end - start)),
          close,
        }),
    });

    await engine.upload([asset as never]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes the reader even when the upload fails", async () => {
    // A handle leaked per failed upload is how an app reaches its descriptor
    // limit, and failures are exactly when cleanup is skipped.
    const close = vi.fn();
    const engine = createUploadEngine({
      route: "videoUpload",
      endpoint: "/api/upload",
      fetcher: createServer(),
      transport: async () => {
        throw new Error("network dropped");
      },
      multipart: {
        threshold: 6 * MIB,
        partSize: 5 * MIB,
        maxAttempts: 1,
        createChunkReader: (_i: unknown, meta: { size: number }) =>
          createRangeChunkReader({
            size: meta.size,
            readRange: async (start, end) =>
              new Uint8Array(new ArrayBuffer(end - start)),
            close,
          }),
      } as never,
    });

    await engine.upload([asset as never]);

    expect(engine.getSnapshot().files[0].status).toBe("error");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("refuses to upload when the reader disagrees with the declared size", async () => {
    // A picker reporting a stale size would otherwise plan ranges the source
    // does not have, truncating the object with no error anywhere.
    const engine = buildEngine({
      createChunkReader: () =>
        createRangeChunkReader({
          size: SIZE - 1000,
          readRange: async (start, end) =>
            new Uint8Array(new ArrayBuffer(end - start)),
        }),
    });

    await engine.upload([asset as never]);

    const file = engine.getSnapshot().files[0];
    expect(file.status).toBe("error");
    expect(file.error).toMatch(/does not match the byte source/);
  });

  it("falls back to loading the file when the factory declines", async () => {
    // Returning undefined must mean "use the default", not "fail" — an app
    // supplies a reader for URI assets and lets web `File`s take the free path.
    const engine = buildEngine({ createChunkReader: () => undefined });

    await engine.upload([
      new File([new Uint8Array(SIZE)], "video.mp4") as never,
    ]);

    expect(engine.getSnapshot().files[0].status).toBe("success");
  });
});
