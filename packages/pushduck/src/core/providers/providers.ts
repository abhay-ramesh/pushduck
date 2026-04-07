/**
 * @fileoverview Cloud Storage Providers System
 *
 * This module provides a comprehensive system for configuring different cloud storage providers
 * with environment-based configuration, type-safe initialization, and automatic endpoint resolution.
 *
 * The provider system supports multiple tiers of cloud storage services:
 * - **Tier 1**: Fully supported with comprehensive testing (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO)
 * - **Tier 2**: Enterprise/Hyperscale providers (Azure Blob, IBM Cloud, Oracle OCI)
 * - **Tier 3**: Cost-optimized providers (Wasabi, Backblaze B2, Storj DCS)
 * - **Tier 4**: Performance/Specialized providers (Telnyx, Tigris, Cloudian)
 *
 * Features:
 * - Environment variable auto-detection with fallbacks
 * - Type-safe configuration with TypeScript inference
 * - Automatic endpoint generation for known providers
 * - Validation and error reporting
 * - Custom domain and ACL support
 *
 * @example Basic AWS S3 Configuration
 * ```typescript
 * import { createProvider } from 'pushduck/server';
 *
 * const s3Config = createProvider('aws', {
 *   bucket: 'my-uploads',
 *   region: 'us-east-1',
 *   // Credentials auto-loaded from AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * });
 * ```
 *
 * @example Cloudflare R2 Configuration
 * ```typescript
 * const r2Config = createProvider('cloudflareR2', {
 *   bucket: 'my-r2-bucket',
 *   accountId: 'your-account-id',
 *   // Credentials from CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY
 * });
 * ```
 *
 * @example MinIO Self-hosted Configuration
 * ```typescript
 * const minioConfig = createProvider('minio', {
 *   endpoint: 'http://localhost:9000',
 *   bucket: 'uploads',
 *   accessKeyId: 'minioadmin',
 *   secretAccessKey: 'minioadmin',
 *   useSSL: false,
 * });
 * ```
 *
 * @example Environment Variable Setup
 * ```bash
 * # AWS S3
 * export AWS_ACCESS_KEY_ID="your-access-key"
 * export AWS_SECRET_ACCESS_KEY="your-secret-key"
 * export AWS_REGION="us-east-1"
 *
 * # Cloudflare R2
 * export CLOUDFLARE_R2_ACCESS_KEY_ID="your-r2-access-key"
 * export CLOUDFLARE_R2_SECRET_ACCESS_KEY="your-r2-secret-key"
 * export CLOUDFLARE_ACCOUNT_ID="your-account-id"
 *
 * # DigitalOcean Spaces
 * export DO_SPACES_ACCESS_KEY_ID="your-spaces-key"
 * export DO_SPACES_SECRET_ACCESS_KEY="your-spaces-secret"
 * export DO_SPACES_REGION="nyc3"
 * ```
 *
 */

// ========================================
// Provider Types
// ========================================

/**
 * Base configuration interface for all cloud storage providers.
 * Contains common properties shared across all provider implementations.
 *
 * @interface BaseProviderConfig
 */
export interface BaseProviderConfig {
  /** Provider identifier string */
  provider: string;
  /** Geographic region for the storage service */
  region?: string;
  /** Name of the storage bucket/container */
  bucket: string;
  /** Access Control List permissions (e.g., 'public-read', 'private') */
  acl?: string;
  /** Custom domain for file URLs (e.g., 'cdn.example.com') */
  customDomain?: string;
  /** Force path-style URLs instead of virtual-hosted style */
  forcePathStyle?: boolean;
  /**
   * Controls what kind of download URL the library returns after a file is uploaded.
   *
   * - `'private'` (default) — generates a presigned GET URL signed against the
   *   provider's S3 API endpoint. Works for private buckets. The URL expires
   *   after `expiresIn` seconds (default 3600).
   * - `'public'` — returns the plain public URL (custom domain if configured,
   *   otherwise the provider's public URL). No signing. Use this when your
   *   bucket/objects are already publicly accessible.
   *
   * **Important:** This setting must match your actual bucket configuration.
   * Setting `visibility: 'public'` on a private bucket will result in 403 errors
   * when clients try to access the returned URLs. pushduck does not verify or
   * enforce your bucket's access settings.
   *
   * @default 'private'
   */
  visibility?: "public" | "private";
}

