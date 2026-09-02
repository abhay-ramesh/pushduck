/**
 * @fileoverview pushduck - React Native client
 *
 * Drop-in for `pushduck/client` in React Native and Expo apps.
 * The API is identical — `useUploadRoute` and `createUploadClient` work
 * exactly the same way. The only difference is that `uploadFiles` here
 * accepts `UploadInput[]` instead of `File[]`, so you can pass asset
 * objects from image and document pickers directly without any mapping.
 *
 * Supported picker shapes (pass result.assets directly, no mapping):
 * - expo-image-picker   → `{ uri, fileName?, mimeType?, fileSize? }`
 * - expo-document-picker → `{ uri, name, mimeType?, size? }`
 * - react-native-image-picker → `{ uri?, fileName?, type?, fileSize? }`
 *   (filter for `uri` first since rn-image-picker types it as optional)
 *
 * @example expo-image-picker — pass result.assets directly
 * ```typescript
 * import { useUploadRoute } from 'pushduck/react-native';
 * import * as ImagePicker from 'expo-image-picker';
 *
 * // endpoint must be an absolute URL — relative URLs do not work in React Native
 * const { uploadFiles, isUploading, progress } = useUploadRoute('avatarUpload', {
 *   endpoint: 'https://your-api.com/api/s3-upload',
 * });
 *
 * const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
 * if (!result.canceled) await uploadFiles(result.assets);
 * ```
 *
 * @example expo-document-picker — pass result.assets directly
 * ```typescript
 * import { useUploadRoute } from 'pushduck/react-native';
 * import * as DocumentPicker from 'expo-document-picker';
 *
 * const { uploadFiles } = useUploadRoute('documentUpload', {
 *   endpoint: 'https://your-api.com/api/s3-upload',
 * });
 *
 * const result = await DocumentPicker.getDocumentAsync({ type: '*\/*' });
 * if (result.assets) await uploadFiles(result.assets);
 * ```
 *
 * @example react-native-image-picker — filter for uri first
 * ```typescript
 * import { useUploadRoute } from 'pushduck/react-native';
 * import { launchImageLibrary } from 'react-native-image-picker';
 *
 * const { uploadFiles } = useUploadRoute('photoUpload', {
 *   endpoint: 'https://your-api.com/api/s3-upload',
 * });
 *
 * const result = await launchImageLibrary({ mediaType: 'photo' });
 * const assets = result.assets?.filter((a): a is typeof a & { uri: string } => !!a.uri);
 * if (assets?.length) await uploadFiles(assets);
 * ```
 *
 * @example createUploadClient (type-safe property-based access)
 * ```typescript
 * import { createUploadClient } from 'pushduck/react-native';
 * import type { AppRouter } from '@/lib/upload';
 *
 * const upload = createUploadClient<AppRouter>({ endpoint: 'https://api.example.com/upload' });
 *
 * function UploadScreen() {
 *   const { uploadFiles, progress, isUploading } = upload.avatarUpload();
 *
 *   const handlePick = async () => {
 *     const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
 *     if (!result.canceled) await uploadFiles(result.assets);
 *   };
 * }
 * ```
 */

// React Native exposes __DEV__ as a global boolean (true in dev builds, false in production).
// Declare it so TypeScript doesn't error; falls back to false in non-RN environments.
declare const __DEV__: boolean | undefined;

import {
  useUploadRoute as _useUploadRoute,
  createUploadClient as _createUploadClient,
  formatETA,
  formatUploadSpeed,
} from "./client";

import type {
  ClientConfig,
  RouterRouteNames,
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3Router,
  S3UploadedFile,
  TypedRouteHook,
  TypedUploadedFile,
  UploadInput,
  UploadRouteConfig,
} from "./types";

// ─── RN-specific result types ─────────────────────────────────────────────────

/**
 * Return type of `useUploadRoute` from `pushduck/react-native`.
 * Identical to `S3RouteUploadResult` except `uploadFiles` accepts `UploadInput[]`
 * instead of `File[]`.
 */
export interface RNRouteUploadResult extends Omit<S3RouteUploadResult, "uploadFiles"> {
  uploadFiles: (files: UploadInput[], metadata?: any) => Promise<void>;
}

/**
 * Return type of property-hook calls on the client from `pushduck/react-native`.
 * Identical to `TypedRouteHook` except `uploadFiles` accepts `UploadInput[]`.
 */
export interface RNTypedRouteHook<
  TRouter = any,
  TRouteName extends string = string,
> extends Omit<TypedRouteHook<TRouter, TRouteName>, "uploadFiles"> {
  uploadFiles: (files: UploadInput[], metadata?: any) => Promise<any[]>;
}

/** @internal */
type RNInferClientRouter<T> =
  T extends S3Router<infer TRoutes>
    ? {
        readonly [K in keyof TRoutes]: (
          options?: UploadRouteConfig
        ) => RNTypedRouteHook<T, K extends string ? K : string>;
      }
    : never;

