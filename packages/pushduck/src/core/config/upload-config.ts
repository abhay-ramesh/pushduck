/**
 * @fileoverview Upload Configuration System
 *
 * This module provides a builder pattern for configuring pushduck with type-safe
 * provider settings, validation rules, path generation, and lifecycle hooks.
 *
 * @example Basic AWS Configuration
 * ```typescript
 * const { s3, config } = createUploadConfig()
 *   .provider("aws", {
 *     bucket: "my-bucket",
 *     region: "us-east-1",
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *   })
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

import {
  createProvider,
  validateProviderConfig,
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
): S3Router<{
  [K in keyof TRoutes]: TRoutes[K] extends S3Route<any, any>
    ? TRoutes[K]
    : S3Route<any, any>;
}> {
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
  return createS3RouterWithConfig(convertedRoutes, config) as any as S3Router<{
    [K in keyof TRoutes]: TRoutes[K] extends S3Route<any, any>
      ? TRoutes[K]
      : S3Route<any, any>;
  }>;
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
 *   avatarUpload: s3.image().max('2MB'),
 *   documentUpload: s3.file({ maxSize: '10MB' }),
 * });
 * ```
 */
function createS3Instance(config: UploadConfig) {
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
     *   imageUpload: s3.image().max('5MB'),
     *   documentUpload: s3.file({ maxSize: '10MB' }),
     *
     *   // Using route with middleware
     *   avatarUpload: s3.image()
     *     .max('2MB')
     *     .middleware(async ({ metadata }) => ({
     *       ...metadata,
     *       userId: metadata.userId || 'anonymous',
     *     })),
     * });
     * ```
     */
    createRouter: <TRoutes extends Record<string, any>>(routes: TRoutes) =>
      smartCreateRouter(routes, config),
  } as const;
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
 *   paths: {
 *     prefix: 'uploads',
 *     generateKey: (file, metadata) => `${metadata.userId}/${file.name}`,
 *   },
 * };
 * ```
 */
export interface UploadConfig {
  /** Storage provider configuration (AWS S3, Cloudflare R2, etc.) */
  provider: ProviderConfig;
  /** Enable debug logging */
  debug?: boolean;
  /** Enable metrics collection */
  enableMetrics?: boolean;
  /** Default constraints and settings applied to all uploads */
  defaults?: {
    /** Maximum file size (string like '10MB' or number in bytes) */
    maxFileSize?: string | number;
    /** Allowed MIME types (e.g., ['image/*', 'application/pdf']) */
    allowedFileTypes?: string[];
    /** S3 ACL setting ('public-read', 'private', etc.) */
    acl?: string;
    /** Default metadata attached to all uploads */
    metadata?: Record<string, any>;
  };