// ========================================
// TIER 1: Currently Supported Providers
// ========================================

/**
 * Configuration for Amazon Web Services S3.
 * The most widely used object storage service with global availability.
 *
 * @interface AWSProviderConfig
 * @extends BaseProviderConfig
 *
 * @example Basic Configuration
 * ```typescript
 * const awsConfig: AWSProviderConfig = {
 *   provider: 'aws',
 *   bucket: 'my-app-uploads',
 *   region: 'us-east-1',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 * };
 * ```
 *
 * @example With Custom Domain
 * ```typescript
 * const awsWithCDN: AWSProviderConfig = {
 *   provider: 'aws',
 *   bucket: 'my-uploads',
 *   region: 'us-east-1',
 *   accessKeyId: 'AKIA...',
 *   secretAccessKey: 'secret...',
 *   customDomain: 'cdn.myapp.com',
 *   acl: 'public-read',
 * };
 * ```
 */
export interface AWSProviderConfig extends BaseProviderConfig {
  provider: "aws";
  /** AWS Access Key ID */
  accessKeyId: string;
  /** AWS Secret Access Key */
  secretAccessKey: string;
  /** AWS region (required) */
  region: string;
  /** AWS Session Token for temporary credentials */
  sessionToken?: string;
}

/**
 * Base fields for Cloudflare R2 object storage (without visibility/customDomain).
 * Use the exported `CloudflareR2Config` type for the full discriminated union.
 */
export interface CloudflareR2BaseConfig extends Omit<BaseProviderConfig, "customDomain" | "visibility"> {
  provider: "cloudflare-r2";
  /** Cloudflare Account ID */
  accountId: string;
  /** R2 Access Key ID */
  accessKeyId: string;
  /** R2 Secret Access Key */
  secretAccessKey: string;
  /** Region (typically 'auto' for R2) */
  region?: "auto";
  /** Custom endpoint (auto-generated from accountId if not provided) */
  endpoint?: string;
}

/**
 * Configuration for Cloudflare R2 object storage.
 * S3-compatible storage with zero egress fees and global distribution.
 *
 * R2 presigned URLs only work with the R2 S3 API endpoint — they cannot be
 * used with custom domains. Therefore `visibility: 'public'` requires a
 * `customDomain` to be set (R2 public access requires a custom domain or
 * the r2.dev subdomain; the API endpoint does not serve public content).
 *
 * @example Basic Configuration (private bucket)
 * ```typescript
 * const r2Config: CloudflareR2Config = {
 *   provider: 'cloudflare-r2',
 *   bucket: 'my-r2-bucket',
 *   accountId: 'your-cloudflare-account-id',
 *   accessKeyId: 'your-r2-access-key',
 *   secretAccessKey: 'your-r2-secret-key',
 * };
 * ```
 *
 * @example Public bucket with custom domain
 * ```typescript
 * const r2WithDomain: CloudflareR2Config = {
 *   provider: 'cloudflare-r2',
 *   bucket: 'assets',
 *   accountId: 'abc123',
 *   accessKeyId: 'key123',
 *   secretAccessKey: 'secret123',
 *   customDomain: 'https://assets.myapp.com', // required when visibility is 'public'
 *   visibility: 'public',
 * };
 * ```
 */
export type CloudflareR2Config = CloudflareR2BaseConfig &
  (
    | { visibility: "public"; customDomain: string }
    | { visibility?: "private"; customDomain?: string }
  );

/**
 * Configuration for DigitalOcean Spaces object storage.
 * S3-compatible storage service integrated with DigitalOcean's ecosystem.
 *
 * @interface DigitalOceanSpacesConfig
 * @extends BaseProviderConfig
 *
 * @example Basic Configuration
 * ```typescript
 * const spacesConfig: DigitalOceanSpacesConfig = {
 *   provider: 'digitalocean-spaces',
 *   bucket: 'my-space',
 *   region: 'nyc3',
 *   accessKeyId: 'your-spaces-key',
 *   secretAccessKey: 'your-spaces-secret',
 * };
 * ```
 *
 * @example Available Regions
 * ```typescript
 * const regions = ['nyc3', 'ams3', 'sgp1', 'sfo3', 'fra1'];
 * const spacesConfig: DigitalOceanSpacesConfig = {
 *   provider: 'digitalocean-spaces',
 *   bucket: 'global-assets',
 *   region: 'fra1', // Frankfurt
 *   accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY!,
 * };
 * ```
 */
