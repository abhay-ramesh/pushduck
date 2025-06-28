/**
 * @fileoverview Fixed File Router Architecture for pushduck
 *
 * This module implements the correct upload flow for S3-compatible storage:
 * 1. Client requests presigned URLs from the server
 * 2. Server generates presigned URLs with validation and metadata
 * 3. Client uploads files directly to S3 using presigned URLs
 * 4. Client notifies server of upload completion for post-processing
 *
 * The router system provides:
 * - Type-safe route definitions with schema validation
 * - Hierarchical path generation with global and route-level configuration
 * - Middleware support for authentication and request processing
 * - Lifecycle hooks for upload events (start, progress, complete, error)
 * - Automatic presigned URL generation and management
 *
 * @example Basic Router Setup
 * ```typescript
 * import { createUploadConfig, s3 } from 'pushduck/server';
 *
 * const config = createUploadConfig({
 *   provider: 'aws-s3',
 *   bucket: 'my-uploads',
 *   region: 'us-east-1',
 * });
 *
 * const router = s3.createRouter({
 *   profileImage: s3.image().max('2MB'),
 *   documents: s3.file().types(['application/pdf']).array({ max: 5 }),
 * }, config);
 * ```
 *
 * @example Advanced Router with Middleware
 * ```typescript
 * const authenticatedRouter = s3.createRouter({
 *   userFiles: s3.file()
 *     .max('10MB')
 *     .middleware(async ({ req }) => {
 *       const user = await authenticateUser(req);
 *       return { userId: user.id, organizationId: user.orgId };
 *     })
 *     .paths({
 *       prefix: 'user-uploads',
 *       generateKey: ({ file, metadata }) =>
 *         `${metadata.organizationId}/${metadata.userId}/${Date.now()}-${file.name}`
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
 *
 */

import { NextRequest } from "next/server";

import { UploadConfig } from "../config/upload-config";
import { createUniversalHandler } from "../handler/universal-handler";
import { InferS3Input, InferS3Output, S3Schema } from "../schema";
import {
  generateFileKey,
  generatePresignedUploadUrl,
  getFileUrl,
} from "../storage/client";

// ========================================
// Core Router Types
// ========================================

/**
 * Base context object for S3 route operations.
 * Contains the request object and optional metadata.
 *
 * @interface S3RouteContext
 */
export interface S3RouteContext {
  /** The incoming HTTP request */
  req: NextRequest;
  /** Optional metadata from middleware or other sources */
  metadata?: Record<string, any>;
}

/**
 * File metadata structure used throughout the upload process.
 * Contains essential information about the file being uploaded.
 *
 * @interface S3FileMetadata
 *
 * @example
 * ```typescript
 * const fileMetadata: S3FileMetadata = {
 *   name: 'document.pdf',
 *   size: 1048576, // 1MB in bytes
 *   type: 'application/pdf',
 * };
 * ```
 */
export interface S3FileMetadata {
  /** Original filename */
  name: string;
  /** File size in bytes */
  size: number;
  /** MIME type of the file */
  type: string;
}

/**
 * Extended context for middleware functions.
 * Includes file metadata along with request context.
 *
 * @interface S3MiddlewareContext
 * @extends S3RouteContext
 */
export interface S3MiddlewareContext extends S3RouteContext {
  /** Metadata about the file being processed */
  file: S3FileMetadata;
}

/**
 * Context object for lifecycle hooks.
 * Contains file information, metadata, and upload results.
 *
 * @template T - Type of the metadata object
 * @interface S3LifecycleContext
 *
 * @example
 * ```typescript
 * const lifecycleContext: S3LifecycleContext<{ userId: string }> = {
 *   file: { name: 'image.jpg', size: 500000, type: 'image/jpeg' },
 *   metadata: { userId: 'user123' },
 *   url: 'https://bucket.s3.amazonaws.com/path/to/image.jpg',
 *   key: 'path/to/image.jpg',
 * };
 * ```
 */
export interface S3LifecycleContext<T = any> {
  /** File metadata */
  file: S3FileMetadata;
  /** Processed metadata from middleware */
  metadata: T;
  /** Public URL of the uploaded file (available after upload) */
  url?: string;
  /** Storage key/path of the uploaded file */
  key?: string;
}

