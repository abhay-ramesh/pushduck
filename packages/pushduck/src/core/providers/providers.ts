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
// Environment Detection
// ========================================

function detectProvider(): ProviderConfig["provider"] | null {
  // Check for Cloudflare R2
  if (process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID) {
    return "cloudflare-r2";
  }

  // Check for DigitalOcean Spaces
  if (
    process.env.DO_SPACES_ENDPOINT ||
    process.env.DIGITALOCEAN_SPACES_ENDPOINT
  ) {
    return "digitalocean-spaces";
  }

  // Check for MinIO
  if (process.env.MINIO_ENDPOINT) {
    return "minio";
  }

  // Check for Wasabi
  if (process.env.WASABI_ACCESS_KEY_ID || process.env.WASABI_ENDPOINT) {
    return "wasabi";
  }

  // Check for Backblaze B2
  if (process.env.B2_APPLICATION_KEY_ID || process.env.B2_ENDPOINT) {
    return "backblaze-b2";
  }

  // Check for Google Cloud Storage
  if (process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCS_PROJECT_ID) {
    return "gcs";
  }

  // Check for generic S3-compatible
  if (process.env.S3_COMPATIBLE_ENDPOINT) {
    return "s3-compatible";
  }

  // Default to AWS
  if (process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID) {
    return "aws";
  }

  return null;
}

// ========================================
// Provider Configuration Builders
// ========================================

export const providers = {
  /**
   * AWS S3 Provider
   */
  aws: (config?: Partial<AWSProviderConfig>): AWSProviderConfig => ({
    provider: "aws",
    region:
      config?.region ||
      process.env.AWS_REGION ||
      process.env.S3_REGION ||
      "us-east-1",
    bucket:
      config?.bucket ||
      process.env.AWS_S3_BUCKET ||
      process.env.S3_BUCKET ||
      process.env.S3_BUCKET_NAME ||
      "",
    accessKeyId:
      config?.accessKeyId ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.S3_ACCESS_KEY_ID ||
      "",
    secretAccessKey:
      config?.secretAccessKey ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      process.env.S3_SECRET_ACCESS_KEY ||
      "",
    sessionToken: config?.sessionToken || process.env.AWS_SESSION_TOKEN,
    acl: config?.acl || process.env.S3_ACL || "private",
    customDomain: config?.customDomain || process.env.S3_CUSTOM_DOMAIN,
  }),

  /**
   * Cloudflare R2 Provider
   */
  cloudflareR2: (config?: Partial<CloudflareR2Config>): CloudflareR2Config => {
    const accountId =
      config?.accountId ||
      process.env.CLOUDFLARE_ACCOUNT_ID ||
      process.env.R2_ACCOUNT_ID ||
      "";
    const endpoint =
      config?.endpoint ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "") ||
      process.env.CLOUDFLARE_R2_ENDPOINT ||
      process.env.R2_ENDPOINT ||
      "";

    return {
      provider: "cloudflare-r2",
      accountId,
      region: "auto",
      bucket:
        config?.bucket ||
        process.env.CLOUDFLARE_R2_BUCKET ||
        process.env.R2_BUCKET ||
        "",
      accessKeyId:
        config?.accessKeyId ||
        process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
        process.env.R2_ACCESS_KEY_ID ||
        "",
      secretAccessKey:
        config?.secretAccessKey ||
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
        process.env.R2_SECRET_ACCESS_KEY ||
        "",
      endpoint,
      acl: config?.acl || "private",
      customDomain: config?.customDomain || process.env.R2_CUSTOM_DOMAIN,
    };
  },

  /**
   * DigitalOcean Spaces Provider
   */
  digitalOceanSpaces: (
    config?: Partial<DigitalOceanSpacesConfig>
  ): DigitalOceanSpacesConfig => {
    const region =
      config?.region ||
      process.env.DO_SPACES_REGION ||
      process.env.DIGITALOCEAN_SPACES_REGION ||
      "nyc3";
    const endpoint =
      config?.endpoint ||
      process.env.DO_SPACES_ENDPOINT ||
      process.env.DIGITALOCEAN_SPACES_ENDPOINT ||
      `https://${region}.digitaloceanspaces.com`;

    return {
      provider: "digitalocean-spaces",
      region,
      endpoint,
      bucket:
        config?.bucket ||
        process.env.DO_SPACES_BUCKET ||
        process.env.DIGITALOCEAN_SPACES_BUCKET ||
        "",
      accessKeyId:
        config?.accessKeyId ||
        process.env.DO_SPACES_ACCESS_KEY_ID ||
        process.env.DIGITALOCEAN_SPACES_ACCESS_KEY_ID ||
        "",
      secretAccessKey:
        config?.secretAccessKey ||
        process.env.DO_SPACES_SECRET_ACCESS_KEY ||
        process.env.DIGITALOCEAN_SPACES_SECRET_ACCESS_KEY ||
        "",
      acl: config?.acl || "private",
      customDomain: config?.customDomain || process.env.DO_SPACES_CUSTOM_DOMAIN,
    };
  },

  /**
   * MinIO Provider
   */
  minio: (config?: Partial<MinIOConfig>): MinIOConfig => ({
    provider: "minio",
    endpoint:
      config?.endpoint || process.env.MINIO_ENDPOINT || "localhost:9000",
    bucket: config?.bucket || process.env.MINIO_BUCKET || "",
    accessKeyId:
      config?.accessKeyId ||
      process.env.MINIO_ACCESS_KEY_ID ||
      process.env.MINIO_ACCESS_KEY ||
      "",
    secretAccessKey:
      config?.secretAccessKey ||
      process.env.MINIO_SECRET_ACCESS_KEY ||
      process.env.MINIO_SECRET_KEY ||
      "",
    useSSL: config?.useSSL ?? process.env.MINIO_USE_SSL === "true",
    port: config?.port
      ? Number(config.port)
      : process.env.MINIO_PORT
        ? Number(process.env.MINIO_PORT)
        : undefined,
    region: config?.region || process.env.MINIO_REGION || "us-east-1",
    acl: config?.acl || "private",
    customDomain: config?.customDomain || process.env.MINIO_CUSTOM_DOMAIN,
  }),

  /**
   * Google Cloud Storage Provider
   */
  gcs: (
    config?: Partial<GoogleCloudStorageConfig>
  ): GoogleCloudStorageConfig => ({
    provider: "gcs",
    projectId:
      config?.projectId ||
      process.env.GOOGLE_CLOUD_PROJECT_ID ||
      process.env.GCS_PROJECT_ID ||
      "",
    bucket:
      config?.bucket ||
      process.env.GCS_BUCKET ||
      process.env.GOOGLE_CLOUD_STORAGE_BUCKET ||
      "",
    keyFilename:
      config?.keyFilename ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GCS_KEY_FILE,
    credentials: config?.credentials,
    region: config?.region || process.env.GCS_REGION || "us-central1",
    acl: config?.acl || "private",
    customDomain: config?.customDomain || process.env.GCS_CUSTOM_DOMAIN,
  }),
};

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
    default:
      return "";
  }
}
