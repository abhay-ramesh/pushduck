/**
 * @fileoverview pushduck - Server-side exports
 *
 * This module provides all server-side functionality for API routes and server components.
 * It serves as the main entry point for server-side pushduck usage, offering:
 *
 * - **Provider Configuration**: Multi-cloud storage provider setup and validation
 * - **Schema System**: Type-safe file validation with runtime checking
 * - **Router System**: Request handling with middleware and lifecycle hooks
 * - **Storage API**: High-level and low-level storage operations
 * - **Utilities**: Health checks, metrics, logging, and error handling
 * - **Type Definitions**: Comprehensive TypeScript types for all APIs
 *
 * For client-side functionality (React hooks, upload components), import from 'pushduck' instead.
 *
 * @example Basic Server Setup
 * ```typescript
 * import { createUploadConfig, createProvider, s3 } from 'pushduck/server';
 *
 * // 1. Configure provider
 * const provider = createProvider('aws', {
 *   bucket: 'my-uploads',
 *   region: 'us-east-1',
 * });
 *
 * // 2. Create upload configuration
 * const config = createUploadConfig({
 *   provider,
 *   maxFileSize: '10MB',
 *   allowedFileTypes: ['image/*', 'application/pdf'],
 * });
 *
 * // 3. Define routes with validation
 * const router = s3.createRouter({
 *   profileImage: s3.image().max('2MB'),
 *   documents: s3.file().types(['application/pdf']).maxFiles(5),
 * }, config);
 * ```
 *
 * @example Advanced Router with Middleware
 * ```typescript
 * import { createUploadConfig, createProvider } from 'pushduck/server';
 *
 * const router = s3.createRouter({
 *   userFiles: s3.file()
 *     .max('50MB')
 *     .middleware(async ({ req }) => {
 *       // Authentication
 *       const user = await authenticateUser(req);
 *       return { userId: user.id, organizationId: user.orgId };
 *     })
 *     .paths({
 *       generateKey: ({ file, metadata }) =>
 *         `orgs/${metadata.organizationId}/users/${metadata.userId}/${file.name}`
 *     })
 *     .onUploadComplete(async ({ file, url, metadata }) => {
 *       // Database update
 *       await db.files.create({
 *         name: file.name,
 *         url,
 *         uploadedBy: metadata.userId,
 *       });
 *     }),
 * }, config);
 * ```
 *
 * @example Storage API Usage
 * ```typescript
 * import { createStorage, createProvider } from 'pushduck/server';
 *
 * const storage = createStorage(createProvider('aws', {
 *   bucket: 'my-bucket',
 *   region: 'us-east-1',
 * }));
 *
 * // High-level operations
 * const files = await storage.listFiles({ prefix: 'uploads/' });
 * const info = await storage.getFileInfo('uploads/document.pdf');
 * await storage.deleteFile('uploads/old-file.jpg');
 * ```
 *
 * @example Health Monitoring
 * ```typescript
 * import { runHealthCheck, metrics, logger } from 'pushduck/server';
 *
 * // Health checks
 * const health = await runHealthCheck();
 * if (!health.healthy) {
 *   logger.error('Storage health check failed', health.details);
 * }
 *
 * // Metrics monitoring
 * const stats = metrics.getAggregated();
 * logger.info('Upload metrics', {
 *   totalUploads: stats.uploadCount,
 *   averageSize: stats.averageFileSize,
 *   errorRate: stats.errorRate,
 * });
 * ```
 *
 */

// ========================================
// CONFIGURATION & INITIALIZATION
// ========================================

/**
 * Provider system for configuring cloud storage services.
 *
 * @example
 * ```typescript
 * import { createProvider, validateProviderConfig } from 'pushduck/server';
 *
 * const provider = createProvider('aws', {
 *   bucket: 'my-uploads',
 *   region: 'us-east-1',
 * });
 *
 * const validation = validateProviderConfig(provider);
 * if (!validation.valid) {
 *   console.error('Provider config errors:', validation.errors);
 * }
 * ```
 */
