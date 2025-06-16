/**
 * Configuration system for next-s3-uploader
 *
 * Provides a DX-friendly way to configure S3 settings with automatic
 * environment variable detection and sensible defaults.
 */

// ========================================
// Configuration Types
// ========================================

export interface S3Config {
  /** AWS Access Key ID or compatible provider access key */
  accessKeyId?: string;
  /** AWS Secret Access Key or compatible provider secret */
  secretAccessKey?: string;
  /** S3 region (e.g., 'us-east-1', 'eu-west-1') */
  region?: string;
  /** S3 bucket name */
  bucket?: string;
  /** Custom S3 endpoint URL (for MinIO, R2, etc.) */
  endpoint?: string;
  /** Whether to force path style URLs (required for MinIO) */
  forcePathStyle?: boolean;
  /** Custom domain for uploaded files (CDN, etc.) */
  customDomain?: string;
  /** Maximum file size allowed (default: '10MB') */
  maxFileSize?: string;
  /** Default ACL for uploaded files */
  acl?: "private" | "public-read" | "public-read-write" | "authenticated-read";
  /** Enable debug logging */
  debug?: boolean;
}

export interface S3HandlerConfig extends S3Config {
  /** Custom callback URL for webhooks */
  callbackUrl?: string;
  /** Log level for debugging */
  logLevel?: "error" | "warn" | "info" | "debug" | "trace";
  /** Whether running in development mode */
  isDev?: boolean;
}

// ========================================
// Environment Variable Detection
// ========================================

/**
 * Automatically detects S3 configuration from environment variables
 * Supports multiple naming conventions for maximum compatibility
 */
export function detectS3Config(): S3Config {
  const env = process.env;

  return {
    // AWS credentials - multiple naming conventions supported
    accessKeyId:
      env.S3_ACCESS_KEY_ID ||
      env.AWS_ACCESS_KEY_ID ||
      env.NEXT_S3_ACCESS_KEY_ID ||
      env.NEXT_S3_UPLOADER_ACCESS_KEY_ID,

    secretAccessKey:
      env.S3_SECRET_ACCESS_KEY ||
      env.AWS_SECRET_ACCESS_KEY ||
      env.NEXT_S3_SECRET_ACCESS_KEY ||
      env.NEXT_S3_UPLOADER_SECRET_ACCESS_KEY,

    // Region configuration
    region:
      env.S3_REGION ||
      env.AWS_REGION ||
      env.AWS_DEFAULT_REGION ||
      env.NEXT_S3_REGION ||
      env.NEXT_S3_UPLOADER_REGION ||
      "us-east-1", // Default region

    // Bucket configuration
    bucket:
      env.S3_BUCKET ||
      env.S3_BUCKET_NAME ||
      env.AWS_S3_BUCKET ||
      env.NEXT_S3_BUCKET ||
      env.NEXT_S3_UPLOADER_BUCKET,

    // Custom endpoint (for MinIO, R2, etc.)
    endpoint:
      env.S3_ENDPOINT ||
      env.S3_ENDPOINT_URL ||
      env.AWS_ENDPOINT_URL ||
      env.NEXT_S3_ENDPOINT ||
      env.NEXT_S3_UPLOADER_ENDPOINT,

    // Path style (required for MinIO)
    forcePathStyle:
      env.S3_FORCE_PATH_STYLE === "true" ||
      env.NEXT_S3_FORCE_PATH_STYLE === "true" ||
      env.NEXT_S3_UPLOADER_FORCE_PATH_STYLE === "true" ||
      false,

    // Custom domain for file URLs
    customDomain:
      env.S3_CUSTOM_DOMAIN ||
      env.NEXT_S3_CUSTOM_DOMAIN ||
      env.NEXT_S3_UPLOADER_CUSTOM_DOMAIN,

    // File size limits
    maxFileSize:
      env.S3_MAX_FILE_SIZE ||
      env.NEXT_S3_MAX_FILE_SIZE ||
      env.NEXT_S3_UPLOADER_MAX_FILE_SIZE ||
      "10MB",

    // ACL settings
    acl: (env.S3_ACL ||
      env.NEXT_S3_ACL ||
      env.NEXT_S3_UPLOADER_ACL ||
      "private") as S3Config["acl"],

    // Debug mode
    debug:
      env.NODE_ENV === "development" ||
      env.S3_DEBUG === "true" ||
      env.NEXT_S3_DEBUG === "true" ||
      env.NEXT_S3_UPLOADER_DEBUG === "true" ||
      false,
  };
}