// ─── Wrapper hooks ────────────────────────────────────────────────────────────

/**
 * React Native equivalent of `useUploadRoute` from `pushduck/client`.
 *
 * Identical API — same state shape, same progress/speed/ETA tracking,
 * same callbacks. The only difference: `uploadFiles` accepts `UploadInput[]`
 * so you can pass picker assets directly without mapping field names.
 */
export function useUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter>,
  config?: UploadRouteConfig
): RNRouteUploadResult;
export function useUploadRoute(
  routeName: string,
  config?: UploadRouteConfig
): RNRouteUploadResult;
export function useUploadRoute(
  routeName: string,
  config?: UploadRouteConfig
): RNRouteUploadResult {
  if (typeof __DEV__ !== 'undefined' && __DEV__ && (!config?.endpoint || config.endpoint.startsWith("/"))) {
    console.warn(
      "[pushduck/react-native] `endpoint` must be an absolute URL (e.g. \"https://api.example.com/api/s3-upload\"). " +
      "Relative URLs do not work in React Native and will cause a network error."
    );
  }
  return _useUploadRoute(routeName, config) as unknown as RNRouteUploadResult;
}

/**
 * React Native equivalent of `createUploadClient` from `pushduck/client`.
 *
 * Returns the same property-based client — each route property is a hook
 * factory. The difference: `uploadFiles` on each hook accepts `UploadInput[]`.
 */
export function createUploadClient<TRouter extends S3Router<any>>(
  config: ClientConfig
): RNInferClientRouter<TRouter> {
  return _createUploadClient<TRouter>(config) as unknown as RNInferClientRouter<TRouter>;
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

/**
 * Promise-based upload functions, re-exported for convenience.
 *
 * Framework-free: use them when an async-state library (TanStack Query, SWR)
 * should own loading and error state. Identical across every pushduck entry
 * point, so switching frameworks never changes this import.
 */
export {
  uploadFile,
  uploadFiles,
  UploadBatchError,
} from "./core/upload/upload-files";
export type {
  UploadFileOptions,
  UploadFilesOptions,
  UploadFilesResult,
} from "./core/upload/upload-files";

export { formatETA, formatUploadSpeed };

export type {
  UploadInput,
  ClientConfig,
  RouterRouteNames,
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3Router,
  S3UploadedFile,
  TypedRouteHook,
  TypedUploadedFile,
  UploadRouteConfig,
};

/**
 * The error type every pushduck failure uses.
 *
 * Built on HTTP status codes and RFC 9457 rather than any framework's error
 * convention — map `code`/`status` to your ecosystem's shape in your own code.
 */
export { isUploadError, UPLOAD_ERROR_CODES, UploadError } from "./core/errors";
export type { UploadErrorCode } from "./core/errors";

/**
 * Reading a large file one part at a time, rather than all at once.
 *
 * This matters more on React Native than anywhere else. The portable way to
 * turn a picker's `file://` URI into bytes is `fetch(uri).blob()`, which reads
 * the whole file into memory before the first part is sent — and a 500 MB
 * video, the exact case multipart exists for, gets the app killed by the OS.
 *
 * Pass a reader instead and only the parts in flight are resident. pushduck
 * does not depend on expo-file-system, so the binding is four lines in your app:
 *
 * @example
 * ```typescript
 * import * as FileSystem from "expo-file-system";
 * import { createRangeChunkReader, decodeBase64 } from "pushduck/react-native";
 *
 * const { uploadFiles } = useUploadRoute("videoUpload", {
 *   multipart: {
 *     store: createAsyncStore(),
 *     createChunkReader: (input, meta) =>
 *       "uri" in input
 *         ? createRangeChunkReader({
 *             size: meta.size,
 *             readRange: async (start, end) =>
 *               decodeBase64(
 *                 await FileSystem.readAsStringAsync(input.uri, {
 *                   encoding: FileSystem.EncodingType.Base64,
 *                   position: start,
 *                   length: end - start,
 *                 })
 *               ),
 *           })
 *         : undefined,
 *   },
 * });
 * ```
 */
export {
  createBlobChunkReader,
  createRangeChunkReader,
  decodeBase64,
} from "./core/upload/multipart/chunk-reader";
export type { ChunkBody, ChunkReader } from "./core/upload/multipart/chunk-reader";

/**
 * Remembering an interrupted upload.
 *
 * `createWebStore` is named for its default backing (`localStorage`) but takes
 * any storage implementation, so React Native binds it to `AsyncStorage` in
 * three lines rather than implementing `UploadStore` by hand.
 */
export {
  createMemoryStore,
  createWebStore,
} from "./core/upload/multipart/store";
export type {
  ResumableUpload,
  UploadStore,
} from "./core/upload/multipart/store";
