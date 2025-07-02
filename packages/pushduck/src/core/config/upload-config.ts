/**
 * Upload Configuration System
 *
 * This provides a clean way to initialize and manage upload configurations
 * that can be used across routes and components.
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

// Smart router factory that handles schema-to-route conversion
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

// Config-aware S3 Builder Instance Factory
function createS3Instance(config: UploadConfig) {
  return {
    // Schema builders
    file: (constraints?: S3FileConstraints) => new S3FileSchema(constraints),
    image: (constraints?: S3FileConstraints) => new S3ImageSchema(constraints),
    object: <T extends Record<string, any>>(shape: T) =>
      new S3ObjectSchema(shape),

    // ✅ Config-aware router factory
    createRouter: <TRoutes extends Record<string, any>>(routes: TRoutes) =>
      smartCreateRouter(routes, config),
  } as const;
}

// ========================================
// Upload Configuration Types
// ========================================

export interface UploadConfig {
  provider: ProviderConfig;
  debug?: boolean;
  enableMetrics?: boolean;
  defaults?: {
    maxFileSize?: string | number;
    allowedFileTypes?: string[];
    acl?: string;
    metadata?: Record<string, any>;
  };
  paths?: {
    // Global prefix - forms the base of all file paths
    prefix?: string;
    // Global key generation - used as foundation for hierarchical paths
    // Route-level paths will be nested within this structure
    generateKey?: (
      file: { name: string; type: string },
      metadata: any
    ) => string;
  };
  security?: {
    requireAuth?: boolean;
    allowedOrigins?: string[];
    rateLimiting?: {
      maxUploads?: number;
      windowMs?: number;
    };
  };
  hooks?: {
    onUploadStart?: (ctx: { file: any; metadata: any }) => Promise<void> | void;
    onUploadComplete?: (ctx: {
      file: any;
      url: string;
      metadata: any;
    }) => Promise<void> | void;
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

export class UploadConfigBuilder {
  private config: Partial<UploadConfig> = {};

  /**
   * Set the storage provider with type-safe configuration
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
   * Set default file constraints
   */
  defaults(defaults: UploadConfig["defaults"]): UploadConfigBuilder {
    this.config.defaults = { ...this.config.defaults, ...defaults };
    return this;
  }

  /**
   * Configure file paths and key generation
   */
  paths(paths: UploadConfig["paths"]): UploadConfigBuilder {
    this.config.paths = { ...this.config.paths, ...paths };
    return this;
  }

  /**
   * Configure security settings
   */
  security(security: UploadConfig["security"]): UploadConfigBuilder {
    this.config.security = { ...this.config.security, ...security };
    return this;
  }

  /**
   * Add lifecycle hooks
   */
  hooks(hooks: UploadConfig["hooks"]): UploadConfigBuilder {
    this.config.hooks = { ...this.config.hooks, ...hooks };
    return this;
  }

  /**
   * Enable debug mode
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
   * Build the final configuration and return configured instances
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

    const config = this.config as UploadConfig;

    // Configure logger and metrics based on config
    if (config.debug !== undefined) {
      logger.setDebugMode(config.debug);
    }

    if (config.enableMetrics !== undefined) {
      metrics.setEnabled(config.enableMetrics);
    }

    const storage = createStorage(config);
    const s3Instance = createS3Instance(config);

    // Log successful configuration
    logger.info("📦 Upload configuration initialized", {
      provider: config.provider.provider,
    });

    return { config, storage, s3: s3Instance };
  }
}

// ========================================
// Result Types
// ========================================

export interface UploadInitResult {
  config: UploadConfig;
  storage: StorageInstance;
  s3: ReturnType<typeof createS3Instance>;
}

// ========================================
// Modern Configuration API
// ========================================

/**
 * Create a new upload configuration builder
 * This is the recommended way to configure pushduck
 */
export function createUploadConfig(): UploadConfigBuilder {
  return new UploadConfigBuilder();
}
