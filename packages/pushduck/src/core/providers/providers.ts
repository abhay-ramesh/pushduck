/**
 * @fileoverview Cloud Storage Providers
 *
 * Each provider turns the options a user passes into a complete, validated
 * provider config. Supported: AWS S3, Cloudflare R2, DigitalOcean Spaces,
 * MinIO, Neon Object Storage, and any other S3-compatible service through
 * `s3Compatible`.
 *
 * Nothing here reads environment variables. Pass every value explicitly —
 * usually from `process.env` in your own config — so the source of each
 * setting is visible at the call site.
 *
 * @example AWS S3
 * ```typescript
 * import { createProvider } from 'pushduck/server';
 *
 * const s3Config = createProvider('aws', {
 *   bucket: 'my-uploads',
 *   region: 'us-east-1',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 * });
 * ```
 *
 * @example Cloudflare R2
 * ```typescript
 * const r2Config = createProvider('cloudflareR2', {
 *   bucket: 'my-r2-bucket',
 *   accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
 *   accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
 * });
 * ```
 *
 * @example MinIO (self-hosted)
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
 * @example Neon Object Storage
 * ```typescript
 * const neonConfig = createProvider('neonStorage', {
 *   endpoint: process.env.AWS_ENDPOINT_URL_S3!,
 *   bucket: 'user-uploads',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *   // region is read from the endpoint hostname
 * });
 * ```
 */

import { logger } from "../utils/logger";

// ========================================
// Provider Types
// ========================================

/**
 * Valid S3 ACL values for controlling object access.
 * Note: Cloudflare R2, MinIO and Neon Object Storage do not support per-object
 * ACLs — use bucket-level access settings instead. Setting `acl` has no effect
 * on those providers.
 */
export type S3AclValue =
  | "private"
  | "public-read"
  | "public-read-write"
  | "authenticated-read"
  | "bucket-owner-read"
  | "bucket-owner-full-control"
  | "log-delivery-write"
  | (string & {});

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
  /**
   * S3 ACL for uploaded objects.
   * Not supported on Cloudflare R2, MinIO or Neon Object Storage — ignored on
   * those providers.
   */
  acl?: S3AclValue;
  /** Custom domain for file URLs (e.g., 'cdn.example.com') */
  customDomain?: string;
  /** Force path-style URLs instead of virtual-hosted style */
  forcePathStyle?: boolean;
}

// ========================================
// Supported Providers
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
 * Configuration for Cloudflare R2 object storage.
 * S3-compatible storage with zero egress fees and global distribution.
 *
 * @interface CloudflareR2Config
 * @extends BaseProviderConfig
 *
 * @example Basic Configuration
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
 * @example With Custom Domain
 * ```typescript
 * const r2WithDomain: CloudflareR2Config = {
 *   provider: 'cloudflare-r2',
 *   bucket: 'assets',
 *   accountId: 'abc123',
 *   accessKeyId: 'key123',
 *   secretAccessKey: 'secret123',
 *   customDomain: 'assets.myapp.com',
 * };
 * ```
 */
export interface CloudflareR2Config extends BaseProviderConfig {
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
  /**
   * Session token for temporary credentials.
   *
   * Set when credentials come from STS rather than a static key pair. SigV4
   * signs it as `X-Amz-Security-Token`; without it the provider rejects the
   * signature.
   */
  sessionToken?: string;
}

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
  /**
   * Session token for temporary credentials.
   *
   * Set when credentials come from STS rather than a static key pair. SigV4
   * signs it as `X-Amz-Security-Token`; without it the provider rejects the
   * signature.
   */
  sessionToken?: string;
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
  /**
   * Session token for temporary credentials.
   *
   * Set when credentials come from STS rather than a static key pair. SigV4
   * signs it as `X-Amz-Security-Token`; without it the provider rejects the
   * signature.
   */
  sessionToken?: string;
}

