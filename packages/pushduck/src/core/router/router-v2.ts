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
 *   profileImage: s3.image().maxFileSize('2MB'),
 *   documents: s3.file().accept(['application/pdf']).maxFiles(5),
 * }, config);
 * ```
 *
 * @example Advanced Router with Middleware
 * ```typescript
 * const authenticatedRouter = s3.createRouter({
 *   userFiles: s3.file()
 *     .maxFileSize('10MB')
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

import { UploadConfig } from "../config/upload-config";
import { isRequestScoped, UploadError } from "../errors";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  listUploadedParts,
  presignUploadPart,
  type UploadedPart,
} from "../storage/multipart";
import {
  choosePartSize,
  partRange,
} from "../upload/multipart/plan";
import {
  signCompletion,
  verifyCompletion,
  signSession,
  verifySession,
  type MultipartSession,
} from "./multipart-session";
import { normalizeServerError } from "../errors/from-pushduck-error";
import { createUniversalHandler } from "../handler/universal-handler";
import { InferS3Input, InferS3Output, S3Schema } from "../schema";
import {
  generateFileKey,
  generatePresignedDownloadUrl,
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
  req: Request;
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
  /**
   * Permanent storage path (e.g. 'uploads/user123/photo.jpg').
   * Store this in your database — it never expires.
   */
  storagePath?: string;
  /**
   * Public URL of the uploaded file. Never expires if bucket has public access.
   * Store this in your database.
   */
  publicUrl?: string;
  /**
   * Temporary presigned download URL — expires in ~1 hour.
   * Use for immediate display only. Do NOT store in your database.
   */
  presignedUrl?: string;
  /** @deprecated Use `storagePath` instead. */
  key?: string;
  /** @deprecated Use `publicUrl` or `presignedUrl` instead. */
  url?: string;
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
 *   s3.image().maxFileSize('5MB'),
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
 *   .maxFileSize('10MB')
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
      ...(this.config as unknown as S3RouteConfig<TNewMetadata>),
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
    const newConfig = { ...this.config, paths: { ...this.config.paths, ...paths } };
    return new S3Route(this.schema, newConfig) as this;
  }

  /**
   * Sets the expiration time for presigned upload URLs.
   *
   * Uploads and downloads have independent lifetimes. An upload window is
   * usually minutes; a download link is usually hours. Passing a number sets
   * the **upload** window only — the download URL returned on completion is
   * unaffected and stays at its 1 hour default. Pass an object to set either
   * or both.
   *
   * Both values must be between 1 and 604800 seconds (7 days).
   *
   * @param secondsOrConfig - Upload expiry in seconds, or `{ upload, download }`
   * @returns This route instance for chaining
   *
   * @example Short-lived upload window (download stays at 1 hour)
   * ```typescript
   * const secureUpload = s3.file()
   *   .maxFileSize('10MB')
   *   .expiresIn(300) // upload URL expires in 5 minutes
   * ```
   *
   * @example Independent upload and download lifetimes
   * ```typescript
   * const sharedAsset = s3.file()
   *   .expiresIn({ upload: 300, download: 86400 })
   * ```
   *
   * @example Only lengthen the download link
   * ```typescript
   * const report = s3.file()
   *   .expiresIn({ download: 604800 })
   * ```
   *
   * @remarks
   * The download URL on {@link CompletionResponse.presignedUrl} is meant for
   * immediate use. Persist the object **key**, not the URL, and mint a fresh
   * one with `storage.download.presignedUrl(key, ttl)` when you need it —
   * otherwise a stored URL expires while the record still points at it.
   */
  /**
   * Require a completion to present the token issued at presign.
   *
   * See the note on the schema-level method: presign always issues the token
   * and completion always verifies one that is present, so this only changes
   * whether an *absent* token is tolerated. Enabling it closes the remaining
   * gap — an authenticated caller completing against someone else's key — at
   * the cost of rejecting clients older than the version that began sending it.
   */
  requireCompletionToken(): this {
    this.config.requireCompletionToken = true;
    return this;
  }

  expiresIn(seconds: number): this;
  expiresIn(config: { upload?: number; download?: number }): this;
  expiresIn(
    secondsOrConfig: number | { upload?: number; download?: number }
  ): this {
    const assertRange = (label: string, value: number) => {
      if (!Number.isFinite(value) || value <= 0 || value > 604800) {
        throw new UploadError(
          "CONFIG_INVALID",
          `${label} must be between 1 and 604800 seconds (7 days), got ${value}`,
          { meta: { label, value } }
        );
      }
    };

    if (typeof secondsOrConfig === "number") {
      assertRange("expiresIn", secondsOrConfig);
      return new S3Route(this.schema, {
        ...this.config,
        expiresIn: secondsOrConfig,
      }) as this;
    }

    const { upload, download } = secondsOrConfig;
    const newConfig = { ...this.config };

    if (upload !== undefined) {
      assertRange("expiresIn.upload", upload);
      newConfig.expiresIn = upload;
    }

    if (download !== undefined) {
      assertRange("expiresIn.download", download);
      newConfig.downloadExpiresIn = download;
    }

    return new S3Route(this.schema, newConfig) as this;
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
    console.warn('⚠️ pushduck: .onUploadStart() is deprecated. Use .onStart() instead.');
    return this.onStart(hook);
  }

  /**
   * Adds a hook that executes during file upload progress.
   * Useful for real-time progress tracking and user feedback.
   *
   * @param hook - Function to execute on upload progress
   * @returns This route instance for chaining
   * @deprecated Use `.onProgress()` instead.
   */
  onUploadProgress(
    hook: (
      ctx: S3LifecycleContext<TMetadata> & { progress: number }
    ) => Promise<void> | void
  ): this {
    console.warn('⚠️ pushduck: .onUploadProgress() is deprecated. Use .onProgress() instead.');
    return this.onProgress(hook);
  }

  /**
   * Adds a hook that executes when file upload completes successfully.
   * Ideal for database updates, post-processing, and success notifications.
   *
   * @param hook - Function to execute on upload completion
   * @returns This route instance for chaining
   * @deprecated Use `.onComplete()` instead.
   */
  onUploadComplete(hook: S3LifecycleHook<TMetadata>): this {
    console.warn('⚠️ pushduck: .onUploadComplete() is deprecated. Use .onComplete() instead.');
    return this.onComplete(hook);
  }

  /**
   * Adds a hook that executes when file upload fails.
   * Essential for error logging, cleanup, and user notifications.
   *
   * @param hook - Function to execute on upload error
   * @returns This route instance for chaining
   * @deprecated Use `.onError()` instead.
   */
  onUploadError(
    hook: (
      ctx: S3LifecycleContext<TMetadata> & { error: Error }
    ) => Promise<void> | void
  ): this {
    console.warn('⚠️ pushduck: .onUploadError() is deprecated. Use .onError() instead.');
    return this.onError(hook);
  }

  /**
   * Adds a hook that executes when file upload starts.
   * Useful for logging, initializing progress tracking, or sending notifications.
   *
   * @param hook - Function to execute on upload start
   * @returns This route instance for chaining
   *
   * @example
   * ```typescript
   * upload.file().onStart(async ({ file, metadata }) => {
   *   await logUploadEvent('start', file.name, metadata.userId);
   * });
   * ```
   */
  onStart(hook: S3LifecycleHook<TMetadata>): this {
    this.config.onStart = hook;
    return this;
  }

  /**
   * Adds a hook that executes during file upload progress.
   *
   * @param hook - Function to execute on upload progress
   * @returns This route instance for chaining
   *
   * @example
   * ```typescript
   * upload.file().onProgress(async ({ file, metadata, progress }) => {
   *   await updateUploadProgress(metadata.uploadId, { progress });
   * });
   * ```
   */
  onProgress(
    hook: (
      ctx: S3LifecycleContext<TMetadata> & { progress: number }
    ) => Promise<void> | void
  ): this {
    this.config.onProgress = hook;
    return this;
  }

  /**
   * Adds a hook that executes when file upload completes successfully.
   * Ideal for database updates, post-processing, and success notifications.
   *
   * @param hook - Function to execute on upload completion
   * @returns This route instance for chaining
   *
   * @example
   * ```typescript
   * upload.file().onComplete(async ({ file, url, key, metadata }) => {
   *   await db.files.create({ name: file.name, url, uploadedBy: metadata.userId });
   * });
   * ```
   */
  onComplete(hook: S3LifecycleHook<TMetadata>): this {
    this.config.onComplete = hook;
    return this;
  }

  /**
   * Adds a hook that executes when file upload fails.
   *
   * @param hook - Function to execute on upload error
   * @returns This route instance for chaining
   *
   * @example
   * ```typescript
   * upload.file().onError(async ({ file, error, metadata }) => {
   *   await logUploadError({ fileName: file.name, error: error.message });
   * });
   * ```
   */
  onError(
    hook: (
      ctx: S3LifecycleContext<TMetadata> & { error: Error }
    ) => Promise<void> | void
  ): this {
    this.config.onError = hook;
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
  /**
   * Presigned **upload** URL expiry in seconds (default: 3600 = 1 hour).
   * Set via `.expiresIn(seconds)` or `.expiresIn({ upload })`.
   */
  expiresIn?: number;
  /**
   * Presigned **download** URL expiry in seconds for the URL returned on
   * completion (default: 3600 = 1 hour). Set via `.expiresIn({ download })`.
   * Independent of the upload window.
   */
  downloadExpiresIn?: number;
  /**
   * Reject a completion that carries no token. @default false
   *
   * Off by default because the wire protocol is frozen at v1 and a server that
   * demanded a new field would reject every client not yet upgraded.
   */
  requireCompletionToken?: boolean;
  /** Hook for upload start events */
  onStart?: S3LifecycleHook<TMetadata>;
  /** Hook for upload progress events */
  onProgress?: (
    ctx: S3LifecycleContext<TMetadata> & { progress: number }
  ) => Promise<void> | void;
  /** Hook for upload completion events */
  onComplete?: S3LifecycleHook<TMetadata>;
  /** Hook for upload error events */
  onError?: (
    ctx: S3LifecycleContext<TMetadata> & { error: Error }
  ) => Promise<void> | void;
  /** @deprecated Use onStart */
  onUploadStart?: S3LifecycleHook<TMetadata>;
  /** @deprecated Use onProgress */
  onUploadProgress?: (
    ctx: S3LifecycleContext<TMetadata> & { progress: number }
  ) => Promise<void> | void;
  /** @deprecated Use onComplete */
  onUploadComplete?: S3LifecycleHook<TMetadata>;
  /** @deprecated Use onError */
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

  // 1. Start with global prefix (only if explicitly configured)
  if (globalConfig?.prefix) {
    pathParts.push(globalConfig.prefix);
  }

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
    if (globalConfig?.prefix && filePath.startsWith(globalConfig.prefix + "/")) {
      filePath = filePath.substring(globalConfig.prefix.length + 1);
    }
  } else {
    // Use default generation for the file part (just filename by default)
    // No assumptions about metadata structure - users control paths via generateKey
    filePath = generateFileKey(uploadConfig, {
      originalName: file.name,
      prefix: "", // Don't add prefix here, we're building it hierarchically
    });
  }

  pathParts.push(filePath);

  // 4. Add route-level suffix (if any)
  if (routeConfig?.suffix) {
    pathParts.push(routeConfig.suffix);
  }

  // Join all parts and clean up any double slashes
  const result = pathParts.join("/").replace(/\/+/g, "/");
  
  // If result is empty or just slashes, return just the filename
  return result || filePath;
}