export interface DigitalOceanSpacesConfig extends BaseProviderConfig {
  provider: "digitalocean-spaces";
  /** Spaces Access Key ID */
  accessKeyId: string;
  /** Spaces Secret Access Key */
  secretAccessKey: string;
  /** DigitalOcean region */
  region: string;
  /** Custom endpoint (auto-generated from region if not provided) */
  endpoint?: string;
}

/**
 * Configuration for MinIO object storage.
 * Self-hosted S3-compatible storage for on-premises or private cloud deployments.
 *
 * @interface MinIOConfig
 * @extends BaseProviderConfig
 *
 * @example Local Development
 * ```typescript
 * const minioConfig: MinIOConfig = {
 *   provider: 'minio',
 *   endpoint: 'http://localhost:9000',
 *   bucket: 'uploads',
 *   accessKeyId: 'minioadmin',
 *   secretAccessKey: 'minioadmin',
 *   useSSL: false,
 * };
 * ```
 *
 * @example Production Setup
 * ```typescript
 * const minioProduction: MinIOConfig = {
 *   provider: 'minio',
 *   endpoint: 'https://minio.mycompany.com',
 *   bucket: 'production-uploads',
 *   accessKeyId: process.env.MINIO_ACCESS_KEY!,
 *   secretAccessKey: process.env.MINIO_SECRET_KEY!,
 *   useSSL: true,
 *   port: 9000,
 * };
 * ```
 */
export interface MinIOConfig extends BaseProviderConfig {
  provider: "minio";
  /** MinIO server endpoint URL */
  endpoint: string;
  /** MinIO access key */
  accessKeyId: string;
  /** MinIO secret key */
  secretAccessKey: string;
  /** Whether to use SSL/TLS */
  useSSL?: boolean;
  /** Custom port (default: 9000) */
  port?: number;
}

// ========================================
// TIER 2: Enterprise/Hyperscale Providers
// ========================================

export interface AzureBlobConfig extends BaseProviderConfig {
  provider: "azure-blob";
  accountName: string;
  accessKeyId: string; // Storage Account Key
  secretAccessKey: string; // Storage Account Key (same as accessKeyId for Azure)
  endpoint?: string; // Auto-generated from accountName if not provided
}

export interface IBMCloudConfig extends BaseProviderConfig {
  provider: "ibm-cloud";
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string; // IBM-specific endpoint
  serviceInstanceId?: string;
}

export interface OracleOCIConfig extends BaseProviderConfig {
  provider: "oracle-oci";
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string; // Oracle-specific endpoint
  namespace?: string;
}

// ========================================
// TIER 3: Cost-Optimized Providers
// ========================================

export interface WasabiConfig extends BaseProviderConfig {
  provider: "wasabi";
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // Default: https://s3.wasabisys.com
}

export interface BackblazeB2Config extends BaseProviderConfig {
  provider: "backblaze-b2";
  accessKeyId: string; // Application Key ID
  secretAccessKey: string; // Application Key
  endpoint: string; // Region-specific endpoint
}

export interface StorjDCSConfig extends BaseProviderConfig {
  provider: "storj-dcs";
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // Default: https://gateway.storjshare.io
}

// ========================================
// TIER 4: Performance/Specialized Providers
// ========================================

export interface TelnyxStorageConfig extends BaseProviderConfig {
  provider: "telnyx-storage";
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string; // Telnyx-specific endpoint
}

export interface TigrisDataConfig extends BaseProviderConfig {
  provider: "tigris-data";
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string; // e.g., https://fly.storage.tigris.dev
  region?: "auto";
}

export interface CloudianHyperStoreConfig extends BaseProviderConfig {
  provider: "cloudian-hyperstore";
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string; // Customer-specific endpoint
}