/**
 * Middleware function type for processing requests.
 * Middleware can authenticate, validate, or transform request data.
 *
 * @template TInput - Input metadata type
 * @template TOutput - Output metadata type
 *
 * @example Authentication Middleware
 * ```typescript
 * const authMiddleware: S3Middleware<{}, { userId: string }> = async ({ req }) => {
 *   const token = req.headers.get('authorization');
 *   const user = await verifyToken(token);
 *   return { userId: user.id };
 * };
 * ```
 */
export type S3Middleware<TInput = any, TOutput = any> = (
  ctx: S3MiddlewareContext & { metadata: TInput }
) => Promise<TOutput> | TOutput;

/**
 * Lifecycle hook function type for upload events.
 * Hooks are called at specific points in the upload process.
 *
 * @template T - Metadata type
 *
 * @example Upload Complete Hook
 * ```typescript
 * const onComplete: S3LifecycleHook<{ userId: string }> = async ({ file, url, metadata }) => {
 *   await logUpload(file.name, url, metadata.userId);
 * };
 * ```
 */
export type S3LifecycleHook<T = any> = (
  ctx: S3LifecycleContext<T>
) => Promise<void> | void;

// ========================================
// Hierarchical Path Configuration Types
// ========================================

/**
 * Context object provided to path generation functions.
 * Contains file information, metadata, and configuration for building file paths.
 *
 * @template TMetadata - Type of the metadata object
 * @interface PathContext
 *
 * @example
 * ```typescript
 * const pathContext: PathContext<{ userId: string, orgId: string }> = {
 *   file: { name: 'document.pdf', type: 'application/pdf' },
 *   metadata: { userId: 'user123', orgId: 'org456' },
 *   globalConfig: { prefix: 'uploads' },
 *   routeName: 'documents',
 * };
 * ```
 */
export interface PathContext<TMetadata = any> {
  /** File information */
  file: { name: string; type: string };
  /** Metadata from middleware */
  metadata: TMetadata;
  /** Global configuration settings */
  globalConfig: {
    /** Global path prefix */
    prefix?: string;
    /** Global key generation function */
    generateKey?: (
      file: { name: string; type: string },
      metadata: any
    ) => string;
  };
  /** Name of the route being processed */
  routeName: string;
}

/**
 * Configuration for hierarchical path generation at the route level.
 * Allows customization of file storage paths with composition support.
 *
 * @template TMetadata - Type of the metadata object
 * @interface S3RoutePathConfig
 *
 * @example Basic Prefix
 * ```typescript
 * const pathConfig: S3RoutePathConfig = {
 *   prefix: 'user-avatars', // Results in: uploads/user-avatars/filename.jpg
 * };
 * ```
 *
 * @example Dynamic Key Generation
 * ```typescript
 * const pathConfig: S3RoutePathConfig<{ userId: string }> = {
 *   generateKey: ({ file, metadata, routeName }) =>
 *     `${routeName}/${metadata.userId}/${Date.now()}-${file.name}`,
 * };
 * ```
 *
 * @example Suffix Approach
 * ```typescript
 * const pathConfig: S3RoutePathConfig = {
 *   suffix: 'processed', // Results in: uploads/filename.jpg/processed
 * };
 * ```
 */
export interface S3RoutePathConfig<TMetadata = any> {
  /** Route-level prefix that gets nested under global prefix */
  prefix?: string;
  /** Custom key generation function with full context */
  generateKey?: (ctx: PathContext<TMetadata>) => string;
  /** Simple suffix appended to global paths */
  suffix?: string;
}

// ========================================
// Route Configuration
// ========================================

/**
 * Individual route configuration class that handles a single upload endpoint.
 * Provides a fluent API for configuring validation, middleware, paths, and lifecycle hooks.
 *
 * @template TSchema - The schema type for validation
 * @template TMetadata - The metadata type from middleware
 * @class S3Route
 *
 * @example Basic Route
 * ```typescript
 * const imageRoute = new S3Route(
 *   s3.image().max('5MB'),
 *   {
 *     paths: { prefix: 'images' },
 *     onUploadComplete: async ({ file, url }) => {
 *       console.log(`Image uploaded: ${file.name} -> ${url}`);
 *     },
 *   }
 * );
 * ```
 *
 * @example Fluent API
 * ```typescript
 * const userFileRoute = s3.file()
 *   .max('10MB')
 *   .middleware(async ({ req }) => {
 *     const user = await authenticateUser(req);
 *     return { userId: user.id };
 *   })
 *   .paths({
 *     generateKey: ({ file, metadata }) =>
 *       `users/${metadata.userId}/${file.name}`,
 *   })
 *   .onUploadStart(async ({ file, metadata }) => {
 *     await logUploadStart(file.name, metadata.userId);
 *   })
 *   .onUploadComplete(async ({ file, url, metadata }) => {
 *     await updateUserFiles(metadata.userId, { name: file.name, url });
 *   });
 * ```
 */
