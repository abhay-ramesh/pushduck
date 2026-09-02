/**
 * Centralized Type Definitions for pushduck
 *
 * This file consolidates all type definitions to prevent circular dependencies
 * and provide a single source of truth for types used across the library.
 */

// ========================================
// Core Upload Types
// ========================================

/**
 * Universal file input accepted by upload hooks.
 *
 * Accepts native browser `File` objects on web, and the asset shapes
 * returned directly by all major React Native pickers — no mapping needed.
 *
 * Supported out of the box (pass the picker result directly):
 * - **expo-image-picker** `ImagePickerAsset` → uses `fileName` + `mimeType` + `fileSize`
 * - **expo-document-picker** `DocumentPickerAsset` → uses `name` + `mimeType` + `size`
 * - **react-native-image-picker** `Asset` → uses `fileName` + `type` + `fileSize`
 *
 * @example Web
 * ```typescript
 * await uploadFiles(Array.from(e.target.files || []));
 * ```
 *
 * @example expo-image-picker (pass assets directly, no mapping)
 * ```typescript
 * const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
 * if (!result.canceled) await uploadFiles(result.assets);
 * ```
 *
 * @example expo-document-picker (pass assets directly, no mapping)
 * ```typescript
 * const result = await DocumentPicker.getDocumentAsync({ type: '*\/*' });
 * if (result.assets) await uploadFiles(result.assets);
 * ```
 *
 * @example react-native-image-picker (filter for uri first, then pass directly)
 * ```typescript
 * const result = await launchImageLibrary({ mediaType: 'photo' });
 * const assets = result.assets?.filter((a): a is typeof a & { uri: string } => !!a.uri);
 * if (assets?.length) await uploadFiles(assets);
 * ```
 */
export type UploadInput =
  | File
  | {
      /** Local file URI — required for all React Native uploads */
      uri: string;
      /** File name. expo-document-picker uses `name`; expo-image-picker and react-native-image-picker use `fileName` */
      name?: string | null;
      /** File name (alternative field). Used by expo-image-picker and react-native-image-picker */
      fileName?: string | null;
      /**
       * MIME type. expo-image-picker and expo-document-picker use `mimeType`.
       * Takes priority over `type` to avoid expo-image-picker's `type` field
       * which holds a media category ('image' | 'video'), not a MIME type.
       */
      mimeType?: string | null;
      /**
       * MIME type (alternative field). Used by react-native-image-picker.
       * Only used when `mimeType` is not present.
       */
      type?: string | null;
      /** File size in bytes. expo-document-picker uses `size` */
      size?: number | null;
      /** File size in bytes (alternative field). expo-image-picker and react-native-image-picker use `fileSize` */
      fileSize?: number | null;
    };

export interface S3UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  /**
   * Permanent storage path (e.g. 'uploads/user123/photo.jpg').
   * Store this in your database — it never expires.
   */
  storagePath?: string;
  /**
   * Public CDN URL if the bucket/provider has public access configured.
   * Store this in your database — it never expires.
   */
  publicUrl?: string;
  /**
   * Temporary presigned download URL — expires in ~1 hour.
   * Use for immediate display only. Do NOT store in your database.
   */
  presignedUrl?: string;
  /**
   * @deprecated Use `storagePath` instead. Will be removed in 1.0.0.
   * The S3 object key — same value as storagePath.
   */
  key?: string;
  /**
   * @deprecated Use `publicUrl` or `presignedUrl` instead. Will be removed in 1.0.0.
   * Previously returned the public URL; now ambiguous with presignedUrl.
   */
  url?: string;
  /**
   * Human-readable failure message.
   *
   * Safe to render directly. To *branch* on the failure, use
   * {@link S3UploadedFile.errorCode} — messages are for people and may change,
   * codes are stable.
   */
  error?: string;
  /**
   * Stable machine-readable failure code.
   *
   * Present whenever `status` is `"error"`. Lets a UI react to the specific
   * failure — offer re-authentication for `UNAUTHORIZED`, an upgrade prompt for
   * `QUOTA_EXCEEDED`, a retry for `NETWORK_ERROR` — without parsing a string.
   */
  errorCode?: import("../core/errors").UploadErrorCode;
  file?: File;
  /**
   * Metadata returned by the server for this file.
   *
   * This is the output of your route's middleware chain — whatever it returned
   * (user id, album id, generated record id) travels back with the presigned
   * URL and lands here, so the client can use it without a second round trip.
   *
   * Distinct from the *client* metadata passed into `uploadFiles(files, meta)`,
   * which is untrusted input to the middleware rather than its result.
   */
  metadata?: unknown;
  // ETA tracking
  uploadStartTime?: number;
  uploadSpeed?: number; // bytes per second
  eta?: number; // seconds remaining
}