// ========================================
// Special Cases
// ========================================

export interface GoogleCloudStorageConfig extends BaseProviderConfig {
  provider: "gcs";
  projectId: string;
  keyFilename?: string;
  credentials?: object;
}

export interface S3CompatibleConfig extends BaseProviderConfig {
  provider: "s3-compatible";
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string; // Required for generic S3-compatible providers
}

// ========================================
// Union Type for All Providers
// ========================================

export type ProviderConfig =
  // Tier 1: Currently Supported
  | AWSProviderConfig
  | CloudflareR2Config
  | DigitalOceanSpacesConfig
  | MinIOConfig
  // Tier 2: Enterprise/Hyperscale
  | AzureBlobConfig
  | IBMCloudConfig
  | OracleOCIConfig
  // Tier 3: Cost-Optimized
  | WasabiConfig
  | BackblazeB2Config
  | StorjDCSConfig
  // Tier 4: Performance/Specialized
  | TelnyxStorageConfig
  | TigrisDataConfig
  | CloudianHyperStoreConfig
  // Special Cases
  | GoogleCloudStorageConfig
  | S3CompatibleConfig;

// ========================================
// DRY Provider Factory System
// ========================================

interface ProviderSpec {
  readonly provider: string;
  readonly configKeys: { readonly [key: string]: readonly string[] };
  readonly defaults: { readonly [key: string]: unknown };
  readonly customLogic?: (
    config: Record<string, unknown>,
    computed: Record<string, unknown>
  ) => Record<string, unknown>;
}

/**
 * Generic provider configuration builder.
 *
 * The function signature is fully typed — `T` flows from the provider config
 * type so callers retain type information. Internally, we widen `config` to
 * `Record<string, unknown>` only for dynamic key-based access (the spec keys
 * are runtime strings, not statically known). The single `as unknown as T`
 * cast at the return boundary is the only escape hatch; it is justified
 * because `validateProviderConfig` runs immediately before, ensuring the
 * object has all required fields for T.
 */
function createProviderBuilder<T extends ProviderConfig>(
  spec: ProviderSpec
): (config?: Partial<Omit<T, "provider">>) => T {
  return (config: Partial<Omit<T, "provider">> = {} as Partial<Omit<T, "provider">>): T => {
    // Widen to Record for dynamic key access — widening only, no data loss
    const configRecord = config as Record<string, unknown>;
    const result: Record<string, unknown> = { provider: spec.provider };

    // Apply spec-declared keys with config values or fallback defaults
    for (const key of Object.keys(spec.configKeys)) {
      result[key] = configRecord[key] ?? spec.defaults[key] ?? "";
    }

    // Pass through any config keys not covered by spec.configKeys
    // (e.g. visibility, forcePathStyle, future BaseProviderConfig fields)
    for (const [key, value] of Object.entries(configRecord)) {
      if (!(key in result) && value !== undefined) {
        result[key] = value;
      }
    }

    // Apply provider-specific derived fields (e.g. auto-compute endpoint)
    if (spec.customLogic) {
      Object.assign(result, spec.customLogic(configRecord, result));
    }

    // Single boundary cast: dynamic Record → typed T.
    // unknown intermediate required because Record<string,unknown> and the
    // ProviderConfig union don't share enough structure for a direct assertion.
    const built = result as unknown as T;

    // Validate before returning — throws if required fields are missing
    const validation = validateProviderConfig(built);
    if (!validation.valid) {
      throw new Error(
        `Provider validation failed: ${validation.errors.join(", ")}`
      );
    }

    return built;
  };
}

// ========================================
// Provider Specifications (DRY)
// ========================================