export class S3Route<TSchema extends S3Schema = S3Schema, TMetadata = any> {
  /**
   * Creates a new S3Route instance.
   *
   * @param schema - The validation schema for this route
   * @param config - Optional route configuration
   */
  constructor(
    private schema: TSchema,
    private config: S3RouteConfig<TMetadata> = {}
  ) {}

  /**
   * Adds middleware to process requests before file upload.
   * Middleware functions are executed in the order they are added.
   *
   * @template TNewMetadata - Type of metadata returned by the middleware
   * @param middleware - Middleware function to add
   * @returns New route instance with middleware applied
   *
   * @example Authentication Middleware
   * ```typescript
   * const authenticatedRoute = route.middleware(async ({ req }) => {
   *   const token = req.headers.get('authorization');
   *   const user = await verifyToken(token);
   *   if (!user) throw new Error('Unauthorized');
   *   return { userId: user.id, role: user.role };
   * });
   * ```
   *
   * @example Rate Limiting Middleware
   * ```typescript
   * const rateLimitedRoute = route.middleware(async ({ req, file }) => {
   *   const clientId = getClientId(req);
   *   await checkRateLimit(clientId, file.size);
   *   return { clientId };
   * });
   * ```
   */
  middleware<TNewMetadata>(
    middleware: S3Middleware<TMetadata, TNewMetadata>
  ): S3Route<TSchema, TNewMetadata> {
    const newConfig: S3RouteConfig<TNewMetadata> = {
      middleware: [
        ...(this.config.middleware || []),
        middleware as S3Middleware<any, any>,
      ],
    };
    return new S3Route(this.schema, newConfig);
  }

  /**
   * Configures hierarchical path generation for uploaded files.
   * Paths are composed with global configuration for flexible file organization.
   *
   * @param paths - Path configuration options
   * @returns This route instance for chaining
   *
   * @example Prefix-based Paths
   * ```typescript
   * const route = s3.file().paths({
   *   prefix: 'user-documents', // Results in: uploads/user-documents/filename.pdf
   * });
   * ```
   *
   * @example Dynamic Path Generation
   * ```typescript
   * const route = s3.file()
   *   .middleware(async ({ req }) => ({ userId: getUserId(req) }))
   *   .paths({
   *     generateKey: ({ file, metadata, routeName }) =>
   *       `${routeName}/${metadata.userId}/${new Date().getFullYear()}/${file.name}`,
   *   });
   * ```
   *
   * @example Organized by Date
   * ```typescript
   * const route = s3.image().paths({
   *   generateKey: ({ file }) => {
   *     const date = new Date();
   *     const year = date.getFullYear();
   *     const month = String(date.getMonth() + 1).padStart(2, '0');
   *     return `images/${year}/${month}/${Date.now()}-${file.name}`;
   *   },
   * });
   * ```
   */
  paths(paths: S3RoutePathConfig<TMetadata>): this {
    this.config.paths = { ...this.config.paths, ...paths };
    return this;
  }

  /**
   * Adds a hook that executes when file upload starts.
   * Useful for logging, initializing progress tracking, or sending notifications.
   *
   * @param hook - Function to execute on upload start
   * @returns This route instance for chaining
   *
   * @example Upload Logging
   * ```typescript
   * const route = s3.file().onUploadStart(async ({ file, metadata }) => {
   *   console.log(`Upload started: ${file.name} by user ${metadata.userId}`);
   *   await logUploadEvent('start', file.name, metadata.userId);
   * });
   * ```
   *
   * @example Progress Initialization
   * ```typescript
   * const route = s3.file().onUploadStart(async ({ file, metadata }) => {
   *   await createUploadProgress({
   *     fileName: file.name,
   *     totalSize: file.size,
   *     userId: metadata.userId,
   *     status: 'started',
   *   });
   * });
   * ```
   */
  onUploadStart(hook: S3LifecycleHook<TMetadata>): this {
    this.config.onUploadStart = hook;
    return this;
  }

