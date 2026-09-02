/**
 * @fileoverview Normalisation of upload inputs across web and React Native.
 *
 * The web passes `File` objects. React Native pickers pass asset objects whose
 * field names differ per library (`name` vs `fileName`, `size` vs `fileSize`,
 * `mimeType` vs `type`). This module is the single place that reconciles them,
 * so every framework binding — web or native — feeds the engine the same shape.
 *
 * Pure and dependency-free apart from the ambient `File`/`fetch` globals, which
 * are probed defensively rather than assumed.
 */

import type { UploadInput } from "../../types";

/**
 * The three fields the presign request needs, resolved from any input shape.
 */
export interface NormalizedInputMeta {
  name: string;
  size: number;
  type: string;
}

/**
 * Platform-safe `File` check.
 *
 * Guards against React Native and Node runtimes where `File` may be undefined,
 * where a bare `instanceof` would throw a ReferenceError.
 */
export function isFile(input: unknown): input is File {
  return typeof File !== "undefined" && input instanceof File;
}

/**
 * Returns true only for strings that look like a valid MIME type.
 *
 * expo-image-picker's `type` field returns `'image' | 'video'` — a media
 * category, not a MIME type. react-native-image-picker's `type` field returns
 * `'image/jpeg'` — a real MIME type. The presence of a slash distinguishes them.
 */
export function isMimeType(value: string | null | undefined): value is string {
  return !!value && value.includes("/");
}

/**
 * Normalizes any {@link UploadInput} into the three fields the server needs.
 *
 * Field resolution order:
 * - `name`: `name` (expo-document-picker) → `fileName` (expo-image-picker,
 *   react-native-image-picker) → `'upload'`
 * - `type`: first of `mimeType` or `type` that contains a `/` →
 *   `'application/octet-stream'`
 * - `size`: `size` (expo-document-picker) → `fileSize` (expo-image-picker,
 *   react-native-image-picker) → `0`
 *
 * A resolved size of `0` signals "unknown" and causes the engine to resolve the
 * blob eagerly so the presign request carries a real byte count.
 */
export function getInputMeta(input: UploadInput): NormalizedInputMeta {
  if (isFile(input)) {
    return { name: input.name, size: input.size, type: input.type };
  }

  const type = isMimeType(input.mimeType)
    ? input.mimeType
    : isMimeType(input.type)
      ? input.type
      : "application/octet-stream";

  return {
    name: input.name ?? input.fileName ?? "upload",
    type,
    size: input.size ?? input.fileSize ?? 0,
  };
}

/**
 * Resolves an {@link UploadInput} to a `Blob` for transmission.
 *
 * `File` extends `Blob`, so web inputs pass through untouched. React Native URI
 * assets are fetched from the local filesystem and converted.
 *
 * Only `file://` URIs are supported. `content://` URIs (Android) are not
 * readable via `fetch` in React Native — pass `copyToCacheDirectory: true`
 * (the default) to expo-document-picker to receive a `file://` URI instead.
 *
 * @param input - The file or React Native asset to resolve
 * @param fetchImpl - Fetch implementation used to read local URIs. Injectable
 *   so tests and non-browser runtimes can substitute their own.
 * @throws {Error} If given a `content://` URI, with remediation guidance.
 */
export async function toBlob(
  input: UploadInput,
  fetchImpl: typeof fetch = fetch
): Promise<Blob> {
  if (isFile(input)) return input;

  if (input.uri.startsWith("content://")) {
    throw new Error(
      "[pushduck] Cannot read content:// URIs. Pass copyToCacheDirectory: true (the default) " +
        "to expo-document-picker so it returns a file:// URI instead."
    );
  }

  const response = await fetchImpl(input.uri);
  return response.blob();
}
