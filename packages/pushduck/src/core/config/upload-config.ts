/**
 * @fileoverview Upload Configuration System
 *
 * This module provides a builder pattern for configuring pushduck with type-safe
 * provider settings, validation rules, path generation, and lifecycle hooks.
 *
 * One config serves the whole app: `upload` defines routes, `storage` runs
 * server-side operations, and both use the same provider. Build it once in a
 * shared module rather than once per use.
 *
 * @example Basic AWS Configuration
 * ```typescript
 * export const { upload, storage, isConfigured } = createUploadConfig()
 *   // A function: read on the first upload or storage call, not at import,
 *   // so a build without credentials still succeeds.
 *   .provider("aws", () => ({
 *     bucket: process.env.AWS_BUCKET,
 *     region: process.env.AWS_REGION,
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 *   }))
 *   .defaults({ maxFileSize: '10MB', acl: 'public-read' })
 *   .build();
 * ```
 *
 * @example Multi-Provider Configuration
 * ```typescript
 * // Development with MinIO
 * const devConfig = createUploadConfig()
 *   .provider("minio", {
 *     endpoint: "localhost:9000",
 *     bucket: "dev-uploads",
 *     accessKeyId: "minioadmin",
 *     secretAccessKey: "minioadmin",
 *     useSSL: false,
 *   })
 *   .build();
 *
 * // Production with Cloudflare R2
 * const prodConfig = createUploadConfig()
 *   .provider("cloudflareR2", {
 *     accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
 *     bucket: "prod-uploads",
 *     accessKeyId: process.env.R2_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
 *     region: "auto",
 *   })
 *   .build();
 * ```
 *
 */

import { UploadError } from "../errors";
import {
  createProvider,
  PROVIDERS,
  validateProviderConfig,
  warnIfAclIgnored,
  type ProviderConfig,
  type ProviderConfigMap,
  type ProviderType,
} from "../providers";
import type { S3Router } from "../router/router-v2";
import { createS3RouterWithConfig, S3Route } from "../router/router-v2";
import {
  S3FileConstraints,
  S3FileSchema,
  S3ImageSchema,
  S3ObjectSchema,
} from "../schema";
import { createStorage, type StorageInstance } from "../storage/storage-api";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

// ========================================
// Smart Schema Builders (for upload-config)
// ========================================

/**
 * Smart router factory that handles schema-to-route conversion automatically.
 * This internal function converts schema objects to route objects and creates
 * a config-aware router instance.
 *
 * @internal
 * @template TRoutes - The route definitions object type
 * @param routes - Object containing route definitions (schemas or routes)
 * @param config - Upload configuration to bind to the router
 * @returns A fully configured S3Router instance
 */
function smartCreateRouter<TRoutes extends Record<string, any>>(
  routes: TRoutes,
  config: UploadConfig
): S3Router<RoutesOf<TRoutes>> {
  // Convert any schema objects to route objects
  const convertedRoutes: Record<string, S3Route<any, any>> = {};

  for (const [key, value] of Object.entries(routes)) {
    if (
      value instanceof S3FileSchema ||
      value instanceof S3ImageSchema ||
      value instanceof S3ObjectSchema
    ) {
      // Convert schema to route
      convertedRoutes[key] = new S3Route(value);
    } else {
      // Already a route
      convertedRoutes[key] = value;
    }
  }

  // ✅ Use config-aware router factory
  return createS3RouterWithConfig(convertedRoutes, config) as any as S3Router<
    RoutesOf<TRoutes>
  >;
}

/**
 * The routes a router is built from: each entry as written when it is already
 * a route, and wrapped in a plain `S3Route` when it is a bare schema.
 */
type RoutesOf<TRoutes extends Record<string, any>> = {
  [K in keyof TRoutes]: TRoutes[K] extends S3Route<any, any>
    ? TRoutes[K]
    : S3Route<any, any>;
};

/**
 * The `upload` object returned by `createUploadConfig().build()`: schema
 * builders and a router factory bound to that config.
 *
 * Declared as a named interface rather than inferred from its factory so that
 * a consumer compiling with `declaration: true` can name it. An inferred
 * object type is printed structurally into the consumer's `.d.ts`, dragging
 * every type it mentions along with it.
 */