export interface S3FileMetadata {
  name: string;
  size: number;
  type: string;
}

// Unified upload configuration interface
export interface UploadRouteConfig {
  endpoint?: string;
  fetcher?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  onStart?: (files: S3FileMetadata[]) => void | Promise<void>;
  /** Called when all uploads complete successfully. Preferred over onSuccess. */
  onComplete?: (results: S3UploadedFile[]) => void | Promise<void>;
  /** @deprecated Use onComplete instead. */
  onSuccess?: (results: S3UploadedFile[]) => void | Promise<void>;
  /**
   * Called when an upload fails.
   *
   * Receives an `UploadError`, so `error.code`, `error.status`,
   * `error.retryable`, and `error.meta` are available for branching. It is
   * still an `Error`, so a handler typed `(e: Error) => void` keeps working.
   */
  onError?: (error: import("../core/errors").UploadError) => void;
  onProgress?: (progress: number) => void;
}

/**
 * Advanced engine options, on top of {@link UploadRouteConfig}.
 *
 * Declared here rather than only in the engine so that every binding *and* the
 * property-based client accept an identical options object — otherwise
 * `upload.imageUpload({ transport })` would compile in Vue but not React.
 */
export interface UploadAdvancedConfig {
  /** Transport for the bytes-to-storage leg. Defaults to the XHR transport. */
  transport?: import("../core/upload/transport").UploadTransport;
  /** Clock source in milliseconds. Injectable for deterministic tests. */
  now?: () => number;
  /** Fetch used to read React Native local file URIs. */
  blobFetcher?: typeof fetch;
}

// Legacy aliases for backward compatibility
export type S3RouteUploadConfig = UploadRouteConfig;
export type RouteUploadOptions = UploadRouteConfig & UploadAdvancedConfig;

/**
 * Result object returned by upload hooks with client metadata support.
 *
 * @interface S3RouteUploadResult
 *
 * @remarks
 * This interface represents the state and control functions for file uploads.
 * The `uploadFiles` function now accepts optional metadata to pass client context.
 *
 * @example
 * ```typescript
 * const { uploadFiles, files, isUploading } = useUploadRoute('imageUpload');
 *
 * // Upload with metadata
 * await uploadFiles(selectedFiles, {
 *   albumId: album.id,
 *   tags: ['vacation']
 * });
 * ```
 */
export interface S3RouteUploadResult {
  /** Array of files with upload status and progress */
  files: S3UploadedFile[];

  /**
   * Upload files with optional client-side metadata.
   *
   * @param files - Array of File objects to upload
   * @param metadata - Optional metadata object (untrusted client data)
   *
   * @security
   * Metadata is untrusted. Server middleware must validate before use.
   *
   * @example
   * ```typescript
   * // Without metadata
   * await uploadFiles(files);
   *
   * // With metadata
   * await uploadFiles(files, { albumId: '123', tags: ['vacation'] });
   * ```
   */
  /**
   * Upload files and await the results directly.
   * Returns the completed file objects — no need to watch `files` state or use `onSuccess`.
   *
   * @example
   * ```typescript
   * const results = await uploadFiles(selectedFiles);
   * await db.save({ path: results[0].key });
   * ```
   */
  uploadFiles: (
    files: UploadInput[],
    metadata?: unknown
  ) => Promise<S3UploadedFile[]>;

  /**
   * Upload files and resolve with the results, rejecting on batch failure.
   *
   * Use this as a `mutationFn` for TanStack Query, tRPC, or SWR, or wherever an
   * async-state library should own loading and error state. The hook's
   * reactive `files` and `progress` remain live during the upload, so you get
   * both without tracking per-file state yourself.
   *
   * @throws {UploadBatchError} If the batch could not run at all.
   *
   * @example
   * ```typescript
   * const { uploadFilesAsync, files, progress } = useUploadRoute('imageUpload');
   *
   * const { mutate, isPending } = useMutation({
   *   mutationFn: uploadFilesAsync,
   *   onSuccess: () => utils.files.list.invalidate(),
   * });
   * ```
   */
  uploadFilesAsync: (
    files: UploadInput[],
    metadata?: unknown
  ) => Promise<{ files: S3UploadedFile[]; failedFiles: S3UploadedFile[] }>;

  /** Reset upload state and clear files */
  reset: () => void;

