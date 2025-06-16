/**
 * next-s3-uploader - Client-only exports
 *
 * This file provides ONLY client-side functionality that can safely run in the browser.
 * Use this import when you want to be explicit about client-side usage.
 *
 * @example
 * import { useUploadRoute, createUploadClient } from 'next-s3-uploader/client'
 */

// ========================================
// ENHANCED CLIENT API (NEW)
// ========================================

export { createUploadClient } from "./client/upload-client";

export type {
  ClientConfig,
  InferClientRouter,
  RouterRouteNames,
  TypedRouteHook,
  TypedUploadedFile,
} from "./types";

// ========================================
// CLIENT-SIDE HOOKS (EXISTING)
// ========================================

export { useS3RouteUpload, useUploadRoute } from "./hooks/use-upload-route";

// Legacy hook removed - use useUploadRoute instead

// ========================================
// CLIENT-SAFE TYPES (EXISTING)
// ========================================

export type {
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3UploadedFile,
} from "./types";

// Legacy config type
export type { S3UploadConfig } from "./types";

// ========================================
// UTILITY FUNCTIONS (Client-safe)
// ========================================

export { formatETA, formatUploadSpeed } from "./hooks/use-upload-route";
