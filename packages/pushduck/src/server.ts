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
} from "./core/config/upload-config";

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
export { s3 } from "./core/config/upload-config";

// ========================================
// ROUTER SYSTEM
// ========================================

// Modern router (recommended)
export {
  createS3Handler,
  createS3Router,
  S3Route,
} from "./core/router/router-v2";

// Router types
export type { S3Router } from "./types";

// ========================================
// STORAGE API
// ========================================

// Object-style storage API (recommended)
export { createStorage, StorageInstance } from "./core/storage/storage-api";

// Low-level S3 client (advanced usage)
export { createS3Client, resetS3Client } from "./core/storage/client";

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
} from "./core/config/upload-config";

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
} from "./core/router/router-v2";

// Schema types
export type {
  InferS3Input,
  InferS3Output,
  S3FileConstraints,
} from "./core/schema";

// Storage types (shared across storage API and client)
export type {
  FileInfo,
  FileInfoResult,
  FileKeyOptions,
  FileValidationResult,
  ListFilesOptions,
  ListFilesResult,
  PaginatedListOptions,
  PresignedUrlOptions,
  PresignedUrlResult,
  ProgressCallback,
  UploadProgress,
  ValidationRules,
} from "./core/storage";

// Legacy config types removed - use modern provider config types instead