export interface UploadBuilder {
  /** A schema for any file, optionally constrained. */
  file(constraints?: S3FileConstraints): S3FileSchema;
  /** A schema for image files, optionally constrained. */
  image(constraints?: S3FileConstraints): S3ImageSchema;
  /** A schema for several named files uploaded together. */
  object<T extends Record<string, any>>(shape: T): S3ObjectSchema<T>;
  /** A router bound to this config, from schemas or routes. */
  createRouter<TRoutes extends Record<string, any>>(
    routes: TRoutes
  ): S3Router<RoutesOf<TRoutes>>;
}

/**
 * Creates a config-aware S3 builder instance with schema builders and router factory.
 * This provides the `s3` object returned from `createUploadConfig().build()`.
 *
 * @internal
 * @param config - The upload configuration to bind to this instance
 * @returns An object with schema builders and router factory
 *
 * @example
 * ```typescript
 * const { s3 } = createUploadConfig().provider("aws", {...}).build();
 *
 * // Use schema builders
 * const imageSchema = s3.image({ maxSize: '5MB' });
 * const fileSchema = s3.file({ allowedTypes: ['application/pdf'] });
 *
 * // Create router with schemas
 * const router = s3.createRouter({
 *   avatarUpload: s3.image().maxFileSize('2MB'),
 *   documentUpload: s3.file({ maxSize: '10MB' }),
 * });
 * ```
 */
function createS3Instance(config: UploadConfig): UploadBuilder {
  return {
    /**
     * Creates a file schema for general file uploads with optional constraints.
     *
     * @param constraints - Optional file validation constraints
     * @returns A new S3FileSchema instance
     *
     * @example
     * ```typescript
     * const pdfSchema = s3.file({
     *   maxSize: '10MB',
     *   allowedTypes: ['application/pdf'],
     * });
     * ```
     */
    file: (constraints?: S3FileConstraints) => new S3FileSchema(constraints),

    /**
     * Creates an image schema with image-specific validation and constraints.
     *
     * @param constraints - Optional image validation constraints
     * @returns A new S3ImageSchema instance
     *
     * @example
     * ```typescript
     * const avatarSchema = s3.image({
     *   maxSize: '5MB',
     *   allowedTypes: ['image/jpeg', 'image/png'],
     * });
     * ```
     */
    image: (constraints?: S3FileConstraints) => new S3ImageSchema(constraints),

    /**
     * Creates an object schema for structured data validation.
     *
     * @template T - The shape of the object schema
     * @param shape - Object defining the expected structure
     * @returns A new S3ObjectSchema instance
     *
     * @example
     * ```typescript
     * const metadataSchema = s3.object({
     *   title: 'string',
     *   tags: 'array',
     *   userId: 'string',
     * });
     * ```
     */
    object: <T extends Record<string, any>>(shape: T) =>
      new S3ObjectSchema(shape),

    /**
     * Creates a config-aware router with the provided route definitions.
     * Routes can be schema objects or S3Route instances.
     *
     * @template TRoutes - The routes object type
     * @param routes - Object mapping route names to schemas or routes
     * @returns A configured S3Router instance
     *
     * @example
     * ```typescript
     * const router = s3.createRouter({
     *   // Using schema builders
     *   imageUpload: s3.image().maxFileSize('5MB'),
     *   documentUpload: s3.file({ maxSize: '10MB' }),
     *
     *   // Using route with middleware
     *   avatarUpload: s3.image()
     *     .maxFileSize('2MB')
     *     .middleware(async ({ metadata }) => ({
     *       ...metadata,
     *       userId: metadata.userId || 'anonymous',
     *     })),
     * });
     * ```
     */
    createRouter: <TRoutes extends Record<string, any>>(routes: TRoutes) =>
      smartCreateRouter(routes, config),
  };
}

// ========================================
// Upload Configuration Types
// ========================================

