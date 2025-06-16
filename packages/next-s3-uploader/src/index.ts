/**
 * next-s3-uploader - Client-side exports
 *
 * This is the main entry point for client-side functionality.
 * Import server-side functionality from 'next-s3-uploader/server'
 */

// ========================================
// CLIENT-SIDE HOOKS
// ========================================

// Modern hooks (recommended)
export { useS3RouteUpload, useS3UploadRoute } from "./core/route-hooks-v2";

// Legacy hook (deprecated - use useS3UploadRoute instead)
export { useS3FileUpload } from "./core/hooks";

// ========================================
// TYPES & INTERFACES
// ========================================

// Upload result types
export type {
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3UploadedFile,
} from "./core/route-hooks-v2";

// Configuration types (for TypeScript IntelliSense)
export type {
  AWSProviderConfig,
  CloudflareR2Config,
  DigitalOceanSpacesConfig,
  GoogleCloudStorageConfig,
  MinIOConfig,
  ProviderConfig,
} from "./core/providers";

// Legacy config type
export type { S3UploadConfig } from "./core/hooks";

// Schema inference types
export type { InferS3Input, InferS3Output } from "./core/schema";

// ========================================
// UTILITY FUNCTIONS
// ========================================

// File size and time formatting utilities
export { formatETA, formatUploadSpeed } from "./core/route-hooks-v2";

// ========================================
// CONFIGURATION (Client-safe)
// ========================================

// Provider configurations (for setup reference)
export { providers } from "./core/providers";

// Upload configuration utilities
export { createUploadConfig, uploadConfig } from "./core/upload-config";