const PROVIDER_SPECS = {
  aws: {
    provider: "aws",
    configKeys: {
      region: ["AWS_REGION", "S3_REGION"],
      bucket: ["AWS_S3_BUCKET", "S3_BUCKET", "S3_BUCKET_NAME"],
      accessKeyId: ["AWS_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID"],
      secretAccessKey: ["AWS_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY"],
      sessionToken: ["AWS_SESSION_TOKEN"],
      acl: ["S3_ACL"],
      customDomain: ["S3_CUSTOM_DOMAIN"],
      forcePathStyle: ["S3_FORCE_PATH_STYLE"],
    },
    defaults: {
      region: "us-east-1",
      acl: "private",
    },
  },

  cloudflareR2: {
    provider: "cloudflare-r2",
    configKeys: {
      accountId: ["CLOUDFLARE_ACCOUNT_ID", "R2_ACCOUNT_ID"],
      bucket: ["CLOUDFLARE_R2_BUCKET", "R2_BUCKET"],
      accessKeyId: ["CLOUDFLARE_R2_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID"],
      secretAccessKey: [
        "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
        "R2_SECRET_ACCESS_KEY",
      ],
      endpoint: ["CLOUDFLARE_R2_ENDPOINT", "R2_ENDPOINT"],
      customDomain: ["R2_CUSTOM_DOMAIN"],
      acl: [],
    },
    defaults: {
      region: "auto",
      acl: "private",
    },
    customLogic: (config, computed) => ({
      endpoint:
        computed.endpoint ||
        (computed.accountId
          ? `https://${computed.accountId}.r2.cloudflarestorage.com`
          : ""),
    }),
  },

  digitalOceanSpaces: {
    provider: "digitalocean-spaces",
    configKeys: {
      region: ["DO_SPACES_REGION", "DIGITALOCEAN_SPACES_REGION"],
      bucket: ["DO_SPACES_BUCKET", "DIGITALOCEAN_SPACES_BUCKET"],
      accessKeyId: [
        "DO_SPACES_ACCESS_KEY_ID",
        "DIGITALOCEAN_SPACES_ACCESS_KEY_ID",
      ],
      secretAccessKey: [
        "DO_SPACES_SECRET_ACCESS_KEY",
        "DIGITALOCEAN_SPACES_SECRET_ACCESS_KEY",
      ],
      endpoint: ["DO_SPACES_ENDPOINT", "DIGITALOCEAN_SPACES_ENDPOINT"],
      customDomain: ["DO_SPACES_CUSTOM_DOMAIN"],
      acl: [],
    },
    defaults: {
      region: "nyc3",
      acl: "private",
    },
    customLogic: (config, computed) => ({
      endpoint:
        computed.endpoint ||
        `https://${computed.region}.digitaloceanspaces.com`,
    }),
  },

  minio: {
    provider: "minio",
    configKeys: {
      endpoint: ["MINIO_ENDPOINT"],
      bucket: ["MINIO_BUCKET"],
      accessKeyId: ["MINIO_ACCESS_KEY_ID", "MINIO_ACCESS_KEY"],
      secretAccessKey: ["MINIO_SECRET_ACCESS_KEY", "MINIO_SECRET_KEY"],
      region: ["MINIO_REGION"],
      customDomain: ["MINIO_CUSTOM_DOMAIN"],
      acl: [],
    },
    defaults: {
      endpoint: "localhost:9000",
      region: "us-east-1",
      acl: "private",
    },
    customLogic: (config, computed) => ({
      useSSL: config.useSSL ?? false,
      port: config.port ? Number(config.port) : undefined,
    }),
  },

  gcs: {
    provider: "gcs",
    configKeys: {
      projectId: ["GOOGLE_CLOUD_PROJECT_ID", "GCS_PROJECT_ID"],
      bucket: ["GCS_BUCKET", "GOOGLE_CLOUD_STORAGE_BUCKET"],
      keyFilename: ["GOOGLE_APPLICATION_CREDENTIALS", "GCS_KEY_FILE"],
      region: ["GCS_REGION"],
      customDomain: ["GCS_CUSTOM_DOMAIN"],
      acl: [],
    },
    defaults: {
      region: "us-central1",
      acl: "private",
    },
    customLogic: (config, _computed) => ({
      credentials: config.credentials,
    }),
  },

  s3Compatible: {
    provider: "s3-compatible",
    configKeys: {
      endpoint: ["S3_ENDPOINT", "S3_COMPATIBLE_ENDPOINT"],
      bucket: ["S3_BUCKET", "S3_BUCKET_NAME"],
      accessKeyId: ["S3_ACCESS_KEY_ID", "ACCESS_KEY_ID"],
      secretAccessKey: ["S3_SECRET_ACCESS_KEY", "SECRET_ACCESS_KEY"],
      region: ["S3_REGION", "REGION"],
      customDomain: ["S3_CUSTOM_DOMAIN"],
      acl: ["S3_ACL"],
    },
    defaults: {
      region: "us-east-1",
      acl: "private",
      forcePathStyle: true, // Most S3-compatible providers need path-style access
    },
  },
} as const satisfies Record<string, ProviderSpec>;