export {
  createProvider,
  getProviderEndpoint,
  validateProviderConfig,
} from "./core/providers";

/**
 * Upload configuration builder for creating type-safe upload settings.
 *
 * @example
 * ```typescript
 * import { createUploadConfig, createProvider } from 'pushduck/server';
 *
 * const config = createUploadConfig({
 *   provider: createProvider('aws', { bucket: 'uploads' }),
 *   maxFileSize: '10MB',
 *   allowedFileTypes: ['image/*', 'application/pdf'],
 *   paths: {
 *     prefix: 'user-uploads',
 *     generateKey: (file, metadata) => `${metadata.userId}/${file.name}`,
 *   },
 * });
 * ```
 */
export { createUploadConfig } from "./core/config/upload-config";

// ========================================
// SCHEMA BUILDERS
// ========================================

/**
 * Type-safe schema system for file validation and transformation.
 * Provides chainable API similar to Zod for defining upload constraints.
 *
 * @example Basic File Validation
 * ```typescript
 * import { S3FileSchema } from 'pushduck/server';
 *
 * const documentSchema = new S3FileSchema({
 *   maxSize: '10MB',
 *   allowedTypes: ['application/pdf', 'application/msword'],
 *   allowedExtensions: ['.pdf', '.doc', '.docx'],
 * });
 * ```
 *
 * @example Chainable Schema Building
 * ```typescript
 * import { s3 } from 'pushduck/server';
 *
 * const imageSchema = s3.image()
 *   .max('5MB')
 *   .types(['image/jpeg', 'image/png'])
 *   .refine(
 *     async ({ file }) => file.name.length <= 100,
 *     'Filename must be 100 characters or less'
 *   )
 *   .transform(async ({ file, metadata }) => ({
 *     originalName: file.name,
 *     uploadedAt: new Date().toISOString(),
 *     userId: metadata.userId,
 *   }));
 * ```
 *
 * @example Array and Object Schemas
 * ```typescript
 * const gallerySchema = s3.image().max('2MB').maxFiles(6);
 *
 * const formSchema = s3.object({
 *   avatar: s3.image().max('1MB'),
 *   documents: s3.file().types(['application/pdf']).maxFiles(5),
 * });
 * ```
 */
export {
  S3ArraySchema,
  S3FileSchema,
  S3ImageSchema,
  S3ObjectSchema,
  S3Schema,
} from "./core/schema";

// ========================================
// ROUTER SYSTEM
// ========================================

/**
 * Modern config-aware router system for handling file uploads.
 * Provides type-safe routing with middleware, lifecycle hooks, and automatic presigned URL generation.
 *
 * @example Basic Router Setup
 * ```typescript
 * import { createS3RouterWithConfig, S3Route, createUploadConfig } from 'pushduck/server';
 *
 * const router = createS3RouterWithConfig({
 *   profileImage: s3.image().max('2MB'),
 *   documents: s3.file().types(['application/pdf']).maxFiles(5),
 * }, config);
 *
 * // Use in Next.js API route
 * export const { GET, POST } = router.handlers;
 * ```
 *
 * @example Advanced Router with Middleware
 * ```typescript
 * const authenticatedRouter = createS3RouterWithConfig({
 *   userFiles: s3.file()
 *     .max('50MB')
 *     .middleware(async ({ req }) => {
 *       const user = await authenticateUser(req);
 *       return { userId: user.id, organizationId: user.orgId };
 *     })
 *     .paths({
 *       generateKey: ({ file, metadata }) =>
 *         `orgs/${metadata.organizationId}/users/${metadata.userId}/${file.name}`
 *     })
 *     .onUploadComplete(async ({ file, url, metadata }) => {
 *       await db.files.create({
 *         name: file.name,
 *         url,
 *         uploadedBy: metadata.userId,
 *       });
 *     }),
 * }, config);
 * ```
 */
export { createS3RouterWithConfig, S3Route } from "./core/router/router-v2";