  /**
   * Adds a hook that executes during file upload progress.
   * Useful for real-time progress tracking and user feedback.
   *
   * @param hook - Function to execute on upload progress
   * @returns This route instance for chaining
   *
   * @example Progress Tracking
   * ```typescript
   * const route = s3.file().onUploadProgress(async ({ file, metadata, progress }) => {
   *   await updateUploadProgress(metadata.uploadId, {
   *     fileName: file.name,
   *     progress,
   *     status: progress === 100 ? 'completing' : 'uploading',
   *   });
   * });
   * ```
   *
   * @example Real-time Updates
   * ```typescript
   * const route = s3.file().onUploadProgress(async ({ file, metadata, progress }) => {
   *   await sendProgressUpdate(metadata.userId, {
   *     fileName: file.name,
   *     percentComplete: progress,
   *   });
   * });
   * ```
   */
  onUploadProgress(
    hook: (
      ctx: S3LifecycleContext<TMetadata> & { progress: number }
    ) => Promise<void> | void
  ): this {
    this.config.onUploadProgress = hook;
    return this;
  }

  /**
   * Adds a hook that executes when file upload completes successfully.
   * Ideal for database updates, post-processing, and success notifications.
   *
   * @param hook - Function to execute on upload completion
   * @returns This route instance for chaining
   *
   * @example Database Update
   * ```typescript
   * const route = s3.file().onUploadComplete(async ({ file, url, key, metadata }) => {
   *   await db.files.create({
   *     name: file.name,
   *     size: file.size,
   *     type: file.type,
   *     url: url,
   *     key: key,
   *     uploadedBy: metadata.userId,
   *     uploadedAt: new Date(),
   *   });
   * });
   * ```
   *
   * @example Post-processing
   * ```typescript
   * const route = s3.image().onUploadComplete(async ({ file, key, metadata }) => {
   *   // Generate thumbnails for images
   *   await generateThumbnails(key, {
   *     sizes: [100, 300, 600],
   *     userId: metadata.userId,
   *   });
   * });
   * ```
   *
   * @example Notification System
   * ```typescript
   * const route = s3.file().onUploadComplete(async ({ file, url, metadata }) => {
   *   await sendNotification({
   *     userId: metadata.userId,
   *     type: 'upload_success',
   *     message: `File "${file.name}" uploaded successfully`,
   *     fileUrl: url,
   *   });
   * });
   * ```
   */
  onUploadComplete(hook: S3LifecycleHook<TMetadata>): this {
    this.config.onUploadComplete = hook;
    return this;
  }

  /**
   * Adds a hook that executes when file upload fails.
   * Essential for error logging, cleanup, and user notifications.
   *
   * @param hook - Function to execute on upload error
   * @returns This route instance for chaining
   *
   * @example Error Logging
   * ```typescript
   * const route = s3.file().onUploadError(async ({ file, error, metadata }) => {
   *   console.error(`Upload failed: ${file.name}`, error);
   *   await logUploadError({
   *     fileName: file.name,
   *     error: error.message,
   *     stack: error.stack,
   *     userId: metadata.userId,
   *     timestamp: new Date(),
   *   });
   * });
   * ```
   *
   * @example Cleanup and Retry
   * ```typescript
   * const route = s3.file().onUploadError(async ({ file, error, metadata }) => {
   *   // Clean up any partial uploads
   *   await cleanupPartialUpload(file.name, metadata.uploadId);
   *
   *   // Queue for retry if appropriate
   *   if (isRetryableError(error)) {
   *     await queueUploadRetry(file.name, metadata);
   *   }
   * });
   * ```
   *
   * @example User Notification
   * ```typescript
   * const route = s3.file().onUploadError(async ({ file, error, metadata }) => {
   *   await sendNotification({
   *     userId: metadata.userId,
   *     type: 'upload_error',
   *     message: `Failed to upload "${file.name}": ${error.message}`,
   *   });
   * });
   * ```
   */
  onUploadError(
    hook: (
      ctx: S3LifecycleContext<TMetadata> & { error: Error }
    ) => Promise<void> | void
  ): this {
    this.config.onUploadError = hook;
    return this;
  }

  /**
   * Internal method to get the complete route configuration.
   * Used by the router system to access schema and configuration.
   *
   * @returns Complete route configuration including schema
   * @internal
   */
  _getConfig(): S3RouteConfig<TMetadata> & { schema: TSchema } {
    return { ...this.config, schema: this.schema };
  }
}

/**
 * Internal configuration interface for S3Route.
 * Contains all the configurable aspects of a route.
 *
 * @template TMetadata - Type of metadata from middleware
 * @interface S3RouteConfig
 * @internal
 */
