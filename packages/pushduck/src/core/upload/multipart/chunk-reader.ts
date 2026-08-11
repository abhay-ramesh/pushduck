/**
 * @fileoverview Reading one part's bytes without holding the whole file.
 *
 * ## Why this exists
 *
 * On the web, `blob.slice(start, end)` is free: a `Blob` is a handle to bytes
 * the browser already has on disk, and a slice is another handle into the same
 * bytes. Nothing is copied, and a 5 GiB file costs no more resident memory than
 * a 5 MiB one. So the web needs no abstraction at all.
 *
 * React Native is the opposite. An asset arrives as a `file://` URI, and the
 * only portable way to turn that into a `Blob` is `fetch(uri).blob()` — which
 * reads the entire file into memory before the first part is sent. For the
 * exact case multipart exists to serve, a 500 MB video on a phone, that is
 * fatal: the app is killed by the OS before a single byte reaches the network.
 *
 * The fix is to stop treating "the bytes" as a value and start treating it as a
 * **range-addressable source**. Multipart never needs the whole file — it needs
 * `[start, end)`, one part at a time. {@link ChunkReader} is that narrowing, and
 * it is deliberately the smallest interface that admits both worlds:
 *
 * - {@link createBlobChunkReader} wraps a `Blob` and slices. Zero-copy, and what
 *   every web upload uses.
 * - {@link createRangeChunkReader} wraps any "give me these bytes" function, so
 *   a platform that can read a byte range off disk — React Native via
 *   expo-file-system, Node via `fs.createReadStream` — reads only the part in
 *   flight.
 *
 * ## Why the reader is injected rather than detected
 *
 * pushduck does not depend on expo-file-system, and must not: it is one of
 * several file APIs in the React Native ecosystem, it is a native module that
 * cannot be imported in a web bundle, and requiring it would make every web
 * consumer pay for a dependency they cannot use. So the reader is a parameter,
 * exactly like `transport`, `fetcher`, `store` and `now`. The library ships the
 * shape and the base64 arithmetic; the app supplies the four lines that bind it
 * to whichever file API it already has.
 */

import { UploadError } from "../../errors";

/**
 * What a reader hands back for one part.
 *
 * Narrower than `BodyInit` on purpose. A part is bytes, never a string, form
 * or stream, and TypeScript excludes `SharedArrayBuffer`-backed views from
 * `BodyInit` — so pinning the buffer type here keeps the transport boundary
 * free of casts.
 */
export type ChunkBody = Blob | Uint8Array<ArrayBuffer>;

/**
 * A range-addressable source of bytes.
 *
 * Implementations must be safe to call concurrently — multipart reads several
 * parts at once — and must return exactly the requested range.
 */
export interface ChunkReader {
  /** Total bytes available. Part planning derives from this. */
  readonly size: number;

  /**
   * Reads `[start, end)`.
   *
   * `end` is exclusive, matching `Blob.slice` and `Array.slice`, and is clamped
   * to {@link size} by callers before it arrives here.
   */
  read(start: number, end: number): Promise<ChunkBody>;

  /**
   * Releases anything held open, called once the upload settles.
   *
   * Optional: a blob-backed reader has nothing to release. A reader holding a
   * file descriptor or a temporary copy does.
   */
  close?(): Promise<void> | void;
}

/**
 * The web implementation: slice a `Blob`.
 *
 * `Blob.slice` is a view, not a copy, so this holds no more memory than the
 * handle it was given regardless of file size.
 */
export function createBlobChunkReader(blob: Blob): ChunkReader {
  return {
    size: blob.size,
    async read(start, end) {
      return blob.slice(start, end);
    },
  };
}

/**
 * Builds a reader from any function that can produce a byte range.
 *
 * This is the seam for every non-web platform. The caller supplies `size`
 * — known from the picker's asset metadata, never by reading the file — and a
 * `readRange` that returns the bytes for `[start, end)`.
 *
 * The returned bytes are verified against the requested length, because a
 * silently short read is the worst possible failure here: the part uploads, the
 * object completes, and the file is corrupt with nothing having errored. Better
 * to fail the upload than to write a truncated object.
 *
 * @example Reading byte ranges in React Native, without loading the file
 * ```typescript
 * import * as FileSystem from "expo-file-system";
 * import { createRangeChunkReader, decodeBase64 } from "pushduck/react-native";
 *
 * const reader = createRangeChunkReader({
 *   size: asset.size,
 *   readRange: async (start, end) =>
 *     decodeBase64(
 *       await FileSystem.readAsStringAsync(asset.uri, {
 *         encoding: FileSystem.EncodingType.Base64,
 *         position: start,
 *         length: end - start,
 *       })
 *     ),
 * });
 * ```
 */
export function createRangeChunkReader(options: {
  size: number;
  readRange: (
    start: number,
    end: number
  ) => Promise<Uint8Array<ArrayBuffer> | ArrayBuffer>;
  close?: () => Promise<void> | void;
}): ChunkReader {
  const { size, readRange, close } = options;

  return {
    size,
    close,
    async read(start, end) {
      const expected = end - start;
      const bytes = await readRange(start, end);
      const view: Uint8Array<ArrayBuffer> =
        bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

      // A short read here becomes a truncated object that completes
      // successfully. Nothing downstream can detect it, so it is caught here.
      if (view.byteLength !== expected) {
        throw new UploadError(
          "INTERNAL_ERROR",
          `Chunk read returned ${view.byteLength} bytes for a ${expected}-byte range at offset ${start}`,
          { meta: { start, end, received: view.byteLength } }
        );
      }

      return view;
    },
  };
}

/**
 * Decodes base64 to bytes, without `atob` or `Buffer`.
 *
 * Every React Native file API that can read a byte range returns base64, so
 * decoding it is unavoidable. Neither obvious shortcut is portable: `Buffer`
 * does not exist in React Native without a polyfill, and `atob` was only added
 * to Hermes in React Native 0.74 — a version floor pushduck does not want to
 * impose on an app that is otherwise fine.
 *
 * So this is the arithmetic, done once, correctly: 4 base64 characters to 3
 * bytes, with the padding cases handled explicitly. Exported because the
 * alternative is every consumer writing it again in their `readRange`.
 */
export function decodeBase64(input: string): Uint8Array<ArrayBuffer> {
  const CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  // A reverse lookup table beats `CHARS.indexOf` per character, which is O(64)
  // each and runs millions of times for a large part.
  const lookup = new Uint8Array(256);
  for (let i = 0; i < CHARS.length; i++) lookup[CHARS.charCodeAt(i)] = i;

  // Whitespace is legal in base64 transport encodings and some file APIs wrap
  // long output, so it is stripped rather than decoded as data.
  const clean = input.replace(/[\s]/g, "");
  const unpadded = clean.endsWith("==")
    ? clean.length - 2
    : clean.endsWith("=")
      ? clean.length - 1
      : clean.length;

  const bytes = new Uint8Array(
    new ArrayBuffer(Math.floor((unpadded * 3) / 4))
  );

  let byte = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < unpadded; i++) {
    buffer = (buffer << 6) | lookup[clean.charCodeAt(i)];
    bits += 6;

    // Emit a byte as soon as 8 bits have accumulated, taking the high bits and
    // leaving the remainder for the next character.
    if (bits >= 8) {
      bits -= 8;
      bytes[byte++] = (buffer >> bits) & 0xff;
    }
  }

  return bytes;
}