/**
 * Router type definitions for type inference and route handling.
 */
export type { S3Router } from "./types";

// Framework adapters - import from specific adapter modules
// e.g. import { toNextJsHandler } from 'pushduck/adapters/nextjs'
// e.g. import { toExpressHandler } from 'pushduck/adapters/express'

// ========================================
// STORAGE API
// ========================================

/**
 * High-level object-style storage API for direct file operations.
 * Provides a clean interface for file management without dealing with upload routes.
 *
 * @example Basic Storage Operations
 * ```typescript
 * import { createStorage, createProvider } from 'pushduck/server';
 *
 * const storage = createStorage(createProvider('aws', {
 *   bucket: 'my-bucket',
 *   region: 'us-east-1',
 * }));
 *
 * // List files
 * const files = await storage.listFiles({ prefix: 'uploads/', limit: 50 });
 *
 * // Get file information
 * const info = await storage.getFileInfo('uploads/document.pdf');
 * console.log(`File size: ${info.size}, Last modified: ${info.lastModified}`);
 *
 * // Delete files
 * await storage.deleteFile('uploads/old-file.jpg');
 * await storage.deleteFiles(['file1.jpg', 'file2.png']);
 * ```
 *
 * @example Advanced Storage Operations
 * ```typescript
 * // Generate presigned URLs for direct uploads
 * const presignedUrl = await storage.generatePresignedUploadUrl('uploads/new-file.pdf', {
 *   expiresIn: 3600, // 1 hour
 *   conditions: {
 *     'content-type': 'application/pdf',
 *     'content-length-range': [0, 10485760], // Max 10MB
 *   },
 * });
 *
 * // Bulk operations
 * const deleteResult = await storage.deleteByPrefix('temp/');
 * console.log(`Deleted ${deleteResult.deletedCount} files`);
 * ```
 */
export { createStorage, StorageInstance } from "./core/storage/storage-api";

/**
 * Low-level S3 client for advanced usage and custom implementations.
 * Use the high-level storage API unless you need direct S3 client access.
 *
 * @example Custom S3 Client Usage
 * ```typescript
 * import { createS3Client } from 'pushduck/server';
 *
 * const s3Client = createS3Client(providerConfig);
 *
 * // Direct S3 operations
 * const command = new GetObjectCommand({
 *   Bucket: 'my-bucket',
 *   Key: 'path/to/file.jpg',
 * });
 *
 * const response = await s3Client.send(command);
 * ```
 */
export { createS3Client, resetS3Client } from "./core/storage/client";

// ========================================
// UTILITIES & HEALTH CHECKS
// ========================================

/**
 * Comprehensive error handling system with typed error categories.
 * Provides structured error handling for different failure scenarios.
 *
 * @example Error Handling
 * ```typescript
 * import { isPushduckError, isS3Error, wrapAsync } from 'pushduck/server';
 *
 * const safeUpload = wrapAsync(async (file) => {
 *   try {
 *     return await uploadFile(file);
 *   } catch (error) {
 *     if (isPushduckError(error)) {
 *       if (isS3Error(error)) {
 *         console.error('S3 operation failed:', error.context);
 *       } else {
 *         console.error('Pushduck error:', error.message);
 *       }
 *     }
 *     throw error;
 *   }
 * });
 * ```
 *
 * @example Custom Error Creation
 * ```typescript
 * import { createFileError, createConfigError } from 'pushduck/server';
 *
 * // File validation error
 * throw createFileError('File too large', {
 *   fileName: file.name,
 *   fileSize: file.size,
 *   maxSize: 10485760,
 * });
 *
 * // Configuration error
 * throw createConfigError('Invalid bucket name', {
 *   bucket: 'invalid-bucket-name',
 *   provider: 'aws',
 * });
 * ```
 */
export {
  createConfigError,
  createFileError,
  createNetworkError,
  createS3Error,
  isConfigError,
  isFileError,
  isPushduckError,
  isS3Error,
  PushduckError,
  wrapAsync,
} from "./core/types/errors";

