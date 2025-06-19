/**
 * pushduck - Server-side exports
 *
 * This file provides all server-side functionality for API routes and server components.
 * Import client-side functionality from 'pushduck'
 */

// ========================================
// CONFIGURATION & INITIALIZATION
// ========================================

// Provider system
export {
  getProviderEndpoint,
  providers,
  validateProviderConfig,
} from "./core/providers";

// Upload configuration
export {
  createUploadConfig,
  getUploadConfig,
  uploadConfig,
} from "./core/upload-config";

// ========================================
// SCHEMA BUILDERS
// ========================================

// Schema classes and builders
export {
  S3ArraySchema,
  S3FileSchema,
  S3ImageSchema,
  S3ObjectSchema,
  S3Schema,
} from "./core/schema";

// Main s3 builder instance
export { s3 } from "./core/upload-config";

// ========================================
// ROUTER SYSTEM
// ========================================

// Modern router (recommended)
export { S3Route, createS3Handler, createS3Router } from "./core/router-v2";

// Router types
export type { S3Router } from "./types";

// ========================================
// S3 CLIENT & UTILITIES
// ========================================

// S3 client functionality
export {
  checkFileExists,
  createS3Client,
  generateFileKey,
  generatePresignedUploadUrl,
  generatePresignedUploadUrls,
  getFileUrl,
  resetS3Client,
  uploadFileToS3,
  validateS3Connection,
} from "./core/s3-client";

// ========================================
// TYPES & INTERFACES
// ========================================

// Configuration types
export type {
  AWSProviderConfig,
  BaseProviderConfig,
  CloudflareR2Config,
  DigitalOceanSpacesConfig,
  GoogleCloudStorageConfig,
  MinIOConfig,
  ProviderConfig,
} from "./core/providers";

// Upload configuration types
export type {
  UploadConfigBuilder,
  UploadInitResult,
} from "./core/upload-config";

// Router types
export type {
  GetRoute,
  InferRouteInput,
  InferRouteMetadata,
  InferRouteOutput,
  InferRouterRoutes,
  S3LifecycleContext,
  S3LifecycleHook,
  S3Middleware,
  S3MiddlewareContext,
  S3RouteContext,
  S3RouterDefinition,
} from "./core/router-v2";

// Schema types
export type {
  InferS3Input,
  InferS3Output,
  S3FileConstraints,
} from "./core/schema";

// S3 client types
export type {
  FileKeyOptions,
  PresignedUrlOptions,
  PresignedUrlResult,
  ProgressCallback,
  UploadProgress,
} from "./core/s3-client";

// Legacy config types removed - use modern provider config types instead