/**
 * Configuration for Neon Object Storage.
 * S3-compatible storage built into a Neon project. Buckets belong to a branch
 * and branch with the database, so every branch has its own endpoint and its
 * own copy-on-write view of each bucket.
 *
 * @interface NeonStorageConfig
 * @extends BaseProviderConfig
 *
 * @example Basic Configuration
 * ```typescript
 * const neonConfig: NeonStorageConfig = {
 *   provider: 'neon-storage',
 *   endpoint: 'https://br-cool-darkness-a1b2c3d4.storage.c-6.us-east-2.aws.neon.tech',
 *   bucket: 'user-uploads',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!, // nak_live_...
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!, // nsk_live_...
 * };
 * ```
 */
export interface NeonStorageConfig extends BaseProviderConfig {
  provider: "neon-storage";
  /**
   * The branch storage endpoint, exposed as `AWS_ENDPOINT_URL_S3` by
   * `neon env pull` and inside Neon Functions.
   */
  endpoint: string;
  /** The Neon credential `token_id` (`nak_live_...`) */
  accessKeyId: string;
  /** The Neon credential `s3_secret_access_key` (`nsk_live_...`) */
  secretAccessKey: string;
  /**
   * Signing region. Read from the endpoint hostname when omitted — a
   * `...us-east-2.aws.neon.tech` endpoint signs as `us-east-2`.
   */
  region: string;
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
  | AWSProviderConfig
  | CloudflareR2Config
  | DigitalOceanSpacesConfig
  | MinIOConfig
  | NeonStorageConfig
  // Special Cases
  | GoogleCloudStorageConfig
  | S3CompatibleConfig;

// ========================================
// DRY Provider Factory System
// ========================================

interface ProviderSpec {
  readonly provider: string;
  /** The options this provider accepts. Anything else is reported and dropped. */
  readonly fields: readonly string[];
  readonly defaults: Record<string, any>;
  readonly customLogic?: (config: any, computed: any) => any;
}

/**
 * Generic provider configuration builder
 * Validates required configuration fields
 */
function createProviderBuilder<T extends ProviderConfig>(
  spec: ProviderSpec
): (config?: Partial<T>) => T {
  return (config: Partial<T> = {}): T => {
    const result: any = { provider: spec.provider };

    // Use ?? (nullish coalescing) so that false, 0, and "" are preserved.
    for (const key of spec.fields) {
      result[key] = config[key as keyof T] ?? spec.defaults[key] ?? "";
    }

    // Apply custom logic if provided
    if (spec.customLogic) {
      Object.assign(result, spec.customLogic(config, result));
    }

    /**
     * Report anything the caller supplied that did not survive.
     *
     * Only listed keys are copied, and everything else is discarded — which is
     * how `sessionToken` came to be declared, documented, read from the
     * environment and then lost before signing. The resolution behaviour is
     * deliberately unchanged, because copying arbitrary keys into a provider
     * config would defeat validation. What changes is that it is no longer
     * silent: a typo, an option from a newer version, or a key copied from a
     * sibling provider now says so instead of being ignored.
     *
     * Compared against the *final* result rather than `fields`, so options
     * a provider computes for itself — MinIO's `useSSL` and `port` — do not
     * produce a warning nobody should act on.
     */
    const dropped = Object.keys(config).filter(
      (key) => config[key as keyof T] !== undefined && !(key in result)
    );

    if (dropped.length > 0) {
      logger.warn(
        `Ignored unrecognised ${spec.provider} provider option${dropped.length > 1 ? "s" : ""}: ${dropped.join(", ")}`,
        { provider: spec.provider, ignored: dropped }
      );
    }

    // Validate the final configuration
    const validation = validateProviderConfig(result);
    if (!validation.valid) {
      throw new Error(
        `Provider validation failed: ${validation.errors.join(", ")}`
      );
    }

    return result as T;
  };
}

// ========================================
// Provider Specifications (DRY)
// ========================================

const PROVIDER_SPECS = {
  aws: {
    provider: "aws",
    fields: [
      "region",
      "bucket",
      "accessKeyId",
      "secretAccessKey",
      "sessionToken",
      "acl",
      "customDomain",
      "forcePathStyle",
    ],
    defaults: {
      region: "us-east-1",
      acl: "private",
    },
  },

  cloudflareR2: {
    provider: "cloudflare-r2",
    fields: [
      "accountId",
      "bucket",
      "accessKeyId",
      "secretAccessKey",
      "sessionToken",
      "endpoint",
      "customDomain",
      "acl",
    ],
    defaults: {
      region: "auto",
      acl: "private",
    },
    customLogic: (config: any, computed: any) => ({
      endpoint:
        computed.endpoint ||
        (computed.accountId
          ? `https://${computed.accountId}.r2.cloudflarestorage.com`
          : ""),
    }),
  },

  digitalOceanSpaces: {
    provider: "digitalocean-spaces",
    fields: [
      "region",
      "bucket",
      "accessKeyId",
      "secretAccessKey",
      "sessionToken",
      "endpoint",
      "customDomain",
      "acl",
    ],
    defaults: {
      region: "nyc3",
      acl: "private",
    },
    customLogic: (config: any, computed: any) => ({
      endpoint:
        computed.endpoint ||
        `https://${computed.region}.digitaloceanspaces.com`,
    }),
  },

  minio: {
    provider: "minio",
    fields: [
      "endpoint",
      "bucket",
      "accessKeyId",
      "secretAccessKey",
      "sessionToken",
      "region",
      "customDomain",
      "acl",
    ],
    defaults: {
      endpoint: "localhost:9000",
      region: "us-east-1",
      acl: "private",
    },
    customLogic: (config: any, computed: any) => ({
      useSSL: config.useSSL ?? false,
      port: config.port ? Number(config.port) : undefined,
    }),
  },

  neonStorage: {
    provider: "neon-storage",
    fields: [
      "endpoint",
      "bucket",
      "accessKeyId",
      "secretAccessKey",
      "region",
      "customDomain",
      "acl",
    ],
    defaults: {
      acl: "private",
    },
    customLogic: (
      _config: unknown,
      computed: { endpoint: string; region: string }
    ) => ({
      endpoint: computed.endpoint.replace(/\/+$/, ""),
      region: computed.region || getNeonStorageRegion(computed.endpoint) || "",
    }),
  },

  gcs: {
    provider: "gcs",
    fields: [
      "projectId",
      "bucket",
      "keyFilename",
      "region",
      "customDomain",
      "acl",
    ],
    defaults: {
      region: "us-central1",
      acl: "private",
    },
    customLogic: (config: any) => ({
      credentials: config.credentials,
    }),
  },

  s3Compatible: {
    provider: "s3-compatible",
    fields: [
      "endpoint",
      "bucket",
      "accessKeyId",
      "secretAccessKey",
      "sessionToken",
      "region",
      "customDomain",
      "acl",
      "forcePathStyle",
    ],
    defaults: {
      region: "us-east-1",
      acl: "private",
      // Most S3-compatible services want the bucket in the path; virtual-hosted
      // ones (Backblaze B2, Wasabi) set forcePathStyle: false.
      forcePathStyle: true,
    },
  },
} as const;

/**
 * The URL MinIO requests go to.
 *
 * MinIO is often configured the way `mc alias` and the docker images present
 * it — `localhost:9000`, or a host plus `useSSL` and `port` — rather than as a
 * URL. A full URL is used as written; anything else is assembled from
 * `useSSL` (default `http`) and `port`.
 *
 * @internal
 */
export function getMinioEndpoint(config: MinIOConfig): string {
  const endpoint = config.endpoint.replace(/\/+$/, "");

  if (/^https?:\/\//.test(endpoint)) {
    return endpoint;
  }

  const port =
    config.port && !/:\d+$/.test(endpoint) ? `:${config.port}` : "";
  return `${config.useSSL ? "https" : "http"}://${endpoint}${port}`;
}

/**
 * Reads the signing region out of a Neon branch storage endpoint.
 *
 * Branch endpoints carry their region in the hostname
 * (`br-....storage.c-6.us-east-2.aws.neon.tech`), so asking for it separately
 * only creates a way to get it wrong: a mismatched region fails every request
 * with `SignatureDoesNotMatch`, which names the signature rather than the
 * region.
 *
 * @internal
 */
export function getNeonStorageRegion(endpoint: string): string | undefined {
  try {
    const { hostname } = new URL(endpoint);
    return /\.([a-z]{2}-[a-z]+-\d+)\.aws\.neon\.tech$/.exec(hostname)?.[1];
  } catch {
    return undefined;
  }
}

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
 * Maps each provider type to its corresponding configuration interface
 * This enables type-safe provider configuration in createUploadConfig().provider()
 */
export type ProviderConfigMap = {
  aws: Partial<Omit<AWSProviderConfig, "provider">>;
  cloudflareR2: Partial<Omit<CloudflareR2Config, "provider">>;
  digitalOceanSpaces: Partial<Omit<DigitalOceanSpacesConfig, "provider">>;
  minio: Partial<Omit<MinIOConfig, "provider">>;
  neonStorage: Partial<Omit<NeonStorageConfig, "provider">>;
  gcs: Partial<Omit<GoogleCloudStorageConfig, "provider">>;
  s3Compatible: Partial<Omit<S3CompatibleConfig, "provider">>;
};

/**
 * Creates a validated provider configuration from explicit options.
 *
 * Options a provider can derive are filled in — R2's endpoint from its
 * account ID, Spaces' endpoint from its region, Neon's region from its
 * endpoint. Nothing is read from the environment.
 *
 * @template T - The provider type
 * @param type - The provider type identifier
 * @param config - The provider's options
 * @returns Complete provider configuration
 *
 * @example AWS S3
 * ```typescript
 * const s3Config = createProvider('aws', {
 *   bucket: 'my-uploads',
 *   region: 'us-east-1',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 * });
 * ```
 *
 * @example DigitalOcean Spaces
 * ```typescript
 * const spacesConfig = createProvider('digitalOceanSpaces', {
 *   bucket: 'my-space',
 *   region: 'nyc3', // endpoint becomes https://nyc3.digitaloceanspaces.com
 *   accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY!,
 * });
 * ```
 *
 * @throws {Error} When a required option is missing or invalid
 */
export function createProvider<T extends ProviderType>(
  type: T,
  config: ProviderConfigMap[T] = {} as ProviderConfigMap[T]
): ProviderConfig {
  const spec = PROVIDER_SPECS[type];
  if (!spec) {
    throw new Error(`Unknown provider type: ${type}`);
  }

  return createProviderBuilder(spec)(config as any);
}

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