  /**
   * Abort a single in-flight upload, marking that file as errored.
   *
   * Files that already completed are unaffected; bytes already sent are
   * discarded, since a presigned PUT cannot be resumed.
   *
   * @param fileId - The `id` of the file to cancel, from `files[n].id`
   *
   * @example
   * ```typescript
   * {files.map((file) => (
   *   <div key={file.id}>
   *     {file.name}
   *     {file.status === 'uploading' && (
   *       <button onClick={() => cancel(file.id)}>Cancel</button>
   *     )}
   *   </div>
   * ))}
   * ```
   */
  cancel: (fileId: string) => void;

  /**
   * Abort every in-flight upload in the current batch.
   *
   * Unlike {@link S3RouteUploadResult.reset}, completed files and their results
   * are retained — only transfers still in progress are aborted.
   */
  cancelAll: () => void;

  /** Whether an upload is currently in progress */
  isUploading: boolean;

  /** Array of error messages from failed uploads */
  errors: string[];

  // Overall progress tracking across all files
  /** Overall progress percentage (0-100) across all files */
  progress?: number;

  /** Overall upload speed in bytes per second across all files */
  uploadSpeed?: number;

  /** Estimated time remaining in seconds for all files */
  eta?: number;
}

// ========================================
// Router Types
// ========================================

export interface S3Route<TSchema = any, TConstraints = any> {
  schema: TSchema;
  constraints?: TConstraints;
}

// S3Router is imported above and re-exported through usage

// ========================================
// Client Types
// ========================================

export interface ClientConfig {
  endpoint: string;
  fetcher?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  // Global defaults for route options
  defaultOptions?: RouteUploadOptions;
}

// Enhanced upload results with route-specific data
export interface TypedUploadedFile<TOutput = any> extends S3UploadedFile {
  metadata?: TOutput;
  constraints?: {
    maxSize?: string;
    formats?: readonly string[];
    dimensions?: { width?: number; height?: number };
  };
  routeName?: string;
}

/**
 * Enhanced hook return with route-specific types and metadata support.
 *
 * @template TRouter - Router type for route name inference
 * @template TRouteName - Specific route name string
 *
 * @interface TypedRouteHook
 *
 * @remarks
 * This interface extends S3RouteUploadResult with type-safe route names
 * and enhanced file metadata. Used by the property-based client API.
 *
 * @example
 * ```typescript
 * const { uploadFiles, routeName } = upload.imageUpload();
 *
 * // Type-safe route name
 * console.log(routeName); // 'imageUpload'
 *
 * // Upload with metadata
 * await uploadFiles(files, { albumId: '123' });
 * ```
 */
export interface TypedRouteHook<
  TRouter = any,
  TRouteName extends string = string,
> extends S3RouteUploadResult {
  /**
   * The route this client instance is bound to.
   *
   * Typed as a literal, so `upload.imageUpload().routeName` narrows to
   * `"imageUpload"` rather than widening to `string`.
   */
  routeName: TRouteName;
}


// ========================================
// Template Literal Types
// ========================================

// Import S3Router type before using it
import type { S3Router } from "../core/router/router-v2";

// Re-export for external use
export type { S3Router };

// Extract route names as string literal union
export type RouterRouteNames<T> =
  T extends S3Router<infer TRoutes> ? keyof TRoutes : never;

// Enhanced: Infer complete client interface from server router with optional configuration
// Each route property returns a hook factory function that accepts optional configuration
export type InferClientRouter<T> =
  T extends S3Router<infer TRoutes>
  ? {
    readonly [K in keyof TRoutes]: (
      options?: RouteUploadOptions
    ) => TypedRouteHook<T, K extends string ? K : string>;
  }
  : never;

// ========================================
// Provider-Neutral Type Aliases
// ========================================

/**
 * Provider-neutral alias for S3Router.
 * Works regardless of whether you use AWS S3, Cloudflare R2, MinIO, or any other provider.
 * @alias S3Router
 */
export type UploadRouter<TRoutes extends Record<string, any> = Record<string, any>> = S3Router<TRoutes>;

/**
 * Provider-neutral alias for S3UploadedFile.
 * @alias S3UploadedFile
 */
export type UploadedFile = S3UploadedFile;

/**
 * Provider-neutral alias for S3RouteUploadResult.
 * @alias S3RouteUploadResult
 */
export type UploadResult = S3RouteUploadResult;

/**
 * Provider-neutral alias for RouterRouteNames.
 * @alias RouterRouteNames
 */
export type RouteNames<T> = RouterRouteNames<T>;