interface S3RouteConfig<TMetadata = any> {
  /** Array of middleware functions */
  middleware?: S3Middleware<any, any>[];
  /** Path configuration for file organization */
  paths?: S3RoutePathConfig<TMetadata>;
  /** Hook for upload start events */
  onUploadStart?: S3LifecycleHook<TMetadata>;
  /** Hook for upload progress events */
  onUploadProgress?: (
    ctx: S3LifecycleContext<TMetadata> & { progress: number }
  ) => Promise<void> | void;
  /** Hook for upload completion events */
  onUploadComplete?: S3LifecycleHook<TMetadata>;
  /** Hook for upload error events */
  onUploadError?: (
    ctx: S3LifecycleContext<TMetadata> & { error: Error }
  ) => Promise<void> | void;
}

// ========================================
// Hierarchical Path Generation Logic
// ========================================

function generateHierarchicalPath<TMetadata>(
  file: { name: string; type: string },
  metadata: TMetadata,
  routeName: string,
  routeConfig: S3RoutePathConfig<TMetadata> | undefined,
  globalConfig:
    | {
        prefix?: string;
        generateKey?: (
          file: { name: string; type: string },
          metadata: any
        ) => string;
      }
    | undefined,
  uploadConfig: UploadConfig
): string {
  // Build path context for route-level functions
  const pathContext: PathContext<TMetadata> = {
    file,
    metadata,
    globalConfig: globalConfig || {},
    routeName,
  };

  // If route has custom generateKey, use it with full context
  if (routeConfig?.generateKey) {
    return routeConfig.generateKey(pathContext);
  }

  // Build hierarchical path: global + route components
  const pathParts: string[] = [];

  // 1. Start with global prefix (if any)
  const globalPrefix = globalConfig?.prefix || "uploads";
  pathParts.push(globalPrefix);

  // 2. Add route-level prefix (if any)
  if (routeConfig?.prefix) {
    pathParts.push(routeConfig.prefix);
  }

  // 3. Generate the file path
  let filePath: string;

  if (globalConfig?.generateKey) {
    // Use global generateKey for the file part
    filePath = globalConfig.generateKey(file, metadata);
    // Remove global prefix if it was added by global generateKey to avoid duplication
    if (filePath.startsWith(globalPrefix + "/")) {
      filePath = filePath.substring(globalPrefix.length + 1);
    }
  } else {
    // Use default generation for the file part
    filePath = generateFileKey(uploadConfig, {
      originalName: file.name,
      userId: (metadata as any)?.userId || (metadata as any)?.user?.id,
      prefix: "", // Don't add prefix here, we're building it hierarchically
    });
  }

  pathParts.push(filePath);

  // 4. Add route-level suffix (if any)
  if (routeConfig?.suffix) {
    pathParts.push(routeConfig.suffix);
  }

  // Join all parts and clean up any double slashes
  return pathParts.join("/").replace(/\/+/g, "/");
}

// ========================================
// Router Implementation
// ========================================

export type S3RouterDefinition = Record<string, S3Route<any, any>>;

export class S3Router<TRoutes extends S3RouterDefinition> {
  private config: UploadConfig;
  private routes: TRoutes;

  constructor(routes: TRoutes, config: UploadConfig) {
    this.routes = routes;
    this.config = config;
  }

  getRoute<K extends keyof TRoutes>(routeName: K): TRoutes[K] | undefined {
    return this.routes[routeName];
  }

  getRouteNames(): (keyof TRoutes)[] {
    return Object.keys(this.routes);
  }

  get handlers() {
    return createUniversalHandler(this, this.config);
  }