// ========================================
// Generic Provider Creator (New API)
// ========================================

// Extract provider names as literal types from the const object
type ProviderSpecsType = typeof PROVIDER_SPECS;
export type ProviderType = keyof ProviderSpecsType;

// ========================================
// Type-Safe Provider Configuration Mapping
// ========================================

/**
 * Maps each provider key to its fully-resolved output config type.
 * Used to constrain createProviderBuilder<T> so the generic T is the
 * concrete ProviderConfig subtype, not the loose ProviderConfig union.
 */
export type ProviderOutputMap = {
  aws: AWSProviderConfig;
  cloudflareR2: CloudflareR2Config;
  digitalOceanSpaces: DigitalOceanSpacesConfig;
  minio: MinIOConfig;
  gcs: GoogleCloudStorageConfig;
  s3Compatible: S3CompatibleConfig;
};

/**
 * Maps each provider type to its user-facing input configuration.
 * Partial so callers only supply the fields they know; missing values are
 * filled from environment variables or defaults inside createProviderBuilder.
 * R2 carries its discriminated union so TypeScript enforces the
 * visibility: 'public' → customDomain required constraint at the call site.
 */
export type ProviderConfigMap = {
  aws: Partial<Omit<AWSProviderConfig, "provider">>;
  cloudflareR2: Partial<Omit<CloudflareR2BaseConfig, "provider">> &
    (
      | { visibility: "public"; customDomain: string }
      | { visibility?: "private"; customDomain?: string }
    );
  digitalOceanSpaces: Partial<Omit<DigitalOceanSpacesConfig, "provider">>;
  minio: Partial<Omit<MinIOConfig, "provider">>;
  gcs: Partial<Omit<GoogleCloudStorageConfig, "provider">>;
  s3Compatible: Partial<Omit<S3CompatibleConfig, "provider">>;
};

/**
 * Type-safe provider configuration function
 * Usage: createProvider("aws", { bucket: "my-bucket", region: "us-west-2" })
 */
/**
 * Creates a provider configuration with automatic environment variable detection.
 * This is the main factory function for creating type-safe provider configurations
 * with automatic credential loading from environment variables.
 *
 * @template T - The provider type
 * @param type - The provider type identifier
 * @param config - Partial configuration object (missing values loaded from env)
 * @returns Complete provider configuration
 *
 * @example AWS S3 Provider
 * ```typescript
 * // Environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
 * const s3Config = createProvider('aws', {
 *   bucket: 'my-uploads',
 *   // region, accessKeyId, secretAccessKey auto-loaded from env
 * });
 * ```
 *
 * @example Cloudflare R2 Provider
 * ```typescript
 * // Environment variables: CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_ACCOUNT_ID
 * const r2Config = createProvider('cloudflareR2', {
 *   bucket: 'my-r2-bucket',
 *   // accountId, accessKeyId, secretAccessKey auto-loaded from env
 * });
 * ```
 *
 * @example MinIO Provider
 * ```typescript
 * const minioConfig = createProvider('minio', {
 *   endpoint: 'http://localhost:9000',
 *   bucket: 'uploads',
 *   accessKeyId: 'minioadmin',
 *   secretAccessKey: 'minioadmin',
 *   useSSL: false,
 * });
 * ```
 *
 * @example DigitalOcean Spaces
 * ```typescript
 * // Environment variables: DO_SPACES_ACCESS_KEY_ID, DO_SPACES_SECRET_ACCESS_KEY, DO_SPACES_REGION
 * const spacesConfig = createProvider('digitalOceanSpaces', {
 *   bucket: 'my-space',
 *   // region, accessKeyId, secretAccessKey auto-loaded from env
 * });
 * ```
 *
 * @throws {Error} When required configuration is missing and not available in environment
 */