// ========================================
// Router Implementation
// ========================================

/**
 * Secret used to sign multipart session tokens.
 *
 * Reuses a credential the server already holds rather than introducing another
 * one to configure and rotate. Not every provider config carries
 * `secretAccessKey` — GCS uses a service account — so this falls back rather
 * than assuming a shape.
 */
function multipartSessionSecret(config: UploadConfig): string {
  const provider = config.provider as unknown as Record<string, unknown>;

  const secret =
    (typeof provider.secretAccessKey === "string" && provider.secretAccessKey) ||
    (typeof provider.accessKeyId === "string" && provider.accessKeyId);

  if (!secret) {
    throw new UploadError(
      "CONFIG_INVALID",
      "Multipart uploads need a provider credential to sign session tokens"
    );
  }

  return secret;
}

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

  /**
   * Per-method Web-standard handlers.
   *
   * Use this where a framework wants named method exports:
   *
   * ```typescript
   * // Next.js App Router
   * export const { GET, POST } = uploadRouter.handlers;
   * ```
   *
   * @see {@link S3Router.handler} for frameworks that mount a single catch-all.
   */
  get handlers() {
    return createUniversalHandler(this, this.config);
  }

  /**
   * A single Web-standard handler that dispatches on the request method.
   *
   * Most frameworks mount one catch-all route rather than per-method exports,
   * and this is the shape they want:
   *
   * ```typescript
   * // Hono
   * app.all("/api/upload/*", (c) => uploadRouter.handler(c.req.raw));
   *
   * // Elysia
   * app.all("/api/upload/*", ({ request }) => uploadRouter.handler(request));
   *
   * // Astro
   * export const ALL = ({ request }) => uploadRouter.handler(request);
   *
   * // Bun / Deno / Cloudflare Workers
   * export default { fetch: uploadRouter.handler };
   * ```
   *
   * Unsupported methods get a `405` with an `Allow` header rather than falling
   * through to the framework's 404, so a misconfigured mount is diagnosable.
   *
   * @param request - Web-standard `Request`
   * @returns Web-standard `Response`
   */
  get handler(): (request: Request) => Promise<Response> {
    const handlers = this.handlers;
    const allowed = Object.keys(handlers);

    return (request: Request): Promise<Response> => {
      const method = request.method?.toUpperCase();
      const handle = handlers[method as keyof typeof handlers];

      if (!handle) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              error: `Method ${method ?? "unknown"} not allowed`,
            }),
            {
              status: 405,
              headers: {
                "Content-Type": "application/json",
                Allow: allowed.join(", "),
              },
            }
          )
        );
      }

      return handle(request);
    };
  }

  /**
   * Generate presigned URLs for file uploads with client-side metadata support.
   *
   * This method orchestrates the complete presigned URL generation workflow:
   * 1. Validates the route exists
   * 2. Runs middleware chain (client metadata → enriched metadata)
   * 3. Validates files against schema
   * 4. Calls onUploadStart hooks
   * 5. Generates hierarchical file paths
   * 6. Creates presigned upload URLs
   *
   * @template K - Route name type from router definition
   * @param routeName - Name of the upload route
   * @param req - Request object for accessing headers, etc.
   * @param files - Array of file metadata (name, size, type)
   * @param metadata - Optional client-provided metadata (untrusted)
   * @returns Array of presigned URL responses
   *
   * @remarks
   * **Metadata Flow:**
   * 1. Client sends metadata from UI (untrusted)
   * 2. Handler extracts and forwards to router
   * 3. Router passes to middleware chain
   * 4. Middleware validates/enriches metadata
   * 5. Enriched metadata used in hooks and path generation
   *
   * **Security Model:**
   * - Client metadata is UNTRUSTED user input
   * - Middleware MUST validate and sanitize
   * - Server should OVERRIDE critical fields (userId, role, etc.)
   * - Never trust client identity claims
   *
   * @security
   * ⚠️ CRITICAL: Client metadata is untrusted.
   *
   * Middleware must validate all client metadata before use:
   * ```typescript
   * .middleware(async ({ req, metadata }) => {
   *   const user = await authenticateUser(req);
   *
   *   return {
   *     // Client metadata (validate before use)
   *     albumId: validateUUID(metadata?.albumId),
   *     tags: sanitizeTags(metadata?.tags),
   *
   *     // Server metadata (trusted)
   *     userId: user.id,  // From auth, NOT from client
   *     role: user.role,   // From auth, NOT from client
   *   };
   * });
   * ```
   *
   * @example Basic usage (no client metadata)
   * ```typescript
   * const results = await router.generatePresignedUrls(
   *   'imageUpload',
   *   request,
   *   [{ name: 'photo.jpg', size: 1024000, type: 'image/jpeg' }]
   * );
   * ```
   *
   * @example With client metadata
   * ```typescript
   * const results = await router.generatePresignedUrls(
   *   'imageUpload',
   *   request,
   *   [{ name: 'photo.jpg', size: 1024000, type: 'image/jpeg' }],
   *   { albumId: 'abc123', tags: ['vacation'] }  // Client metadata
   * );
   * ```
   *
   * @throws {Error} If route not found or validation fails
   */
  async generatePresignedUrls<K extends keyof TRoutes>(
    routeName: K,
    req: Request,
    files: S3FileMetadata[],
    metadata?: any
  ): Promise<PresignedUrlResponse[]> {
    const route = this.getRoute(routeName);
    if (!route) {
      throw new UploadError(
        "NOT_FOUND",
        `Route "${String(routeName)}" not found`,
        { meta: { route: String(routeName) } }
      );
    }

    const routeConfig = route._getConfig();
    const uploadConfig = this.config;
    const results: PresignedUrlResponse[] = [];

    for (const file of files) {
      /**
       * Initialize fileMetadata outside try block so it's available in catch block
       * for the onUploadError hook. This ensures error hooks receive the enriched
       * metadata even when validation or presigned URL generation fails.
       */
      let fileMetadata = metadata || {};

      try {
        /**
         * 1. Run middleware chain to enrich metadata
         *
         * Client metadata serves as the initial value and flows through
         * the middleware chain. Each middleware can:
         * - Validate client data
         * - Add server-side context (auth, timestamps, etc.)
         * - Transform or sanitize values
         * - Override client-provided identity claims
         *
         * The result becomes the authoritative metadata for this upload.
         */
        const middlewareChain = routeConfig.middleware || [];

        for (const middleware of middlewareChain) {
          fileMetadata = await middleware({
            req,
            file,
            metadata: fileMetadata,
          });
        }

        // 2. Validate file against schema (metadata only)
        const mockFile = new File([], file.name, { type: file.type });
        Object.defineProperty(mockFile, "size", { value: file.size });

        const validationResult = await routeConfig.schema.validate(mockFile);
        if (!validationResult.success) {
          // The caller's file does not satisfy the route's constraints, so this
          // is a 400 they can act on — not an anonymous 500.
          throw new UploadError(
            "VALIDATION_FAILED",
            validationResult.error?.message || "Validation failed",
            {
              meta: {
                file: file.name,
                size: file.size,
                type: file.type,
              },
            }
          );
        }

        // 3. Call onStart hook (supports both new and deprecated name)
        const onStartHook = routeConfig.onStart || routeConfig.onUploadStart;
        if (onStartHook) {
          await onStartHook({ file, metadata: fileMetadata });
        }

        // 4. Generate hierarchical file key
        const key = generateHierarchicalPath(
          { name: file.name, type: file.type },
          fileMetadata,
          String(routeName),
          routeConfig.paths,
          uploadConfig.paths,
          uploadConfig
        );

        // Build metadata from user's metadata - no assumptions about structure
        // System fields are protected from user overwrites
        const s3Metadata: Record<string, string> = {};

        // Reserved system fields that should not be overwritten by user metadata
        const RESERVED_FIELDS = ['originalName', 'routeName'];

        // Include any string values from user's metadata (skip reserved fields)
        if (fileMetadata && typeof fileMetadata === 'object') {
          Object.entries(fileMetadata).forEach(([key, value]) => {
            // Skip reserved system fields to prevent overwrites
            if (RESERVED_FIELDS.includes(key)) {
              return;
            }
            if (typeof value === 'string') {
              s3Metadata[key] = value;
            } else if (typeof value === 'number' || typeof value === 'boolean') {
              s3Metadata[key] = String(value);
            }
          });
        }

        // Set system fields AFTER user metadata to ensure they are never overwritten
        s3Metadata.originalName = file.name;
        s3Metadata.routeName = String(routeName);

        const presignedResult = await generatePresignedUploadUrl(uploadConfig, {
          key,
          contentType: file.type,
          contentLength: file.size,
          metadata: s3Metadata,
          expiresIn: routeConfig.expiresIn,
        });

        results.push({
          success: true,
          file,
          presignedUrl: presignedResult.url,
          key: presignedResult.key,
          requiredHeaders: presignedResult.requiredHeaders,
          metadata: fileMetadata,
          /**
           * Binds this key to this route, so completion can verify that the
           * caller is finishing an upload the server actually authorised
           * rather than naming someone else's object. Additive: a client that
           * ignores it still works, and `requireCompletionToken()` makes it
           * mandatory once every client is known to send it.
           */
          completionToken: await signCompletion(
            multipartSessionSecret(uploadConfig),
            { key: presignedResult.key, route: String(routeName) }
          ),
        });
      } catch (error) {
        const err = normalizeServerError(error);

        // Call onError hook (supports both new and deprecated name)
        const onErrorHook = routeConfig.onError || routeConfig.onUploadError;
        if (onErrorHook) {
          await onErrorHook({
            file,
            metadata: fileMetadata,
            error: err,
          });
        }

        // A request-scoped failure — rejected auth, exhausted quota, bad
        // credentials — is not a property of this file. Abort the batch so the
        // handler answers with the real status instead of a 200 containing N
        // copies of the same problem.
        if (isRequestScoped(err.code)) throw err;

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
  /**
   * Starts a multipart upload for one file.
   *
   * Runs the same middleware chain, validation and path generation as a
   * single-PUT presign — a large file must not bypass the auth and constraints
   * a small one is subject to.
   *
   * Returns an opaque session token rather than a raw `{ key, uploadId }`, so
   * the later calls cannot be pointed at an object the caller never created.
   */
  async initMultipartUpload<K extends keyof TRoutes>(
    routeName: K,
    req: Request,
    file: S3FileMetadata,
    metadata?: any
  ): Promise<{
    session: string;
    key: string;
    partSize: number;
    partCount: number;
    metadata: any;
  }> {
    const route = this.getRoute(routeName);
    if (!route) {
      throw new UploadError("NOT_FOUND", `Route "${String(routeName)}" not found`);
    }

    const routeConfig = route._getConfig();
    const uploadConfig = this.config;

    let fileMetadata = metadata || {};
    for (const middleware of routeConfig.middleware || []) {
      fileMetadata = await middleware({ req, file, metadata: fileMetadata });
    }

    // Same validation as the single-PUT path: size and type constraints apply
    // regardless of how the bytes will be transferred.
    const mockFile = new File([], file.name, { type: file.type });
    Object.defineProperty(mockFile, "size", { value: file.size });

    const validation = await routeConfig.schema.validate(mockFile);
    if (!validation.success) {
      throw new UploadError(
        "VALIDATION_FAILED",
        validation.error?.message || "Validation failed",
        { meta: { file: file.name, size: file.size, type: file.type } }
      );
    }

    if (routeConfig.onUploadStart) {
      await routeConfig.onUploadStart({ file, metadata: fileMetadata });
    }

    const key = generateHierarchicalPath(
      { name: file.name, type: file.type },
      fileMetadata,
      String(routeName),
      routeConfig.paths,
      uploadConfig.paths,
      uploadConfig
    );

    const partSize = choosePartSize(file.size, {
      partSize: uploadConfig.multipart?.partSize,
    });
    const partCount = Math.max(1, Math.ceil(file.size / partSize));

    const created = await createMultipartUpload(uploadConfig, {
      key,
      contentType: file.type,
    });

    const session = await signSession(
      multipartSessionSecret(uploadConfig),
      {
        key: created.key,
        uploadId: created.uploadId,
        route: String(routeName),
        partSize,
        totalSize: file.size,
      }
    );

    return {
      session,
      key: created.key,
      partSize,
      partCount,
      metadata: fileMetadata,
    };
  }

  /**
   * Presigns a batch of part uploads.
   *
   * Batched because this is the hot path — a 5 GiB file at the 5 MiB floor is
   * over a thousand parts, and one HTTP round trip per signature would dominate
   * the transfer.
   */
  async signMultipartParts<K extends keyof TRoutes>(
    routeName: K,
    req: Request,
    input: { session: unknown; partNumbers: number[] }
  ): Promise<Array<{ partNumber: number; url: string; size: number }>> {
    const uploadConfig = this.config;
    const session = await this.#authorizeSession(routeName, req, input.session);

    const maxPart = Math.max(1, Math.ceil(session.totalSize / session.partSize));

    return Promise.all(
      input.partNumbers.map(async (partNumber) => {
        // A part number outside the plan would sign a write past the end of
        // the object the session was created for.
        if (
          !Number.isInteger(partNumber) ||
          partNumber < 1 ||
          partNumber > maxPart
        ) {
          throw new UploadError(
            "BAD_REQUEST",
            `Part number ${partNumber} is outside this upload`,
            { meta: { partNumber, maxPart } }
          );
        }

        const url = await presignUploadPart(uploadConfig, {
          key: session.key,
          uploadId: session.uploadId,
          partNumber,
          expiresIn: this.#routeExpiry(routeName),
        });

        const range = partRange(partNumber, session.partSize, session.totalSize);
        return { partNumber, url, size: range.size };
      })
    );
  }

  /** Stitches the parts and runs the route's completion hook. */
  async completeMultipartUpload<K extends keyof TRoutes>(
    routeName: K,
    req: Request,
    input: {
      session: unknown;
      parts: UploadedPart[];
      file: S3FileMetadata;
      metadata?: any;
    }
  ): Promise<{ success: true; key: string; url: string }> {
    const uploadConfig = this.config;
    const route = this.getRoute(routeName)!;
    const session = await this.#authorizeSession(routeName, req, input.session);

    await completeMultipartUpload(uploadConfig, {
      key: session.key,
      uploadId: session.uploadId,
      parts: input.parts,
    });

    const url = getFileUrl(uploadConfig, session.key);

    const routeConfig = route._getConfig();
    if (routeConfig.onUploadComplete) {
      await routeConfig.onUploadComplete({
        file: input.file,
        metadata: input.metadata ?? {},
        url,
        key: session.key,
      });
    }

    return { success: true, key: session.key, url };
  }

  /** Discards a multipart upload. Abandoned parts are billed until removed. */
  async abortMultipartUpload<K extends keyof TRoutes>(
    routeName: K,
    req: Request,
    input: { session: unknown }
  ): Promise<{ success: true }> {
    const session = await this.#authorizeSession(routeName, req, input.session);

    await abortMultipartUpload(this.config, {
      key: session.key,
      uploadId: session.uploadId,
    });

    return { success: true };
  }

  /**
   * Lists the parts the provider actually holds, for resume.
   *
   * The authority over local state: a client's record can be stale, can have
   * been written before a request actually failed, or can belong to a
   * different file.
   */
  async listMultipartParts<K extends keyof TRoutes>(
    routeName: K,
    req: Request,
    input: { session: unknown }
  ): Promise<UploadedPart[]> {
    const session = await this.#authorizeSession(routeName, req, input.session);

    return listUploadedParts(this.config, {
      key: session.key,
      uploadId: session.uploadId,
    });
  }

  /**
   * Runs the route's middleware, then verifies the session token.
   *
   * Middleware runs on **every** multipart call, not only `init`: a session
   * that outlives the caller's authorisation must stop working, and a token is
   * not a substitute for authentication.
   */
  async #authorizeSession<K extends keyof TRoutes>(
    routeName: K,
    req: Request,
    token: unknown
  ): Promise<MultipartSession> {
    const route = this.getRoute(routeName);
    if (!route) {
      throw new UploadError("NOT_FOUND", `Route "${String(routeName)}" not found`);
    }

    const routeConfig = route._getConfig();
    let metadata: any = {};
    for (const middleware of routeConfig.middleware || []) {
      metadata = await middleware({
        req,
        // Middleware is shaped around a file; multipart calls after init do not
        // carry one, so a placeholder keeps auth checks working unchanged.
        file: { name: "", size: 0, type: "" },
        metadata,
      });
    }

    const session = await verifySession(
      multipartSessionSecret(this.config),
      token
    );

    // A token minted for one route must not act on another, even for a caller
    // authorised on both.
    if (session.route !== String(routeName)) {
      throw new UploadError("FORBIDDEN", "Session does not belong to this route");
    }

    return session;
  }

  /** Upload expiry for a route, falling back to the global default. */
  #routeExpiry<K extends keyof TRoutes>(routeName: K): number | undefined {
    const config = this.getRoute(routeName)?._getConfig();
    const expiresIn = config?.expiresIn as
      | number
      | { upload?: number; download?: number }
      | undefined;

    return typeof expiresIn === "number" ? expiresIn : expiresIn?.upload;
  }

  async handleUploadComplete<K extends keyof TRoutes>(
    routeName: K,
    req: Request,
    completions: UploadCompletion[]
  ): Promise<CompletionResponse[]> {
    const route = this.getRoute(routeName);
    if (!route) {
      throw new UploadError(
        "NOT_FOUND",
        `Route "${String(routeName)}" not found`,
        { meta: { route: String(routeName) } }
      );
    }

    const routeConfig = route._getConfig();
    const results: CompletionResponse[] = [];

    /**
     * Authorise every completion before any hook runs.
     *
     * `onUploadComplete` is where applications insert the database row, attach
     * the file to a record, grant access, notify, or bill. This call used to
     * reach it with no authorisation at all: `key` and `metadata` came
     * straight from the request body, so an anonymous caller could drive an
     * application's most consequential hook with values of their choosing.
     * Presign has always run this chain, and multipart authorises against a
     * signed session — completion was the one action that trusted the client.
     *
     * The chain runs *before* the loop below, and outside its try/catch, for
     * two reasons. A rejection must fail the whole request with the
     * middleware's own status rather than being caught and reported per-file
     * as a 200 with `success: false`. And a batch containing one unauthorised
     * entry must not fire the hook for the others.
     *
     * Client metadata seeds the chain exactly as it does at presign — it is
     * untrusted input, and whatever the chain returns is authoritative — so a
     * route with no middleware keeps forwarding client metadata unchanged and
     * public routes are unaffected.
     */
    const middlewareChain = routeConfig.middleware || [];
    const authorized: unknown[] = [];

    for (const completion of completions) {
      /**
       * Verify the key against the token presign issued for it.
       *
       * Middleware authenticates the *caller*; this authenticates the
       * *object*. Without it an authenticated user can complete against a key
       * belonging to someone else — and default keys are predictable enough
       * that guessing one is not much of an obstacle.
       *
       * Verified whenever a token is present, so an upgraded client is
       * protected immediately. Whether an *absent* token is tolerated is the
       * route's decision: rejecting by default would break every client older
       * than the version that began sending one.
       */
      if (completion.completionToken !== undefined) {
        const claim = await verifyCompletion(
          multipartSessionSecret(this.config),
          completion.completionToken
        );

        if (claim.key !== completion.key || claim.route !== String(routeName)) {
          throw new UploadError(
            "FORBIDDEN",
            "This completion does not match the upload it was issued for",
            { meta: { reason: "completion-token-mismatch" } }
          );
        }
      } else if (routeConfig.requireCompletionToken) {
        throw new UploadError(
          "FORBIDDEN",
          "This route requires the completion token issued at presign",
          { meta: { reason: "completion-token-missing" } }
        );
      }

      let fileMetadata: unknown = completion.metadata || {};

      for (const middleware of middlewareChain) {
        fileMetadata = await middleware({
          req,
          file: completion.file,
          metadata: fileMetadata as Record<string, unknown>,
        });
      }

      authorized.push(fileMetadata);
    }

    for (const [index, completion] of completions.entries()) {
      // The chain's output, not the client's claim.
      const trustedMetadata = authorized[index];

      try {
        // Get file URL
        const url = getFileUrl(this.config, completion.key);

        // Download expiry is independent of the upload window: an upload
        // window is typically minutes, a download link hours. Reusing
        // `expiresIn` here would silently shorten download URLs for any route
        // that tightened its upload window, and `expiresIn` is documented as
        // the upload expiry. Set this with `.expiresIn({ download })`.
        const presignedUrl = await generatePresignedDownloadUrl(
          this.config,
          completion.key,
          routeConfig.downloadExpiresIn ?? 3600
        );

        // Call onComplete hook (supports both new and deprecated name)
        const onCompleteHook = routeConfig.onComplete || routeConfig.onUploadComplete;
        if (onCompleteHook) {
          await onCompleteHook({
            file: completion.file,
            metadata: (trustedMetadata || {}) as Record<string, unknown>,
            storagePath: completion.key,
            publicUrl: url,
            presignedUrl,
            // deprecated aliases
            url,
            key: completion.key,
          });
        }

        results.push({
          success: true,
          key: completion.key,
          storagePath: completion.key,
          url,
          publicUrl: url,
          presignedUrl,
          file: completion.file,
        });
      } catch (error) {
        const err =
          error instanceof Error
            ? error
            : new Error("Upload completion failed");

        // Call onError hook (supports both new and deprecated name)
        const onErrorHook = routeConfig.onError || routeConfig.onUploadError;
        if (onErrorHook) {
          await onErrorHook({
            file: completion.file,
            metadata: (trustedMetadata || {}) as Record<string, unknown>,
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
  /** Headers the client must send with the PUT request. See {@link PresignedUrlResult.requiredHeaders}. */
  requiredHeaders?: Record<string, string>;
  metadata?: any;
  /**
   * Opaque token binding this key to this route.
   *
   * Echo it back on `action=complete`. Additive in protocol v1: a client that
   * omits it still completes, unless the route calls
   * `requireCompletionToken()`.
   */
  completionToken?: string;
  error?: string;
}

export interface UploadCompletion {
  key: string;
  file: S3FileMetadata;
  metadata?: any;
  /** The token issued for this key at presign, if the client kept it. */
  completionToken?: string;
}

export interface CompletionResponse {
  success: boolean;
  /** Permanent storage path — store this in your database. */
  storagePath?: string;
  /** Public URL — store this in your database. */
  publicUrl?: string;
  /** Temporary presigned download URL — expires in ~1 hour, do not store. */
  presignedUrl?: string;
  /** @deprecated Use `storagePath` instead. */
  key: string;
  /**
   * The object's permanent public URL — your `customDomain` when one is
   * configured, otherwise the provider URL. Unsigned, never expires, keeps
   * CDN caching intact.
   *
   * @deprecated Use `publicUrl` (same value) for public buckets, or
   * `presignedUrl` for private ones.
   */
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