/**
 * Performance monitoring and metrics collection system.
 * Tracks upload performance, error rates, and system health.
 *
 * @example Performance Tracking
 * ```typescript
 * import { trackOperation, metrics } from 'pushduck/server';
 *
 * // Track an operation
 * const stopTracking = trackOperation('file-upload', {
 *   fileName: 'document.pdf',
 *   fileSize: 1048576,
 * });
 *
 * try {
 *   await uploadFile();
 *   stopTracking.success();
 * } catch (error) {
 *   stopTracking.error(error);
 * }
 *
 * // Get aggregated metrics
 * const stats = metrics.getAggregated();
 * console.log(`Success rate: ${(1 - stats.errorRate) * 100}%`);
 * ```
 *
 * @example Manual Metrics Recording
 * ```typescript
 * import { recordOperation, startOperation, endOperation } from 'pushduck/server';
 *
 * const operationId = startOperation('batch-upload');
 *
 * // ... perform operations
 *
 * endOperation(operationId, { success: true, fileCount: 10 });
 *
 * // Or record directly
 * recordOperation('file-delete', 150, true, { fileName: 'old-file.jpg' });
 * ```
 */
export {
  endOperation,
  metrics,
  recordOperation,
  startOperation,
  trackOperation,
} from "./core/utils/metrics";

/**
 * Health check system for monitoring storage connectivity and performance.
 * Provides comprehensive health monitoring for production environments.
 *
 * @example Basic Health Check
 * ```typescript
 * import { runHealthCheck, getHealthReport } from 'pushduck/server';
 *
 * // Simple health check
 * const health = await runHealthCheck();
 * if (!health.healthy) {
 *   console.error('Storage health check failed:', health.details);
 *   // Alert monitoring system
 * }
 *
 * // Detailed health report
 * const report = await getHealthReport();
 * console.log('Health Report:', {
 *   overall: report.healthy ? 'HEALTHY' : 'UNHEALTHY',
 *   storage: report.checks.storage.status,
 *   latency: `${report.checks.storage.responseTime}ms`,
 * });
 * ```
 *
 * @example Health Monitoring Setup
 * ```typescript
 * import { healthChecker } from 'pushduck/server';
 *
 * // Set up periodic health checks
 * const checker = healthChecker({
 *   interval: 30000, // 30 seconds
 *   onHealthChange: (healthy) => {
 *     if (!healthy) {
 *       alertingSystem.sendAlert('Storage health check failed');
 *     }
 *   },
 * });
 *
 * checker.start();
 *
 * // Stop monitoring
 * process.on('SIGTERM', () => checker.stop());
 * ```
 */
export {
  getHealthReport,
  healthChecker,
  runHealthCheck,
} from "./core/utils/health-check";

/**
 * Structured logging system with configurable levels and contexts.
 *
 * @example Basic Logging
 * ```typescript
 * import { logger } from 'pushduck/server';
 *
 * logger.info('Upload completed', {
 *   fileName: 'document.pdf',
 *   fileSize: 1048576,
 *   userId: 'user123',
 * });
 *
 * logger.error('Upload failed', {
 *   error: error.message,
 *   fileName: 'document.pdf',
 *   userId: 'user123',
 * });
 *
 * logger.debug('Processing file', { stage: 'validation' });
 * ```
 */
export { logger } from "./core/utils/logger";

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
  ProviderType,
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
  DeleteByPrefixResult,
  DeleteError,
  DeleteFilesResult,
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

// Utility types
export type {
  PushduckErrorCode,
  PushduckErrorContext,
  PushduckResult,
} from "./core/types/errors";

export type { AggregatedMetrics, OperationMetrics } from "./core/utils/metrics";

export type { HealthCheck, HealthCheckResult } from "./core/utils/health-check";

export type { LogLevel } from "./core/utils/logger";

// Legacy config types removed - use modern provider config types instead
