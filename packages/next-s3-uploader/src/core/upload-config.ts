/**
 * Upload Configuration System
 *
 * This provides a clean way to initialize and manage upload configurations
 * that can be used across routes and components.
 */

import {
  convertLegacyConfig,
  ProviderConfig,
  providers,
  validateProviderConfig,
} from "./providers";
import {
  createS3Handler,
  createS3Router,
  S3Route,
  S3RouterDefinition,
} from "./router-v2";
import {
  S3FileConstraints,
  S3FileSchema,
  S3ImageSchema,
  S3ObjectSchema,
} from "./schema";

// ========================================
// Smart Schema Builders (for upload-config)
// ========================================

// Smart router factory that handles schema-to-route conversion
function smartCreateRouter<TRoutes extends Record<string, any>>(
  routes: TRoutes
) {
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

  return createS3Router(convertedRoutes as S3RouterDefinition);
}

// Main S3 Builder Instance (for upload-config)
export const s3 = {
  // Schema builders
  file: (constraints?: S3FileConstraints) => new S3FileSchema(constraints),
  image: (constraints?: S3FileConstraints) => new S3ImageSchema(constraints),
  object: <T extends Record<string, any>>(shape: T) =>
    new S3ObjectSchema(shape),

  // Smart router factory that handles schema-to-route conversion
  createRouter: smartCreateRouter,
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
    prefix?: string;
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
   * Set the storage provider
   */
  provider(providerConfig: ProviderConfig): UploadConfigBuilder {
    this.config.provider = providerConfig;
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
   * Build the final configuration
   */
  build(): UploadConfig {
    if (!this.config.provider) {
      throw new Error("Provider configuration is required");
    }

    const validation = validateProviderConfig(this.config.provider);
    if (!validation.valid) {
      throw new Error(
        `Invalid provider configuration: ${validation.errors.join(", ")}`
      );
    }

    return this.config as UploadConfig;
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
 * Create upload configuration with auto-detected provider
 */
export function createAutoUploadConfig(): UploadConfig {
  throw new Error(
    "Auto-configuration is disabled. Please explicitly configure a provider using:\n" +
      "- uploadConfig.aws({ ... }).build()\n" +
      "- uploadConfig.cloudflareR2({ ... }).build()\n" +
      "- uploadConfig.digitalOceanSpaces({ ... }).build()\n" +
      "- uploadConfig.minio({ ... }).build()\n" +
      "- uploadConfig.gcs({ ... }).build()\n\n" +
      "This ensures explicit configuration and better security."
  );
}

/**
 * Create upload configuration for specific providers
 */
export const uploadConfig = {
  /**
   * AWS S3 Configuration
   */
  aws: (config?: Partial<Parameters<typeof providers.aws>[0]>) =>
    createUploadConfig().provider(providers.aws(config)),

  /**
   * Cloudflare R2 Configuration
   */
  cloudflareR2: (
    config?: Partial<Parameters<typeof providers.cloudflareR2>[0]>
  ) => createUploadConfig().provider(providers.cloudflareR2(config)),

  /**
   * DigitalOcean Spaces Configuration
   */
  digitalOceanSpaces: (
    config?: Partial<Parameters<typeof providers.digitalOceanSpaces>[0]>
  ) => createUploadConfig().provider(providers.digitalOceanSpaces(config)),

  /**
   * MinIO Configuration
   */
  minio: (config?: Partial<Parameters<typeof providers.minio>[0]>) =>
    createUploadConfig().provider(providers.minio(config)),

  /**
   * Google Cloud Storage Configuration
   */
  gcs: (config?: Partial<Parameters<typeof providers.gcs>[0]>) =>
    createUploadConfig().provider(providers.gcs(config)),
};

// ========================================
// Global Configuration Management
// ========================================

let globalUploadConfig: UploadConfig | null = null;

/**
 * Upload initialization result with configured instances
 */
export interface UploadInitResult {
  config: UploadConfig;
  s3: typeof s3;
  createS3Handler: typeof import("./router-v2").createS3Handler;
}

/**
 * Initialize global upload configuration and return configured instances
 */
export function initializeUploadConfig(config: UploadConfig): UploadInitResult {
  globalUploadConfig = config;

  return {
    config,
    s3,
    createS3Handler,
  };
}

/**
 * Get the global upload configuration
 */
export function getUploadConfig(): UploadConfig {
  if (!globalUploadConfig) {
    throw new Error(
      "Upload configuration not initialized. Auto-configuration is disabled for security.\n\n" +
        "Please explicitly initialize with a provider:\n" +
        "1. Create an upload.ts file:\n" +
        "   export const config = uploadConfig.aws({ ... }).build();\n" +
        "   export const { s3, createS3Handler } = initializeUploadConfig(config);\n\n" +
        "2. Or call initializeUploadConfig() manually with your provider configuration."
    );
  }
  return globalUploadConfig;
}

/**
 * Reset global configuration (useful for testing)
 */
export function resetUploadConfig(): void {
  globalUploadConfig = null;
}

// ========================================
// Legacy Configuration Support
// ========================================

/**
 * Convert legacy configuration to new format
 */
export function convertLegacyUploadConfig(legacyConfig: any): UploadConfig {
  const providerConfig = convertLegacyConfig(legacyConfig);

  return createUploadConfig()
    .provider(providerConfig)
    .defaults({
      maxFileSize: legacyConfig.maxFileSize,
      allowedFileTypes: legacyConfig.allowedFileTypes,
      acl: legacyConfig.acl,
    })
    .build();
}

// ========================================
// Configuration Validation
// ========================================

export function validateUploadConfig(config: UploadConfig): {
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