// ========================================
// Configuration Validation
// ========================================

export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config: S3Config;
}

/**
 * Validates S3 configuration and provides helpful error messages
 */
export function validateS3Config(
  config: Partial<S3Config> = {}
): ConfigValidationResult {
  const detectedConfig = detectS3Config();
  const finalConfig = { ...detectedConfig, ...config };

  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields validation
  if (!finalConfig.accessKeyId) {
    errors.push(
      "Missing S3 Access Key ID. Set one of: S3_ACCESS_KEY_ID, AWS_ACCESS_KEY_ID, NEXT_S3_ACCESS_KEY_ID"
    );
  }

  if (!finalConfig.secretAccessKey) {
    errors.push(
      "Missing S3 Secret Access Key. Set one of: S3_SECRET_ACCESS_KEY, AWS_SECRET_ACCESS_KEY, NEXT_S3_SECRET_ACCESS_KEY"
    );
  }

  if (!finalConfig.bucket) {
    errors.push(
      "Missing S3 Bucket name. Set one of: S3_BUCKET, S3_BUCKET_NAME, AWS_S3_BUCKET, NEXT_S3_BUCKET"
    );
  }

  // Auto-detect and fix common configuration issues
  if (finalConfig.endpoint && !finalConfig.forcePathStyle) {
    const isMinIO =
      finalConfig.endpoint.includes("minio") ||
      finalConfig.endpoint.includes(":9000");
    const isLocalStack =
      finalConfig.endpoint.includes("localstack") ||
      finalConfig.endpoint.includes("localhost");
    const isR2 = finalConfig.endpoint.includes("r2.cloudflarestorage.com");

    if (isMinIO || isLocalStack) {
      finalConfig.forcePathStyle = true;
      warnings.push(
        `Auto-enabled forcePathStyle for detected provider: ${isMinIO ? "MinIO" : "LocalStack"}`
      );
    } else if (isR2) {
      // R2 works better with forcePathStyle for CORS
      finalConfig.forcePathStyle = true;
      warnings.push(
        "Auto-enabled forcePathStyle for Cloudflare R2 (improves CORS compatibility)"
      );
    } else {
      warnings.push(
        "Using custom endpoint without forcePathStyle. This may be required for MinIO and other S3-compatible providers."
      );
    }
  }

  if (!finalConfig.region) {
    warnings.push("No region specified, using default: us-east-1");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    config: finalConfig,
  };
}

// ========================================
// Provider-Specific Configurations
// ========================================

/**
 * Pre-configured settings for popular S3-compatible providers
 */
export const S3_PROVIDERS = {
  aws: {
    name: "Amazon S3",
    forcePathStyle: false,
    // Region and endpoint determined by region
  },

  minio: {
    name: "MinIO",
    forcePathStyle: true,
    // Endpoint must be provided
  },

  cloudflare: {
    name: "Cloudflare R2",
    forcePathStyle: false,
    // Endpoint format: https://<account-id>.r2.cloudflarestorage.com
  },

  digitalocean: {
    name: "DigitalOcean Spaces",
    forcePathStyle: false,
    // Endpoint format: https://<region>.digitaloceanspaces.com
  },

  wasabi: {
    name: "Wasabi",
    forcePathStyle: false,
    // Endpoint format: https://s3.<region>.wasabisys.com
  },
} as const;

/**
 * Helper to create provider-specific configuration
 */
export function createProviderConfig(
  provider: keyof typeof S3_PROVIDERS,
  config: Partial<S3Config> = {}
): S3Config {
  const providerDefaults = S3_PROVIDERS[provider];
  const detectedConfig = detectS3Config();

  return {
    ...detectedConfig,
    ...providerDefaults,
    ...config,
  };
}