/**
 * Complete upload configuration interface defining all aspects of file upload behavior.
 * This configuration is created by the UploadConfigBuilder and used throughout the system.
 *
 * @interface UploadConfig
 *
 * @example
 * ```typescript
 * const config: UploadConfig = {
 *   provider: {
 *     provider: "aws",
 *     bucket: "my-bucket",
 *     region: "us-east-1",
 *     accessKeyId: "...",
 *     secretAccessKey: "...",
 *   },
 *   defaults: {
 *     maxFileSize: '10MB',
 *     acl: 'public-read',
 *   },
 *   paths: { prefix: 'uploads' },
 * };
 * ```
 */
export interface UploadConfig {
  /** Storage provider configuration (AWS S3, Cloudflare R2, etc.) */
  provider: ProviderConfig;
  /**
   * Enable debug logging.
   *
   * Also controls error redaction: with `debug` on, server-side (5xx) failures
   * return their real message and `meta` instead of a generic title. Leave it
   * off in production so internal detail does not reach clients.
   */
  debug?: boolean;
  /** Enable metrics collection */
  enableMetrics?: boolean;
  /**
   * Multipart upload behaviour.
   *
   * Entirely optional: with no configuration, files above the default
   * threshold transparently use multipart and everything below keeps the
   * single-PUT path. The client API is identical either way — same
   * `uploadFiles`, same per-file `progress`, `uploadSpeed` and `eta`.
   */
  multipart?: {
    /**
     * Disable multipart entirely, keeping every file on a single PUT.
     *
     * Files above the provider's 5 GiB single-PUT ceiling will then fail, so
     * this is only sensible when large uploads are not expected.
     * @default true
     */
    enabled?: boolean;
    /**
     * Size at or above which a file is split into parts.
     * @default 104857600 (100 MiB)
     */
    threshold?: number;
    /**
     * Uniform part size, in bytes. Clamped into the provider-safe range and
     * raised if it would exceed the 10,000-part cap.
     * @default 5242880 (5 MiB)
     */
    partSize?: number;
    /**
     * How many parts to transfer at once.
     * @default 4
     */
    concurrency?: number;
    /**
     * Attempts per part, including the first.
     * @default 3
     */
    maxAttempts?: number;
  };

  /**
   * Maximum accepted request body size, in bytes.
   *
   * Bounds a denial-of-service vector: without a limit, a hostile client can
   * post an arbitrarily large metadata blob to the presign endpoint.
   *
   * @default 102400 (100 KB)
   */
  maxRequestBodyBytes?: number;
  /**
   * Shape error responses before they are sent.
   *
   * Runs after redaction, so it sees exactly what would otherwise be returned.
   * Use it for observability (attaching a trace id), for localisation, or to
   * match an existing API error convention.
   *
   * Deliberately generic: pushduck emits RFC 9457 problem documents and knows
   * nothing about your framework's error type. Translating to one — a tRPC
   * code, an Effect failure, your own envelope — belongs in your code, where a
   * change upstream cannot break this library.
   *
   * Returning `undefined` keeps the default document. A throw is logged and
   * the default is sent, so an error while reporting an error never escalates.
   *
   * @example Attach a trace id
   * ```typescript
   * createUploadConfig().errorFormatter(({ problem, request }) => ({
   *   ...problem,
   *   traceId: request.headers.get("x-trace-id") ?? undefined,
   * }))
   * ```
   *
   * @example Report server failures to your monitoring
   * ```typescript
   * .errorFormatter(({ error, problem }) => {
   *   if (!error.isClientError) Sentry.captureException(error);
   *   return problem;
   * })
   * ```
   */
  errorFormatter?: (context: {
    /** The normalised error, with `code`, `status`, `retryable`, and `cause`. */
    error: import("../errors").UploadError;
    /** The problem document as it would be sent, redaction already applied. */
    problem: import("../errors").ProblemDetails;
    /** The request that failed. */
    request: Request;
  }) => import("../errors").ProblemDetails | undefined;
  /** Default constraints and settings applied to all uploads */
  defaults?: {
    /** Maximum file size (string like '10MB' or number in bytes) */
    maxFileSize?: string | number;
    /** Allowed MIME types (e.g., ['image/*', 'application/pdf']) */
    allowedFileTypes?: readonly string[];
    /**
     * S3 ACL for uploaded objects.
     * Not supported on Cloudflare R2, MinIO or Neon Object Storage — ignored on
     * those providers.
     */
    acl?: import("../providers/providers").S3AclValue;
    /** Default metadata attached to all uploads */
    metadata?: Record<string, any>;
  };