export function createProvider<T extends ProviderType>(
  type: T,
  config?: ProviderConfigMap[T]
): ProviderOutputMap[T] {
  const spec = PROVIDER_SPECS[type];
  if (!spec) {
    throw new Error(`Unknown provider type: ${type}`);
  }

  // ProviderConfigMap[T] is always a structural subtype of
  // Partial<Omit<ProviderOutputMap[T], "provider">> for each concrete T —
  // the only difference is the Partial wrapping and R2's discriminated union.
  // The cast narrows from the user-facing input shape to the builder's param.
  return createProviderBuilder<ProviderOutputMap[T]>(spec)(
    config as Partial<Omit<ProviderOutputMap[T], "provider">>
  );
}

// ========================================
// Environment Detection
// ========================================

// ========================================
// Provider Configuration Validation
// ========================================

/**
 * Validates a provider configuration and returns detailed error information.
 * This function checks for required fields, validates endpoints, and ensures
 * the configuration is complete and correct.
 *
 * @param config - The provider configuration to validate
 * @returns Validation result with success status and error details
 *
 * @example Validating AWS Configuration
 * ```typescript
 * const awsConfig = createProvider('aws', {
 *   bucket: 'my-uploads',
 *   region: 'us-east-1',
 *   accessKeyId: 'AKIA...',
 *   secretAccessKey: 'secret...',
 * });
 *
 * const validation = validateProviderConfig(awsConfig);
 * if (!validation.valid) {
 *   console.error('Configuration errors:', validation.errors);
 *   // ["Missing required field: accessKeyId", "Invalid region format"]
 * }
 * ```
 *
 * @example Handling Validation Errors
 * ```typescript
 * const config = createProvider('cloudflareR2', {
 *   bucket: 'test-bucket',
 *   // Missing accountId, accessKeyId, secretAccessKey
 * });
 *
 * const { valid, errors } = validateProviderConfig(config);
 * if (!valid) {
 *   throw new Error(`Provider configuration invalid: ${errors.join(', ')}`);
 * }
 * ```
 *
 * @example Validation in Setup
 * ```typescript
 * function setupStorage(providerConfig: ProviderConfig) {
 *   const validation = validateProviderConfig(providerConfig);
 *
 *   if (!validation.valid) {
 *     console.error('❌ Storage configuration errors:');
 *     validation.errors.forEach(error => console.error(`  - ${error}`));
 *     process.exit(1);
 *   }
 *
 *   console.log('Storage configuration valid');
 *   return createStorageClient(providerConfig);
 * }
 * ```
 *
 */
