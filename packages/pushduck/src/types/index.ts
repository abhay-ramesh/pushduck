/**
 * Centralized Type Definitions for pushduck
 *
 * This file consolidates all type definitions to prevent circular dependencies
 * and provide a single source of truth for types used across the library.
 */

// ========================================
// Core Upload Types
// ========================================

export interface S3UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  url?: string;
  key?: string;
  presignedUrl?: string; // Temporary download URL (expires in 1 hour)
  error?: string;
  file?: File;
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
  onStart?: (files: S3FileMetadata[]) => void | Promise<void>;
  onSuccess?: (results: S3UploadedFile[]) => void | Promise<void>;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
}

// Legacy aliases for backward compatibility
export type S3RouteUploadConfig = UploadRouteConfig;
export type RouteUploadOptions = UploadRouteConfig;

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
  uploadFiles: (files: File[], metadata?: any) => Promise<void>;

  /** Reset upload state and clear files */
  reset: () => void;

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
> {
  /** Array of uploaded files with enhanced metadata */
  files: TypedUploadedFile[];

  /**
   * Upload files with optional client-side metadata.
   *
   * @param files - Array of File objects to upload
   * @param metadata - Optional metadata (untrusted client data)
   * @returns Promise resolving to array of upload results
   *
   * @security
   * Client metadata is untrusted and must be validated by server middleware.
   */
  uploadFiles: (files: File[], metadata?: any) => Promise<any[]>;

  /** Reset upload state */
  reset: () => void;

  /** Whether upload is in progress */
  isUploading: boolean;

  /** Array of error messages */
  errors: string[];

  /** Type-safe route name */
  routeName: TRouteName;

  // Overall progress tracking across all files
  /** Overall progress percentage (0-100) */
  progress?: number;

  /** Overall upload speed in bytes/second */
  uploadSpeed?: number;

  /** Estimated time remaining in seconds */
  eta?: number;
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

// Legacy types removed - use TypedRouteHook and ClientConfig instead