  /**
   * Keys every route shares. A key is `{prefix}/{route prefix}/{name}`; routes
   * set their own folder and name with `.paths({ prefix, name })`.
   */
  paths?: {
    /** Folder every key lives under, e.g. `uploads`. */
    prefix?: string;
    /**
     * The part of the key below the prefixes, for routes that do not set
     * `name`. Do not include the prefix; it is added for you. Prefer a
     * route's `name`, which receives typed metadata.
     *
     * @param file - File information object
     * @param metadata - Middleware output for the route
     * @returns A relative path; each segment is sanitised
     */
    generateKey?: (
      file: { name: string; type: string },
      metadata: any
    ) => string;
  };

  /** Security and access control settings */
  security?: {
    /** Whether authentication is required for uploads */
    requireAuth?: boolean;
    /** Allowed origins for CORS (if applicable) */
    allowedOrigins?: readonly string[];
    /** Rate limiting configuration */
    rateLimiting?: {
      /** Maximum uploads per window */
      maxUploads?: number;
      /** Time window in milliseconds */
      windowMs?: number;
    };
  };

  /** Lifecycle hooks for upload events */
  hooks?: {
    /**
     * Called when an upload starts
     * @param ctx - Context object with file and metadata
     */
    onUploadStart?: (ctx: { file: any; metadata: any }) => Promise<void> | void;
    /**
     * Called when an upload completes successfully
     * @param ctx - Context object with file, URL, and metadata
     */
    onUploadComplete?: (ctx: {
      file: any;
      url: string;
      metadata: any;
    }) => Promise<void> | void;
    /**
     * Called when an upload fails
     * @param ctx - Context object with file, error, and metadata
     */
    onUploadError?: (ctx: {
      file: any;
      error: Error;
      metadata: any;
    }) => Promise<void> | void;
  };
}

// ========================================
// Configuration Builder
// ========================================

/**
 * Builder class for creating upload configurations with a fluent API.
 * Provides type-safe configuration of providers, defaults, paths, security, and hooks.
 *
 * @class UploadConfigBuilder
 *
 * @example Basic Usage
 * ```typescript
 * const config = new UploadConfigBuilder()
 *   .provider("aws", { bucket: "my-bucket", region: "us-east-1" })
 *   .defaults({ maxFileSize: '10MB' })
 *   .build();
 * ```
 *
 * @example Advanced Configuration
 * ```typescript
 * const config = new UploadConfigBuilder()
 *   .provider("cloudflareR2", {
 *     accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
 *     bucket: "uploads",
 *     accessKeyId: process.env.R2_ACCESS_KEY!,
 *     secretAccessKey: process.env.R2_SECRET_KEY!,
 *     region: "auto",
 *   })
 *   .defaults({
 *     maxFileSize: '50MB',
 *     allowedFileTypes: ['image/*', 'video/*'],
 *     acl: 'public-read',
 *   })
 *   .paths({ prefix: 'user-content' })
 *   .security({
 *     requireAuth: true,
 *     allowedOrigins: ['https://myapp.com'],
 *     rateLimiting: { maxUploads: 10, windowMs: 60000 },
 *   })
 *   .hooks({
 *     onUploadComplete: async ({ file, url, metadata }) => {
 *       await logUpload(metadata.userId, file.name, url);
 *     },
 *   })
 *   .build();
 * ```
 */
export class UploadConfigBuilder {
  private config: Partial<UploadConfig> = {};

  /**
   * Set instead of `config.provider` when the provider options were given as
   * a function: resolves and validates them on first use. See `.provider()`.
   */
  private resolveProvider?: () => ProviderConfig;

