/**
 * next-s3-uploader - Client-only exports
 *
 * This file provides ONLY client-side functionality that can safely run in the browser.
 * Use this import when you want to be explicit about client-side usage.
 *
 * @example
 * import { useS3UploadRoute } from 'next-s3-uploader/client'
 */

// ========================================
// CLIENT-SIDE HOOKS ONLY
// ========================================

export { useS3RouteUpload, useS3UploadRoute } from "./core/route-hooks-v2";

// Legacy hook (deprecated)
export { useS3FileUpload } from "./core/hooks";

// ========================================
// CLIENT-SAFE TYPES
// ========================================

export type {
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3UploadedFile,
} from "./core/route-hooks-v2";

// Legacy config type
export type { S3UploadConfig } from "./core/hooks";

// ========================================
// UTILITY FUNCTIONS (Client-safe)
// ========================================

export { formatETA, formatUploadSpeed } from "./core/route-hooks-v2";
