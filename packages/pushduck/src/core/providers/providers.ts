/**
 * Cloud Storage Providers System
 *
 * This provides a clean way to configure different cloud storage providers
 * with environment-based configuration and type-safe initialization.
 *
 * Supported Providers:
 * - AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO
 *
 * Future Provider Support:
 * - Enterprise: Azure Blob, IBM Cloud, Oracle OCI
 * - Cost-Optimized: Wasabi, Backblaze B2, Storj DCS
 * - Specialized: Telnyx, Tigris, Cloudian HyperStore
 */

// ========================================
// Provider Types
// ========================================

export interface BaseProviderConfig {
  provider: string;
  region?: string;
  bucket: string;
  acl?: string;
  customDomain?: string;
  forcePathStyle?: boolean;
}

// ========================================
// TIER 1: Currently Supported Providers
// ========================================

export interface AWSProviderConfig extends BaseProviderConfig {
  provider: "aws";
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string;
}

export interface CloudflareR2Config extends BaseProviderConfig {
  provider: "cloudflare-r2";
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: "auto";
  endpoint?: string; // Auto-generated from accountId if not provided
}

export interface DigitalOceanSpacesConfig extends BaseProviderConfig {
  provider: "digitalocean-spaces";
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpoint?: string; // Auto-generated from region if not provided
}

export interface MinIOConfig extends BaseProviderConfig {
  provider: "minio";
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  useSSL?: boolean;
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

interface EnvVarMapping {
  readonly [key: string]: readonly string[];
}

interface ProviderSpec {
  readonly provider: string;
  readonly envVars: EnvVarMapping;
  readonly defaults: Record<string, any>;
  readonly customLogic?: (config: any, computed: any) => any;
}

/**
 * Generic provider configuration builder
 * Eliminates repetitive environment variable reading and config merging
 */
function createProviderBuilder<T extends ProviderConfig>(
  spec: ProviderSpec
): (config?: Partial<T>) => T {
  return (config: Partial<T> = {}): T => {
    const result: any = { provider: spec.provider };

    // Process environment variables and defaults
    for (const [key, envKeys] of Object.entries(spec.envVars)) {
      result[key] =
        config[key as keyof T] ||
        readEnvVar(envKeys) ||
        spec.defaults[key] ||
        "";
    }

    // Apply custom logic if provided
    if (spec.customLogic) {
      Object.assign(result, spec.customLogic(config, result));
    }

    return result as T;
  };
}

/**
 * Read first available environment variable from a list
 */
function readEnvVar(envKeys: readonly string[]): string | undefined {
  for (const key of envKeys) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
}

// ========================================
// Provider Specifications (DRY)
// ========================================

const PROVIDER_SPECS = {
  aws: {
    provider: "aws",
    envVars: {
      region: ["AWS_REGION", "S3_REGION"],
      bucket: ["AWS_S3_BUCKET", "S3_BUCKET", "S3_BUCKET_NAME"],
      accessKeyId: ["AWS_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID"],
      secretAccessKey: ["AWS_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY"],
      sessionToken: ["AWS_SESSION_TOKEN"],
      acl: ["S3_ACL"],
      customDomain: ["S3_CUSTOM_DOMAIN"],
    },
    defaults: {
      region: "us-east-1",
      acl: "private",
    },
  },

  cloudflareR2: {
    provider: "cloudflare-r2",
    envVars: {
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
    envVars: {
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
    customLogic: (config: any, computed: any) => ({
      endpoint:
        computed.endpoint ||
        `https://${computed.region}.digitaloceanspaces.com`,
    }),
  },

  minio: {
    provider: "minio",
    envVars: {
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
    customLogic: (config: any, computed: any) => ({
      useSSL: config.useSSL ?? process.env.MINIO_USE_SSL === "true",
      port: config.port
        ? Number(config.port)
        : process.env.MINIO_PORT
          ? Number(process.env.MINIO_PORT)
          : undefined,
    }),
  },

  gcs: {
    provider: "gcs",
    envVars: {
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
    customLogic: (config: any) => ({
      credentials: config.credentials,
    }),
  },

  s3Compatible: {
    provider: "s3-compatible",
    envVars: {
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
} as const;

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
  gcs: Partial<Omit<GoogleCloudStorageConfig, "provider">>;
  s3Compatible: Partial<Omit<S3CompatibleConfig, "provider">>;
};

/**
 * Type-safe provider configuration function
 * Usage: createProvider("aws", { bucket: "my-bucket", region: "us-west-2" })
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
// Environment Detection
// ========================================

// ========================================
// Provider Configuration Validation
// ========================================

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