  /**
   * Sets the storage provider.
   *
   * Options may be given as a function. It is called the first time an
   * operation needs storage — a presign, a completion, a `storage` call —
   * not when the config is built, so importing the module never reads
   * credentials. That is what lets `next build` (and any other build step that
   * evaluates route modules) run without them, and it is the recommended form
   * wherever options come from the environment. Missing or invalid options
   * then fail that operation with `CONFIG_INVALID`, naming the option, and
   * `isConfigured()` reports them without throwing.
   *
   * Options given as an object are validated immediately, which suits values
   * known at startup — a fixed local MinIO, a test.
   *
   * @overload
   * @param providerConfig - Complete provider configuration object
   * @returns This builder instance for method chaining
   *
   * @overload
   * @template T - The provider type
   * @param type - Provider type string (e.g., "aws", "cloudflareR2")
   * @param options - The provider's options, or a function returning them
   * @returns This builder instance for method chaining
   *
   * @example Options read on first use (recommended)
   * ```typescript
   * builder.provider("aws", () => ({
   *   bucket: process.env.AWS_BUCKET,
   *   region: process.env.AWS_REGION,
   *   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
   *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
   * }));
   * ```
   *
   * @example Options validated immediately
   * ```typescript
   * builder.provider("minio", {
   *   endpoint: "http://localhost:9000",
   *   bucket: "dev-uploads",
   *   accessKeyId: "minioadmin",
   *   secretAccessKey: "minioadmin",
   * });
   * ```
   *
   * @example Direct Provider Config
   * A config object is used as given — not defaulted, derived or normalised
   * — and only validated by `build()`. Prefer the `(type, options)` form, or
   * pass the result of `createProvider`.
   * ```typescript
   * builder.provider({
   *   provider: "aws",
   *   bucket: "my-bucket",
   *   region: "us-east-1",
   *   accessKeyId: "...",
   *   secretAccessKey: "...",
   * });
   * ```
   */
  provider(providerConfig: ProviderConfig): UploadConfigBuilder;
  provider<T extends ProviderType>(
    type: T,
    options: ProviderConfigMap[T] | (() => ProviderConfigMap[T])
  ): UploadConfigBuilder;
  provider<T extends ProviderType>(
    providerOrType: ProviderConfig | T,
    options?: ProviderConfigMap[T] | (() => ProviderConfigMap[T])
  ): UploadConfigBuilder {
    this.resolveProvider = undefined;
    delete this.config.provider;

    if (typeof providerOrType !== "string") {
      // Direct config object: provider(configObject)
      this.config.provider = providerOrType;
    } else if (typeof options === "function") {
      // Lazy: provider("aws", () => ({ bucket: process.env.BUCKET }))
      this.resolveProvider = lazyProvider(providerOrType, options);
    } else {
      // Eager: provider("aws", { bucket: "...", region: "..." })
      this.config.provider = createProvider(
        providerOrType,
        options as ProviderConfigMap[T]
      );
    }
    return this;
  }

  /**
   * Sets default file constraints and upload settings.
   * These defaults are applied to all routes unless overridden at the route level.
   *
   * @param defaults - Default configuration object
   * @returns This builder instance for method chaining
   *
   * @example
   * ```typescript
   * builder.defaults({
   *   maxFileSize: '10MB',
   *   allowedFileTypes: ['image/jpeg', 'image/png', 'application/pdf'],
   *   acl: 'public-read',
   *   metadata: {
   *     uploadedBy: 'system',
   *     environment: process.env.NODE_ENV,
   *   },
   * });
   * ```
   */
  defaults(defaults: UploadConfig["defaults"]): UploadConfigBuilder {
    this.config.defaults = { ...this.config.defaults, ...defaults };
    return this;
  }

  /**
   * Configures file paths and key generation strategy.
   * Sets up how files are organized and named in the storage bucket.
   *
   * @param paths - Path configuration object
   * @returns This builder instance for method chaining
   *
   * @example Simple Prefix
   * ```typescript
   * builder.paths({
   *   prefix: 'uploads',
   * });
   * ```
   *
   * @example Custom Key Generation
   * ```typescript
   * builder.paths({
   *   prefix: 'uploads',
   * });
   * // Routes nest under it:
   * // s3.image().paths({ prefix: ({ metadata }) => `users/${metadata.userId}`, name: 'unique' })
   * // → uploads/users/42/avatar-k3x9m2a7qp.png
   * ```
   */
  paths(paths: UploadConfig["paths"]): UploadConfigBuilder {
    this.config.paths = { ...this.config.paths, ...paths };
    return this;
  }

