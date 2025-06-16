/**
 * Enhanced Client-Side Type Inference for next-s3-uploader
 *
 * This provides the new property-based access pattern:
 *
 * const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
 * const { uploadFiles } = upload.imageUpload; // Full type safety!
 */

// Enhanced client API
export { createUploadClient } from "./upload-client";

// Enhanced types
export type {
  ClientConfig,
  InferClientRouter,
  RouterRouteNames,
  TypedRouteHook,
  TypedUploadedFile,
} from "./types";

// Re-export existing hooks for backward compatibility
export { useS3RouteUpload, useS3UploadRoute } from "../core/route-hooks-v2";

// Re-export legacy hook from the right place
export { useS3FileUpload } from "../core/hooks";

// Re-export existing types for backward compatibility
export type {
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3UploadedFile,
} from "../core/route-hooks-v2";

// Re-export legacy type from the right place
export type { S3UploadConfig } from "../core/hooks";

// Utility functions
export { formatETA, formatUploadSpeed } from "../core/route-hooks-v2";