  // Generate presigned URLs for upload
  async generatePresignedUrls<K extends keyof TRoutes>(
    routeName: K,
    req: NextRequest,
    files: S3FileMetadata[]
  ): Promise<PresignedUrlResponse[]> {
    const route = this.getRoute(routeName);
    if (!route) {
      throw new Error(`Route "${String(routeName)}" not found`);
    }

    const routeConfig = route._getConfig();
    const uploadConfig = this.config;
    const results: PresignedUrlResponse[] = [];

    for (const file of files) {
      try {
        // 1. Run middleware chain
        let metadata: any = {};
        const middlewareChain = routeConfig.middleware || [];

        for (const middleware of middlewareChain) {
          metadata = await middleware({ req, file, metadata });
        }

        // 2. Validate file against schema (metadata only)
        const mockFile = new File([], file.name, { type: file.type });
        Object.defineProperty(mockFile, "size", { value: file.size });

        const validationResult = await routeConfig.schema.validate(mockFile);
        if (!validationResult.success) {
          throw new Error(
            validationResult.error?.message || "Validation failed"
          );
        }

        // 3. Call onUploadStart hook
        if (routeConfig.onUploadStart) {
          await routeConfig.onUploadStart({ file, metadata });
        }

        // 4. Generate hierarchical file key
        const key = generateHierarchicalPath(
          { name: file.name, type: file.type },
          metadata,
          String(routeName),
          routeConfig.paths,
          uploadConfig.paths,
          uploadConfig
        );

        const presignedResult = await generatePresignedUploadUrl(uploadConfig, {
          key,
          contentType: file.type,
          contentLength: file.size,
          metadata: {
            originalName: file.name,
            userId: metadata.userId || metadata.user?.id || "anonymous",
            routeName: String(routeName),
          },
        });

        results.push({
          success: true,
          file,
          presignedUrl: presignedResult.url,
          key: presignedResult.key,
          metadata,
        });
      } catch (error) {
        const err =
          error instanceof Error
            ? error
            : new Error("Failed to generate presigned URL");

        // Call onUploadError hook
        if (routeConfig.onUploadError) {
          await routeConfig.onUploadError({ file, metadata: {}, error: err });
        }

        results.push({
          success: false,
          file,
          error: err.message,
        });
      }
    }

    return results;
  }

  // Handle upload completion notification
  async handleUploadComplete<K extends keyof TRoutes>(
    routeName: K,
    req: NextRequest,
    completions: UploadCompletion[]
  ): Promise<CompletionResponse[]> {
    const route = this.getRoute(routeName);
    if (!route) {
      throw new Error(`Route "${String(routeName)}" not found`);
    }

    const routeConfig = route._getConfig();
    const results: CompletionResponse[] = [];

    for (const completion of completions) {
      try {
        // Get file URL
        const url = getFileUrl(this.config, completion.key);

        // Call onUploadComplete hook
        if (routeConfig.onUploadComplete) {
          await routeConfig.onUploadComplete({
            file: completion.file,
            metadata: completion.metadata || {},
            url,
            key: completion.key,
          });
        }

        results.push({
          success: true,
          key: completion.key,
          url,
          file: completion.file,
        });
      } catch (error) {
        const err =
          error instanceof Error
            ? error
            : new Error("Upload completion failed");

        // Call onUploadError hook
        if (routeConfig.onUploadError) {
          await routeConfig.onUploadError({
            file: completion.file,
            metadata: completion.metadata || {},
            error: err,
          });
        }

        results.push({
          success: false,
          key: completion.key,
          error: err.message,
        });
      }
    }

    return results;
  }
}

// ========================================
// Response Types
// ========================================

export interface PresignedUrlResponse {
  success: boolean;
  file: S3FileMetadata;
  presignedUrl?: string;
  key?: string;
  metadata?: any;
  error?: string;
}

export interface UploadCompletion {
  key: string;
  file: S3FileMetadata;
  metadata?: any;
}

export interface CompletionResponse {
  success: boolean;
  key: string;
  url?: string;
  file?: S3FileMetadata;
  error?: string;
}

// ========================================
// Factory Functions
// ========================================

/**
 * ✅ Config-aware router factory
 * Creates router with explicit config dependency
 */
export function createS3RouterWithConfig<TRoutes extends S3RouterDefinition>(
  routes: TRoutes,
  config: UploadConfig
): S3Router<TRoutes> {
  return new S3Router(routes, config);
}

// ========================================
// Type Inference Utilities
// ========================================

export type InferRouterRoutes<T> =
  T extends S3Router<infer TRoutes> ? TRoutes : never;

export type InferRouteInput<T> =
  T extends S3Route<infer TSchema, any> ? InferS3Input<TSchema> : never;

export type InferRouteOutput<T> =
  T extends S3Route<infer TSchema, any> ? InferS3Output<TSchema> : never;

export type InferRouteMetadata<T> =
  T extends S3Route<any, infer TMetadata> ? TMetadata : never;

export type GetRoute<TRouter, TRouteName> =
  TRouter extends S3Router<infer TRoutes>
    ? TRouteName extends keyof TRoutes
      ? TRoutes[TRouteName]
      : never
    : never;