  /**
   * Configures security settings including authentication and rate limiting.
   *
   * @param security - Security configuration object
   * @returns This builder instance for method chaining
   *
   * @example
   * ```typescript
   * builder.security({
   *   requireAuth: true,
   *   allowedOrigins: ['https://myapp.com', 'https://admin.myapp.com'],
   *   rateLimiting: {
   *     maxUploads: 10,
   *     windowMs: 60000, // 1 minute
   *   },
   * });
   * ```
   */
  security(security: UploadConfig["security"]): UploadConfigBuilder {
    this.config.security = { ...this.config.security, ...security };
    return this;
  }

  /**
   * Adds lifecycle hooks for upload events.
   * Hooks allow you to execute custom logic at different stages of the upload process.
   *
   * @param hooks - Lifecycle hooks configuration
   * @returns This builder instance for method chaining
   *
   * @example
   * ```typescript
   * builder.hooks({
   *   onUploadStart: async ({ file, metadata }) => {
   *     console.log(`Starting upload: ${file.name}`);
   *     await logEvent('upload_start', { fileName: file.name });
   *   },
   *   onUploadComplete: async ({ file, url, metadata }) => {
   *     console.log(`Upload complete: ${file.name} -> ${url}`);
   *     await updateDatabase(metadata.userId, file.name, url);
   *     await sendNotification(metadata.userId, 'Upload complete');
   *   },
   *   onUploadError: async ({ file, error, metadata }) => {
   *     console.error(`Upload failed: ${file.name}`, error);
   *     await logError('upload_error', { fileName: file.name, error: error.message });
   *     await sendAlert('Upload failed', error);
   *   },
   * });
   * ```
   */
  hooks(hooks: UploadConfig["hooks"]): UploadConfigBuilder {
    this.config.hooks = { ...this.config.hooks, ...hooks };
    return this;
  }

  /**
   * Enable debug mode
   * @param enabled - Whether to enable debug mode
   * @returns This builder instance for method chaining
   */
  debug(enabled: boolean = true): UploadConfigBuilder {
    this.config.debug = enabled;
    return this;
  }

  /**
   * Bound the accepted request body size, in bytes.
   *
   * @param bytes - Maximum body size. Defaults to 100 KB when unset.
   */
  maxRequestBodyBytes(bytes: number): UploadConfigBuilder {
    this.config.maxRequestBodyBytes = bytes;
    return this;
  }

  /**
   * Shape error responses before they are sent.
   *
   * Runs after redaction, so the formatter sees exactly what would otherwise
   * be returned. Return `undefined` to keep the default document.
   *
   * @example Attach a trace id and report server failures
   * ```typescript
   * createUploadConfig()
   *   .errorFormatter(({ error, problem, request }) => {
   *     if (!error.isClientError) Sentry.captureException(error);
   *     return { ...problem, traceId: request.headers.get("x-trace-id") };
   *   })
   * ```
   */
  errorFormatter(
    formatter: NonNullable<UploadConfig["errorFormatter"]>
  ): UploadConfigBuilder {
    this.config.errorFormatter = formatter;
    return this;
  }

  /**
   * Enable metrics collection
   */
  metrics(enabled: boolean = true): UploadConfigBuilder {
    this.config.enableMetrics = enabled;
    return this;
  }

