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
import {
  createS3Router,
  createS3RouterWithConfig,
  S3Route,
} from "../router/router-v2";
import {
  S3FileConstraints,
  S3FileSchema,
  S3ImageSchema,
  S3ObjectSchema,
} from "../schema";
import { createStorage, type StorageInstance } from "../storage/storage-api";
import { logger } from "../utils/logger";

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

  // ✅ PHASE 2 FIX: Use config-aware router factory
  return createS3RouterWithConfig(convertedRoutes, config) as any as S3Router<{
    [K in keyof TRoutes]: TRoutes[K] extends S3Route<any, any>
      ? TRoutes[K]
      : S3Route<any, any>;
  }>;
}

/**
 * @deprecated Legacy function for backward compatibility
 * Use the config-aware version instead
 */
function legacySmartCreateRouter<TRoutes extends Record<string, any>>(
  routes: TRoutes
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

  // Use the deprecated global config factory
  return createS3Router(convertedRoutes) as any as S3Router<{
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

    // ✅ PHASE 2 FIX: Config-aware router factory
    createRouter: <TRoutes extends Record<string, any>>(routes: TRoutes) =>
      smartCreateRouter(routes, config),
  } as const;
}

// Legacy global S3 instance (for backward compatibility)
// ⚠️ This will fall back to global config and should be deprecated
export const s3 = {
  // Schema builders
  file: (constraints?: S3FileConstraints) => new S3FileSchema(constraints),
  image: (constraints?: S3FileConstraints) => new S3ImageSchema(constraints),
  object: <T extends Record<string, any>>(shape: T) =>
    new S3ObjectSchema(shape),

  // Legacy router factory that uses global config
  createRouter: legacySmartCreateRouter,
} as const;

// ========================================
// Upload Configuration Types
// ========================================

export interface UploadConfig {
  provider: ProviderConfig;
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

    // ✅ CRITICAL FIX: NO MORE GLOBAL STATE MUTATION!
    // The line below was the root cause of all global state issues:
    // globalUploadConfig = config; // 🚨 REMOVED

    // 🔄 TEMPORARY COMPATIBILITY: Set global state ONLY for first config
    // This prevents overwrites but maintains backward compatibility for single-config apps
    if (!isConfigInitialized()) {
      globalUploadConfig = config;
      configInitialized = true; // ✅ Fix: Set the flag properly
      logger.info(
        `[COMPATIBILITY] Setting global config for backward compatibility. Future configs will be independent.`
      );
    }

    logger.configInit(config.provider.provider, {
      provider: config.provider.provider,
    });

    // Create storage instance with config
    const storage = createStorage(config);

    // Create config-aware S3 instance
    const s3Instance = createS3Instance(config);

    return {
      config,
      storage,
      s3: s3Instance, // ✅ Config-aware instance instead of global
    };
  }
}

// ========================================
// Configuration Factory Functions
// ========================================

/**
 * Create a new upload configuration
 */
export function createUploadConfig(): UploadConfigBuilder {
  return new UploadConfigBuilder();
}

/**
 * @deprecated Use createUploadConfig() instead
 * Create upload configuration with type-safe provider setup
 */
export const uploadConfig = {
  /**
   * Type-safe provider configuration
   * Usage: createUploadConfig().provider("aws", { bucket: "my-bucket", region: "us-west-2" })
   */
  provider: <T extends ProviderType>(
    type: T,
    config: ProviderConfigMap[T] = {} as ProviderConfigMap[T]
  ) => createUploadConfig().provider(type, config),
};

// ========================================
// Global Configuration Management
// ========================================

let globalUploadConfig: UploadConfig | null = null;
let configInitialized = false;

/**
 * Upload initialization result with configured instances
 */
export interface UploadInitResult {
  config: UploadConfig;
  storage: StorageInstance;
  s3: typeof s3;
}

// initializeUploadConfig removed - use createUploadConfig().build() directly

/**
 * Get the global upload configuration
 */
export function getUploadConfig(): UploadConfig {
  if (!globalUploadConfig) {
    throw new Error(
      "Upload configuration not initialized. Auto-configuration is disabled for security.\n\n" +
        "Please explicitly initialize with a provider:\n" +
        "1. Create an upload.ts file:\n" +
        '   export const config = createUploadConfig().provider("aws", { bucket: "...", region: "..." }).build();\n' +
        "   export const { s3 } = config;\n\n" +
        "2. Or call createUploadConfig().build() directly with your provider configuration."
    );
  }
  return globalUploadConfig;
}

/**
 * Set the global upload configuration with validation
 */
export function setGlobalUploadConfig(config: UploadConfig | null): void {
  if (config) {
    const validation = validateUploadConfig(config);
    if (!validation.valid) {
      throw new Error(
        `Invalid upload configuration: ${validation.errors.join(", ")}`
      );
    }
  }

  globalUploadConfig = config;
  configInitialized = config !== null;
}

/**
 * Check if configuration is initialized
 */
export function isConfigInitialized(): boolean {
  return configInitialized;
}

/**
 * Reset global configuration (useful for testing)
 */
export function resetUploadConfig(): void {
  globalUploadConfig = null;
  configInitialized = false;
}

// ========================================
// Configuration Validation
// ========================================

function validateUploadConfig(config: UploadConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate provider configuration
  const providerValidation = validateProviderConfig(config.provider);
  if (!providerValidation.valid) {
    errors.push(...providerValidation.errors);
  }

  // Validate defaults
  if (config.defaults?.maxFileSize) {
    const size =
      typeof config.defaults.maxFileSize === "string"
        ? config.defaults.maxFileSize
        : `${config.defaults.maxFileSize}`;

    if (!/^\d+(\.\d+)?(B|KB|MB|GB)$/i.test(size)) {
      errors.push(
        'Invalid maxFileSize format. Use format like "5MB", "100KB", etc.'
      );
    }
  }

  // Validate security settings
  if (config.security?.rateLimiting) {
    const { maxUploads, windowMs } = config.security.rateLimiting;
    if (maxUploads && maxUploads <= 0) {
      errors.push("maxUploads must be greater than 0");
    }
    if (windowMs && windowMs <= 0) {
      errors.push("windowMs must be greater than 0");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