export function validateProviderConfig(config: ProviderConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Common validations
  if (!config.bucket) {
    errors.push("Bucket name is required");
  }

  // Provider-specific validations
  switch (config.provider) {
    case "aws":
      if (!config.accessKeyId) errors.push("AWS Access Key ID is required");
      if (!config.secretAccessKey)
        errors.push("AWS Secret Access Key is required");
      if (!config.region) errors.push("AWS Region is required");
      break;

    case "cloudflare-r2":
      if (!config.accountId) errors.push("Cloudflare Account ID is required");
      if (!config.accessKeyId) errors.push("R2 Access Key ID is required");
      if (!config.secretAccessKey)
        errors.push("R2 Secret Access Key is required");
      if (config.visibility === "public" && !config.customDomain)
        errors.push(
          "R2 requires customDomain when visibility is 'public' — R2 presigned URLs cannot be used with custom domains"
        );
      break;

    case "digitalocean-spaces":
      if (!config.accessKeyId)
        errors.push("DigitalOcean Spaces Access Key ID is required");
      if (!config.secretAccessKey)
        errors.push("DigitalOcean Spaces Secret Access Key is required");
      if (!config.region) errors.push("DigitalOcean Spaces Region is required");
      break;

    case "minio":
      if (!config.endpoint) errors.push("MinIO Endpoint is required");
      if (!config.accessKeyId) errors.push("MinIO Access Key ID is required");
      if (!config.secretAccessKey)
        errors.push("MinIO Secret Access Key is required");
      break;

    case "gcs":
      if (!config.projectId) errors.push("Google Cloud Project ID is required");
      if (!config.keyFilename && !config.credentials) {
        errors.push(
          "Google Cloud credentials (keyFilename or credentials object) are required"
        );
      }
      break;

    case "s3-compatible":
      if (!config.endpoint) errors.push("S3-compatible endpoint is required");
      if (!config.accessKeyId) errors.push("Access Key ID is required");
      if (!config.secretAccessKey) errors.push("Secret Access Key is required");
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ========================================
// Provider Configuration Helpers
// ========================================

function getProviderDisplayName(provider: ProviderConfig["provider"]): string {
  const names = {
    // Tier 1: Currently Supported
    aws: "Amazon S3",
    "cloudflare-r2": "Cloudflare R2",
    "digitalocean-spaces": "DigitalOcean Spaces",
    minio: "MinIO",
    // Tier 2: Enterprise/Hyperscale
    "azure-blob": "Azure Blob Storage",
    "ibm-cloud": "IBM Cloud Object Storage",
    "oracle-oci": "Oracle Cloud Infrastructure",
    // Tier 3: Cost-Optimized
    wasabi: "Wasabi Hot Cloud Storage",
    "backblaze-b2": "Backblaze B2",
    "storj-dcs": "Storj DCS",
    // Tier 4: Performance/Specialized
    "telnyx-storage": "Telnyx Storage",
    "tigris-data": "Tigris Data",
    "cloudian-hyperstore": "Cloudian HyperStore",
    // Special Cases
    gcs: "Google Cloud Storage",
    "s3-compatible": "S3-Compatible Provider",
  };
  return names[provider] || provider;
}

/**
 * Generates the appropriate endpoint URL for a given provider configuration.
 * This function handles automatic endpoint generation for known providers and
 * validates custom endpoints for self-hosted or specialized providers.
 *
 * @param config - The provider configuration
 * @returns The complete endpoint URL for the provider
 *
 * @example AWS S3 Endpoint
 * ```typescript
 * const awsConfig = createProvider('aws', {
 *   bucket: 'my-uploads',
 *   region: 'us-west-2',
 * });
 *
 * const endpoint = getProviderEndpoint(awsConfig);
 * // Returns: "https://s3.us-west-2.amazonaws.com"
 * ```
 *
 * @example Cloudflare R2 Endpoint
 * ```typescript
 * const r2Config = createProvider('cloudflareR2', {
 *   bucket: 'my-bucket',
 *   accountId: 'abc123def456',
 * });
 *
 * const endpoint = getProviderEndpoint(r2Config);
 * // Returns: "https://abc123def456.r2.cloudflarestorage.com"
 * ```
 *
 * @example DigitalOcean Spaces Endpoint
 * ```typescript
 * const spacesConfig = createProvider('digitalOceanSpaces', {
 *   bucket: 'my-space',
 *   region: 'nyc3',
 * });
 *
 * const endpoint = getProviderEndpoint(spacesConfig);
 * // Returns: "https://nyc3.digitaloceanspaces.com"
 * ```
 *
 * @example MinIO Custom Endpoint
 * ```typescript
 * const minioConfig = createProvider('minio', {
 *   endpoint: 'https://minio.mycompany.com:9000',
 *   bucket: 'uploads',
 * });
 *
 * const endpoint = getProviderEndpoint(minioConfig);
 * // Returns: "https://minio.mycompany.com:9000"
 * ```
 *
 * @throws {Error} When endpoint cannot be determined or is invalid
 */
export function getProviderEndpoint(config: ProviderConfig): string {
  switch (config.provider) {
    case "aws":
      return `https://s3.${config.region}.amazonaws.com`;
    case "cloudflare-r2":
      return (
        config.endpoint ||
        `https://${config.accountId}.r2.cloudflarestorage.com`
      );
    case "digitalocean-spaces":
      return (
        config.endpoint || `https://${config.region}.digitaloceanspaces.com`
      );
    case "minio": {
      const protocol = config.useSSL !== false ? "https" : "http";
      const port = config.port ? `:${config.port}` : "";
      return `${protocol}://${config.endpoint}${port}`;
    }
    case "gcs":
      return "https://storage.googleapis.com";
    case "s3-compatible":
      return config.endpoint;
    default:
      return "";
  }
}