  /** Path configuration for organizing uploaded files */
  paths?: {
    /** Global prefix prepended to all file paths */
    prefix?: string;
    /**
     * Global key generation function for creating file paths.
     * Route-level paths will be nested within this structure.
     *
     * @param file - File information object
     * @param metadata - Upload metadata from the request
     * @returns The generated file key/path
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
    allowedOrigins?: string[];
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
 *   .paths({
 *     prefix: 'user-content',
 *     generateKey: (file, metadata) => {
 *       const userId = metadata.userId || 'anonymous';
 *       const timestamp = Date.now();
 *       return `${userId}/${timestamp}/${file.name}`;
 *     },
 *   })
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
   * Sets the storage provider with type-safe configuration.
   * Supports both direct provider config objects and type-safe provider creation.
   *
   * @overload
   * @param providerConfig - Complete provider configuration object
   * @returns This builder instance for method chaining
   *
   * @overload
   * @template T - The provider type
   * @param type - Provider type string (e.g., "aws", "cloudflareR2")
   * @param config - Type-safe configuration for the specified provider
   * @returns This builder instance for method chaining
   *
   * @example Direct Provider Config
   * ```typescript
   * builder.provider({
   *   provider: "aws",
   *   bucket: "my-bucket",
   *   region: "us-east-1",
   *   accessKeyId: "...",
   *   secretAccessKey: "...",
   * });
   * ```
   *
   * @example Type-Safe Provider Creation
   * ```typescript
   * builder.provider("aws", {
   *   bucket: "my-bucket",
   *   region: "us-east-1",
   *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
   *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
   * });
   * ```
   */
  provider(providerConfig: ProviderConfig): UploadConfigBuilder;
  provider<T extends ProviderType>(
    type: T,
    config: ProviderConfigMap[T]
  ): UploadConfigBuilder;
  provider<T extends ProviderType>(
    providerOrType: ProviderConfig | T,
    config?: ProviderConfigMap[T]
  ): UploadConfigBuilder {
    if (typeof providerOrType === "string") {
      // Type-safe API: provider("aws", { bucket: "...", region: "..." })
      this.config.provider = createProvider(
        providerOrType,
        config as ProviderConfigMap[T]
      );
    } else {
      // Direct config object: provider(configObject)
      this.config.provider = providerOrType;
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
   *   prefix: 'user-content',
   *   generateKey: (file, metadata) => {
   *     const userId = metadata.userId || 'anonymous';
   *     const timestamp = Date.now();
   *     const randomId = Math.random().toString(36).substring(2, 8);
   *     const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
   *     return `${userId}/${timestamp}/${randomId}/${sanitizedName}`;
   *   },
   * });
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
   * Enable metrics collection
   */
  metrics(enabled: boolean = true): UploadConfigBuilder {
    this.config.enableMetrics = enabled;
    return this;
  }

  /**
   * Builds the final configuration and returns configured instances.
   * Validates the configuration and creates the upload config, storage instance, and S3 builder.
   *
   * @returns Object containing the built configuration and helper instances
   * @throws {Error} If provider configuration is missing or invalid
   *
   * @example
   * ```typescript
   * const { config, storage, s3 } = createUploadConfig()
   *   .provider("aws", { bucket: "my-bucket", region: "us-east-1" })
   *   .defaults({ maxFileSize: '10MB' })
   *   .build();
   *
   * // Use the storage instance
   * const files = await storage.listFiles();
   *
   * // Create routes with the s3 builder
   * const router = s3.createRouter({
   *   imageUpload: s3.image().max('5MB'),
   *   documentUpload: s3.file({ maxSize: '10MB' }),
   * });
   * ```
   */
  build(): UploadInitResult {
    if (!this.config.provider) {
      throw new Error("Provider configuration is required");
    }

    const validation = validateProviderConfig(this.config.provider);
    if (!validation.valid) {
      throw new Error(
        `Invalid provider configuration: ${validation.errors.join(", ")}`
      );
    }

    const finalConfig = this.config as UploadConfig;

    // Configure logger and metrics based on config
    if (finalConfig.debug !== undefined) {
      logger.setDebugMode(finalConfig.debug);
    }

    if (finalConfig.enableMetrics !== undefined) {
      metrics.setEnabled(finalConfig.enableMetrics);
    }

    // Log successful configuration
    logger.info("📦 Upload configuration initialized", {
      provider: finalConfig.provider.provider,
    });

    // Create storage instance with config
    const storage = createStorage(finalConfig);

    // Create S3 builder instance with config
    const s3 = createS3Instance(finalConfig);

    return {
      config: finalConfig,
      storage,
      s3,
    };
  }
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
 * const files = await storage.listFiles();
 * const fileInfo = await storage.getFileInfo('path/to/file.jpg');
 *
 * // Create typed routers
 * const router = s3.createRouter({
 *   imageUpload: s3.image().max('5MB'),
 *   documentUpload: s3.file({ maxSize: '10MB' }),
 * });
 * ```
 */
export interface UploadInitResult {
  /** The complete upload configuration object */
  config: UploadConfig;
  /** Storage instance for file operations (list, delete, info, etc.) */
  storage: StorageInstance;
  /** S3 builder instance with schema builders and router factory */
  s3: ReturnType<typeof createS3Instance>;
}

/**
 * Creates a new upload configuration builder instance.
 * This is the main entry point for configuring pushduck with providers, defaults, and settings.
 *
 * @returns A new UploadConfigBuilder instance
 *
 * @example Basic AWS Setup
 * ```typescript
 * const { s3, config, storage } = createUploadConfig()
 *   .provider("aws", {
 *     bucket: process.env.AWS_BUCKET_NAME!,
 *     region: process.env.AWS_REGION!,
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *   })
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
 *   .paths({
 *     prefix: 'user-uploads',
 *     generateKey: (file, metadata) => {
 *       const userId = metadata.userId || 'anonymous';
 *       const timestamp = Date.now();
 *       return `${userId}/${timestamp}/${file.name}`;
 *     },
 *   })
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