  // "" is how an omitted option is stored. Anything else that is not a
  // boolean is most often `process.env.X` passed through unconverted: the
  // string "false" is truthy, so it would select path-style on one provider
  // and its opposite on another.
  const { forcePathStyle } = config as { forcePathStyle?: unknown };
  if (
    forcePathStyle !== undefined &&
    forcePathStyle !== "" &&
    typeof forcePathStyle !== "boolean"
  ) {
    errors.push(
      `forcePathStyle must be true or false, got ${JSON.stringify(forcePathStyle)} — convert environment strings, e.g. process.env.S3_FORCE_PATH_STYLE === "true"`
    );
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

    case "neon-storage":
      if (!config.endpoint) {
        errors.push("Neon Object Storage endpoint is required");
      } else if (!/^https:\/\//.test(config.endpoint)) {
        errors.push("Neon Object Storage endpoint must be an https:// URL");
      }
      if (!config.accessKeyId)
        errors.push("Neon Object Storage Access Key ID is required");
      if (!config.secretAccessKey)
        errors.push("Neon Object Storage Secret Access Key is required");
      if (!config.region)
        errors.push(
          "Neon Object Storage region is required when it cannot be read from the endpoint"
        );
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
    case "minio":
      return getMinioEndpoint(config);
    case "neon-storage":
      return config.endpoint;
    case "gcs":
      return "https://storage.googleapis.com";
    case "s3-compatible":
      return config.endpoint;
    default:
      return "";
  }
}