  /**
   * Builds the final configuration and returns configured instances.
   * Creates the upload config, storage instance and upload builder.
   *
   * Provider options given as an object are validated here; options given as
   * a function are validated on first use instead, so building never reads
   * them.
   *
   * @returns Object containing the built configuration and helper instances
   * @throws {Error} If no provider is set, or eager provider options are invalid
   *
   * @example
   * ```typescript
   * const { config, storage, s3 } = createUploadConfig()
   *   .provider("aws", { bucket: "my-bucket", region: "us-east-1" })
   *   .defaults({ maxFileSize: '10MB' })
   *   .build();
   *
   * // Use the storage instance
   * const files = await storage.list.files();
   *
   * // Create routes with the s3 builder
   * const router = s3.createRouter({
   *   imageUpload: s3.image().maxFileSize('5MB'),
   *   documentUpload: s3.file({ maxSize: '10MB' }),
   * });
   * ```
   */
  build(): UploadInitResult {
    // A copy, so building twice — or configuring the builder further after a
    // build — never changes a config already handed out.
    const finalConfig = { ...this.config } as UploadConfig;

    if (this.resolveProvider) {
      // `provider` is read by every operation that talks to storage and by
      // nothing that merely defines routes or mounts handlers, so reading it
      // is exactly "first use". A getter keeps that one rule in one place:
      // the storage client, the router and user code that inspects
      // `config.provider` all resolve the same way, with nothing to forget.
      const resolve = this.resolveProvider;
      let warned = false;
      Object.defineProperty(finalConfig, "provider", {
        get: () => {
          const provider = resolve();
          if (!warned) {
            warned = true;
            warnIfAclIgnored(provider, finalConfig.defaults?.acl ?? provider.acl);
          }
          return provider;
        },
        enumerable: true,
      });
    } else if (!finalConfig.provider) {
      throw new Error("Provider configuration is required");
    } else {
      const validation = validateProviderConfig(finalConfig.provider);
      if (!validation.valid) {
        throw new Error(
          `Invalid provider configuration: ${validation.errors.join(", ")}`
        );
      }
      // Same precedence the storage client uses when it sends x-amz-acl.
      warnIfAclIgnored(
        finalConfig.provider,
        finalConfig.defaults?.acl ?? finalConfig.provider.acl
      );
    }

    // Configure logger and metrics based on config
    if (finalConfig.debug !== undefined) {
      logger.setDebugMode(finalConfig.debug);
    }

    if (finalConfig.enableMetrics !== undefined) {
      metrics.setEnabled(finalConfig.enableMetrics);
    }

    logger.info("📦 Upload configuration initialized", {
      provider: this.resolveProvider
        ? "resolved on first use"
        : finalConfig.provider.provider,
    });

    // Create storage instance with config
    const storage = createStorage(finalConfig);

    // Create upload builder instance with config
    const upload = createS3Instance(finalConfig);

    return {
      config: finalConfig,
      storage,
      upload,
      isConfigured: () => {
        try {
          void finalConfig.provider;
          return true;
        } catch {
          return false;
        }
      },
      /** @deprecated Use `upload` instead. The `s3` name is misleading when using R2, MinIO, or other providers. */
      get s3() {
        console.warn(
          '⚠️ pushduck: Destructuring `s3` from build() is deprecated. Use `upload` instead: const { upload } = createUploadConfig()...build()'
        );
        return upload;
      },
    };
  }
}

/**
 * Resolves provider options given as a function, on first call.
 *
 * Success is cached: credentials do not change under a running process, and
 * every request would otherwise re-run validation. Failure is not, so a value
 * that becomes available later — a secret fetched at startup, a binding that
 * exists only inside a request — is picked up by the next call instead of the
 * process having to restart.
 *
 * Failures are `CONFIG_INVALID` whatever their source, so a request that hits
 * one gets a 500 "Upload is misconfigured" rather than an error blamed on
 * storage, and the message names the missing option for the server log.
 *
 * Two requests racing to be first may both resolve; they produce the same
 * config, so whichever is cached last is as good as the other.
 */