// ========================================
// Configuration Helpers
// ========================================

/**
 * Creates a complete S3 configuration with validation
 */
export function createS3Config(config: Partial<S3Config> = {}): S3Config {
  const validation = validateS3Config(config);

  // In development, allow missing credentials for testing
  const isDev = process.env.NODE_ENV === "development";

  if (!validation.isValid && !isDev) {
    const errorMessage = [
      "❌ S3 Configuration Error:",
      ...validation.errors.map((err) => `  • ${err}`),
      "",
      "💡 Quick Setup:",
      "  1. Create .env.local in your app root",
      "  2. Add your S3 credentials:",
      "     S3_ACCESS_KEY_ID=your_access_key",
      "     S3_SECRET_ACCESS_KEY=your_secret_key",
      "     S3_REGION=us-east-1",
      "     S3_BUCKET=your-bucket-name",
      "  3. Restart your development server",
      "",
      "📖 See SETUP.md for detailed configuration options",
    ].join("\n");

    throw new Error(errorMessage);
  }

  // Log warnings in development
  if (validation.warnings.length > 0 && validation.config.debug) {
    console.warn("⚠️  S3 Configuration Warnings:");
    validation.warnings.forEach((warning) => {
      console.warn(`  • ${warning}`);
    });
  }

  // In development, provide defaults for missing values
  if (isDev) {
    const devConfig = {
      ...validation.config,
      accessKeyId: validation.config.accessKeyId || "dev-access-key",
      secretAccessKey: validation.config.secretAccessKey || "dev-secret-key",
      bucket: validation.config.bucket || "dev-bucket",
    };

    if (!validation.isValid) {
      console.warn(
        "⚠️  Using development defaults for missing S3 configuration"
      );
      console.warn("   Add real credentials to .env.local for actual uploads");
    }

    return devConfig;
  }

  return validation.config;
}

/**
 * Environment variable template for easy setup
 */
export const ENV_TEMPLATE = `# next-s3-uploader Configuration
# Choose one naming convention and stick with it

# Option 1: Simple naming (recommended)
S3_ACCESS_KEY_ID=your_access_key_here
S3_SECRET_ACCESS_KEY=your_secret_key_here
S3_REGION=us-east-1
S3_BUCKET=your-bucket-name

# Option 2: AWS-compatible naming
# AWS_ACCESS_KEY_ID=your_access_key_here
# AWS_SECRET_ACCESS_KEY=your_secret_key_here
# AWS_REGION=us-east-1
# AWS_S3_BUCKET=your-bucket-name

# Option 3: Prefixed naming (for multiple services)
# NEXT_S3_ACCESS_KEY_ID=your_access_key_here
# NEXT_S3_SECRET_ACCESS_KEY=your_secret_key_here
# NEXT_S3_REGION=us-east-1
# NEXT_S3_BUCKET=your-bucket-name

# Optional: Custom endpoint (for MinIO, R2, etc.)
# S3_ENDPOINT=https://your-minio-server.com
# S3_FORCE_PATH_STYLE=true

# Optional: Custom domain for file URLs
# S3_CUSTOM_DOMAIN=https://cdn.yourdomain.com

# Optional: File size limits
# S3_MAX_FILE_SIZE=10MB

# Optional: Default ACL
# S3_ACL=private

# Optional: Debug mode
# S3_DEBUG=true
`;

// ========================================
// Runtime Configuration
// ========================================

let globalConfig: S3Config | null = null;

/**
 * Gets the global S3 configuration (cached)
 */
export function getS3Config(): S3Config {
  if (!globalConfig) {
    globalConfig = createS3Config();
  }
  return globalConfig;
}

/**
 * Sets the global S3 configuration
 */
export function setS3Config(config: Partial<S3Config>): void {
  globalConfig = createS3Config(config);
}

/**
 * Resets the global configuration (useful for testing)
 */
export function resetS3Config(): void {
  globalConfig = null;
}