function lazyProvider<T extends ProviderType>(
  type: T,
  options: () => ProviderConfigMap[T]
): () => ProviderConfig {
  // The provider name is in the code, not the environment, so a typo is
  // reported when the config is written rather than at the first upload.
  if (!Object.hasOwn(PROVIDERS, type)) {
    throw new Error(`Unknown provider type: ${type}`);
  }

  let resolved: ProviderConfig | undefined;

  return () => {
    if (resolved) return resolved;

    try {
      resolved = createProvider(type, options());
    } catch (error) {
      throw new UploadError(
        "CONFIG_INVALID",
        `The ${type} provider is not configured. ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      );
    }

    return resolved;
  };
}

/**
 * Result object returned from the upload configuration builder.
 * Contains the built configuration and helper instances for creating routes and managing storage.
 *
 * @interface UploadInitResult
 *
 * @example
 * ```typescript
 * const { config, storage, s3 } = createUploadConfig()
 *   .provider("aws", { bucket: "my-bucket", region: "us-east-1" })
 *   .build();
 *
 * // Access the raw configuration
 * console.log(config.provider.bucket); // "my-bucket"
 *
 * // Use storage operations
 * const files = await storage.list.files();
 * const fileInfo = await storage.metadata.getInfo('path/to/file.jpg');
 *
 * // Create typed routers
 * const router = s3.createRouter({
 *   imageUpload: s3.image().maxFileSize('5MB'),
 *   documentUpload: s3.file({ maxSize: '10MB' }),
 * });
 * ```
 */
export interface UploadInitResult {
  /**
   * The complete upload configuration object.
   *
   * When the provider options were given as a function, reading
   * `config.provider` resolves them, and throws `CONFIG_INVALID` if they are
   * missing or invalid.
   */
  config: UploadConfig;
  /**
   * Whether the provider options resolve to a valid provider. Never throws.
   *
   * Always `true` for options given as an object, which are validated when
   * the config is built. For options given as a function, this resolves them
   * — the same validation a request would run — so a route can answer
   * "storage not configured" itself, or a health endpoint can report it.
   *
   * @example
   * ```typescript
   * if (!isConfigured()) {
   *   return new Response("Uploads are not configured", { status: 503 });
   * }
   * ```
   */
  isConfigured: () => boolean;
  /** Storage instance for file operations (list, delete, info, etc.) */
  storage: StorageInstance;
  /** Provider-neutral upload builder with schema builders and router factory */
  upload: UploadBuilder;
  /**
   * @deprecated Use `upload` instead.
   * The `s3` name is misleading when using Cloudflare R2, MinIO, or other providers.
   */
  s3: UploadBuilder;
}

/**
 * Creates a new upload configuration builder instance.
 * This is the main entry point for configuring pushduck with providers, defaults, and settings.
 *
 * @returns A new UploadConfigBuilder instance
 *
 * @example Basic AWS Setup
 * ```typescript
 * export const { upload, storage, isConfigured } = createUploadConfig()
 *   .provider("aws", () => ({
 *     bucket: process.env.AWS_BUCKET_NAME,
 *     region: process.env.AWS_REGION,
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 *   }))
 *   .defaults({
 *     maxFileSize: '10MB',
 *     acl: 'public-read',
 *   })
 *   .build();
 * ```
 *
 * @example Cloudflare R2 Setup
 * ```typescript
 * const { s3 } = createUploadConfig()
 *   .provider("cloudflareR2", {
 *     accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
 *     bucket: process.env.R2_BUCKET!,
 *     accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
 *     region: "auto",
 *   })
 *   .paths({ prefix: 'user-uploads' })
 *   .hooks({
 *     onUploadComplete: async ({ file, url, metadata }) => {
 *       await logUpload(metadata.userId, file.name, url);
 *     },
 *   })
 *   .build();
 * ```
 *
 * @example Multi-Environment Configuration
 * ```typescript
 * const isDevelopment = process.env.NODE_ENV === 'development';
 *
 * const { s3 } = createUploadConfig()
 *   .provider(isDevelopment ? "minio" : "aws",
 *     isDevelopment
 *       ? {
 *           endpoint: "localhost:9000",
 *           bucket: "dev-uploads",
 *           accessKeyId: "minioadmin",
 *           secretAccessKey: "minioadmin",
 *           useSSL: false,
 *         }
 *       : {
 *           bucket: process.env.AWS_BUCKET_NAME!,
 *           region: process.env.AWS_REGION!,
 *           accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *           secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *         }
 *   )
 *   .defaults({
 *     maxFileSize: isDevelopment ? '50MB' : '10MB',
 *     acl: 'public-read',
 *   })
 *   .build();
 * ```
 */
export function createUploadConfig(): UploadConfigBuilder {
  return new UploadConfigBuilder();
}
