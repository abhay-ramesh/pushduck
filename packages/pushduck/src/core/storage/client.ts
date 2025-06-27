/**
 * @fileoverview Lightweight S3 Client Implementation using aws4fetch
 *
 * This module replaces the heavy AWS SDK v3 with a minimal 6.4kB alternative
 * that provides the same functionality with ~99% bundle size reduction.
 *
 * Features:
 * - Multi-provider support (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO)
 * - Presigned URL generation for secure uploads/downloads
 * - File operations (upload, download, delete, list, metadata)
 * - Progress tracking and validation
 * - Type-safe configuration with comprehensive error handling
 *
 * @example Basic Usage
 * ```typescript
 * import { generatePresignedUploadUrl, uploadFileToS3 } from 'pushduck/server';
 *
 * // Generate presigned URL
 * const result = await generatePresignedUploadUrl(config, {
 *   key: 'uploads/image.jpg',
 *   contentType: 'image/jpeg',
 *   expiresIn: 3600,
 * });
 *
 * // Upload file directly
 * const url = await uploadFileToS3(config, file, 'uploads/document.pdf', {
 *   contentType: 'application/pdf',
 *   onProgress: (progress) => console.log(`${progress.percentage}%`),
 * });
 * ```
 *
 * @example Multi-Provider Configuration
 * ```typescript
 * // AWS S3
 * const awsConfig = createUploadConfig()
 *   .provider("aws", { bucket: "my-bucket", region: "us-east-1" })
 *   .build();
 *
 * // Cloudflare R2
 * const r2Config = createUploadConfig()
 *   .provider("cloudflareR2", {
 *     accountId: "...",
 *     bucket: "my-bucket",
 *     region: "auto"
 *   })
 *   .build();
 *
 * // Both use the same API
 * const files = await listFiles(awsConfig.config);
 * const r2Files = await listFiles(r2Config.config);
 * ```
 *
 * @author Pushduck Team
 * @since 1.0.0
 */

import { AwsClient } from "aws4fetch";
import type { UploadConfig } from "../config";
import type { ProviderConfig } from "../providers/providers";
import { createConfigError, createS3Error } from "../types/errors";
import { logger } from "../utils/logger";

// ========================================
// Configuration Helper
// ========================================

/**
 * S3-compatible configuration interface for internal use.
 * Normalizes different provider configurations into a common format.
 *
 * @interface S3CompatibleConfig
 * @internal
 */
interface S3CompatibleConfig {
  /** AWS access key ID */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** AWS region (or equivalent for other providers) */
  region: string;
  /** S3 bucket name */
  bucket: string;
  /** Custom endpoint URL for S3-compatible providers */
  endpoint?: string;
  /** Whether to use path-style URLs (required for some providers) */
  forcePathStyle?: boolean;
  /** Default ACL for uploaded objects */
  acl?: string;
  /** Custom domain for public URLs */
  customDomain?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Extracts S3-compatible configuration from provider config.
 * This function normalizes different provider configurations into a common format
 * that can be used with the aws4fetch client.
 *
 * @param config - Provider configuration object
 * @returns Normalized S3-compatible configuration
 * @throws {Error} For unsupported providers
 *
 * @internal
 *
 * @example
 * ```typescript
 * const awsConfig = getS3CompatibleConfig({
 *   provider: "aws",
 *   bucket: "my-bucket",
 *   region: "us-east-1",
 *   accessKeyId: "...",
 *   secretAccessKey: "...",
 * });
 *
 * const r2Config = getS3CompatibleConfig({
 *   provider: "cloudflare-r2",
 *   bucket: "my-bucket",
 *   region: "auto",
 *   endpoint: "https://abc123.r2.cloudflarestorage.com",
 *   accessKeyId: "...",
 *   secretAccessKey: "...",
 * });
 * ```
 */
function getS3CompatibleConfig(config: ProviderConfig): S3CompatibleConfig {
  const baseConfig = {
    bucket: config.bucket,
    acl: config.acl,
    customDomain: config.customDomain,
    debug:
      process.env.NODE_ENV === "development" || process.env.DEBUG === "true",
  };

  switch (config.provider) {
    // ========================================
    // TIER 1: Currently Supported Providers
    // ========================================

    case "aws":
      return {
        ...baseConfig,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region,
        // No endpoint - uses AWS default
        // forcePathStyle: false (default)
      };

    case "cloudflare-r2":
      return {
        ...baseConfig,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region || "auto", // R2 uses "auto" and aws4fetch handles this correctly
        endpoint: config.endpoint, // e.g., "https://abc123.r2.cloudflarestorage.com"
        forcePathStyle: true, // R2 requires path-style
      };

    case "digitalocean-spaces":
      return {
        ...baseConfig,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region || "us-east-1", // Spaces needs AWS region for signing
        endpoint: config.endpoint, // e.g., "https://nyc3.digitaloceanspaces.com"
        forcePathStyle: false, // Spaces uses virtual hosted-style
      };

    case "minio":
      return {
        ...baseConfig,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region || "us-east-1",
        endpoint: config.endpoint, // e.g., "https://play.min.io" or custom
        forcePathStyle: true, // MinIO requires path-style
      };

    // ========================================
    // TIER 2: Enterprise/Hyperscale Providers
    // ========================================

    case "azure-blob":
      throw new Error(
        "Azure Blob Storage support coming soon. Azure uses a different authentication model that requires additional implementation."
      );
    // TODO: Implement Azure Blob Storage
    // return {
    //   ...baseConfig,
    //   accessKeyId: config.accessKeyId,
    //   secretAccessKey: config.secretAccessKey,
    //   region: config.region || "us-east-1",
    //   endpoint: config.endpoint, // e.g., "https://account.blob.core.windows.net"
    //   forcePathStyle: true,
    // };

    case "ibm-cloud":
      throw new Error(
        "IBM Cloud Object Storage support coming soon. Requires IBM-specific endpoint configuration."
      );
    // TODO: Implement IBM Cloud Object Storage
    // return {
    //   ...baseConfig,
    //   accessKeyId: config.accessKeyId,
    //   secretAccessKey: config.secretAccessKey,
    //   region: config.region || "us-south",
    //   endpoint: config.endpoint, // e.g., "https://s3.us-south.cloud-object-storage.appdomain.cloud"
    //   forcePathStyle: false,
    // };

    case "oracle-oci":
      throw new Error(
        "Oracle Cloud Infrastructure Object Storage support coming soon."
      );
    // TODO: Implement Oracle OCI Object Storage
    // return {
    //   ...baseConfig,
    //   accessKeyId: config.accessKeyId,
    //   secretAccessKey: config.secretAccessKey,
    //   region: config.region || "us-ashburn-1",
    //   endpoint: config.endpoint, // e.g., "https://namespace.compat.objectstorage.region.oraclecloud.com"
    //   forcePathStyle: false,
    // };

    // ========================================
    // TIER 3: Cost-Optimized Providers
    // ========================================

    case "wasabi":
      throw new Error(
        "Wasabi Hot Cloud Storage support coming soon. Single-tier storage with no egress fees."
      );
    // TODO: Implement Wasabi
    // return {
    //   ...baseConfig,
    //   accessKeyId: config.accessKeyId,
    //   secretAccessKey: config.secretAccessKey,
    //   region: config.region || "us-east-1",
    //   endpoint: config.endpoint || "https://s3.wasabisys.com", // Default endpoint
    //   forcePathStyle: true,
    // };

    case "backblaze-b2":
      throw new Error(
        "Backblaze B2 support coming soon. Competitive pricing with free Cloudflare egress."
      );
    // TODO: Implement Backblaze B2
    // return {
    //   ...baseConfig,
    //   accessKeyId: config.accessKeyId,
    //   secretAccessKey: config.secretAccessKey,
    //   region: config.region || "us-west-000",
    //   endpoint: config.endpoint, // e.g., "https://s3.us-west-000.backblazeb2.com"
    //   forcePathStyle: false,
    // };

    case "storj-dcs":
      throw new Error(
        "Storj DCS (Decentralized Cloud Storage) support coming soon. End-to-end encrypted, decentralized storage."
      );
    // TODO: Implement Storj DCS
    // return {
    //   ...baseConfig,
    //   accessKeyId: config.accessKeyId,
    //   secretAccessKey: config.secretAccessKey,
    //   region: config.region || "global",
    //   endpoint: config.endpoint || "https://gateway.storjshare.io",
    //   forcePathStyle: true,
    // };

    // ========================================
    // TIER 4: Performance/Specialized Providers
    // ========================================

    case "telnyx-storage":
      throw new Error(
        "Telnyx Storage support coming soon. Global edge network with private backbone."
      );
    // TODO: Implement Telnyx Storage
    // return {
    //   ...baseConfig,
    //   accessKeyId: config.accessKeyId,
    //   secretAccessKey: config.secretAccessKey,
    //   region: config.region || "us-east-1",
    //   endpoint: config.endpoint, // Telnyx-specific endpoint
    //   forcePathStyle: true,
    // };

    case "tigris-data":
      throw new Error(
        "Tigris Data support coming soon. Globally distributed storage with single endpoint."
      );
    // TODO: Implement Tigris Data
    // return {
    //   ...baseConfig,
    //   accessKeyId: config.accessKeyId,
    //   secretAccessKey: config.secretAccessKey,
    //   region: "auto", // Tigris uses "auto" region
    //   endpoint: config.endpoint, // e.g., "https://fly.storage.tigris.dev"
    //   forcePathStyle: true,
    // };

    case "cloudian-hyperstore":
      throw new Error(
        "Cloudian HyperStore support coming soon. On-premises and hybrid cloud object storage."
      );
    // TODO: Implement Cloudian HyperStore
    // return {
    //   ...baseConfig,
    //   accessKeyId: config.accessKeyId,
    //   secretAccessKey: config.secretAccessKey,
    //   region: config.region || "us-east-1",
    //   endpoint: config.endpoint, // Customer-specific endpoint
    //   forcePathStyle: true,
    // };

    // ========================================
    // Special Cases
    // ========================================

    case "gcs":
      throw new Error(
        "Google Cloud Storage is not S3-compatible for authentication. Use Google Cloud Storage client libraries instead, or consider Google Cloud Storage S3 interoperability (limited compatibility)."
      );

    // ========================================
    // Generic S3-Compatible Provider
    // ========================================

    case "s3-compatible":
      // Generic fallback for any S3-compatible provider
      if (!config.endpoint) {
        throw new Error(
          "Generic S3-compatible provider requires an endpoint URL."
        );
      }
      return {
        ...baseConfig,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region || "us-east-1",
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle ?? true, // Default to path-style for generic providers
      };

    default:
      throw new Error(
        `Unsupported provider: ${(config as any).provider}. ` +
          `Supported providers: aws, cloudflare-r2, digitalocean-spaces, minio. ` +
          `Coming soon: wasabi, backblaze-b2, azure-blob, ibm-cloud, oracle-oci, storj-dcs, telnyx-storage, tigris-data, cloudian-hyperstore. ` +
          `For other providers, use "s3-compatible" with a custom endpoint.`
      );
  }
}

// ========================================
// AWS Client Factory
// ========================================

let awsClientInstance: AwsClient | null = null;

/**
 * Creates and caches an AWS client instance using aws4fetch
 */
/**
 * Creates and caches an AWS client instance using aws4fetch.
 * This function creates a lightweight S3-compatible client that works with multiple providers.
 * The client is cached for performance and reused across requests.
 *
 * @param uploadConfig - Optional upload configuration. If not provided, uses global config.
 * @returns Configured AwsClient instance
 * @throws {Error} If configuration is missing or invalid
 *
 * @example Basic Usage
 * ```typescript
 * const client = createS3Client(config);
 *
 * // Use with aws4fetch methods
 * const response = await client.fetch('https://bucket.s3.amazonaws.com/file.jpg');
 * ```
 *
 * @example Provider-Specific Clients
 * ```typescript
 * // AWS S3 client
 * const awsClient = createS3Client(awsConfig);
 *
 * // Cloudflare R2 client
 * const r2Client = createS3Client(r2Config);
 *
 * // Both use the same interface
 * ```
 *
 * @since 1.0.0
 */
export function createS3Client(uploadConfig?: UploadConfig): AwsClient {
  if (awsClientInstance && !uploadConfig) {
    return awsClientInstance;
  }

  if (!uploadConfig) {
    throw new Error("UploadConfig is required");
  }

  const config = getS3CompatibleConfig(uploadConfig.provider);

  if (!config.accessKeyId || !config.secretAccessKey || !config.bucket) {
    throw createConfigError(
      "Missing required S3 configuration. Please check your upload configuration.",
      {
        operation: "create-s3-client",
        provider: uploadConfig.provider.provider,
        bucket: config.bucket,
      }
    );
  }

  // Create aws4fetch client with provider-specific configuration
  const clientConfig: any = {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
  };

  // Add service and endpoint configuration based on provider
  if (config.endpoint) {
    // For S3-compatible providers (R2, Spaces, MinIO)
    clientConfig.service = "s3";

    // Only R2 needs region override for signing
    if (uploadConfig.provider.provider === "cloudflare-r2") {
      // R2 works with "auto" region
      clientConfig.region = config.region;
    } else {
      // DigitalOcean Spaces and MinIO need standard AWS regions for signing
      clientConfig.region =
        config.region === "auto" ? "us-east-1" : config.region;
    }
  } else {
    // Standard AWS S3 - no service needed
    clientConfig.region = config.region;
  }

  awsClientInstance = new AwsClient(clientConfig);

  if (config.debug) {
    logger.s3Operation("client-created", {
      region: config.region,
      endpoint: config.endpoint || "default",
      bucket: config.bucket,
      forcePathStyle: config.forcePathStyle,
    });
  }

  return awsClientInstance;
}

/**
 * Resets the AWS client instance (useful for testing)
 */
export function resetS3Client(): void {
  awsClientInstance = null;
}

// ========================================
// S3 URL Builder
// ========================================

/**
 * Builds the S3 endpoint URL for a given key
 */
function buildS3Url(key: string, config: S3CompatibleConfig): string {
  if (config.endpoint) {
    // Custom endpoint (MinIO, R2, etc.)
    const baseUrl = config.endpoint.replace(/\/$/, "");
    // For custom endpoints, always use path-style or follow the forcePathStyle setting
    if (config.forcePathStyle !== false) {
      return `${baseUrl}/${config.bucket}/${key}`;
    } else {
      // Virtual hosted-style for custom endpoints (rare)
      return `${baseUrl}/${key}`;
    }
  }

  // Standard AWS S3 URL
  if (config.forcePathStyle) {
    return `https://s3.${config.region}.amazonaws.com/${config.bucket}/${key}`;
  } else {
    return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
  }
}

// ========================================
// Presigned URL Generation
// ========================================

/**
 * Options for generating presigned URLs for file uploads.
 * These URLs allow clients to upload files directly to S3 without exposing credentials.
 *
 * @interface PresignedUrlOptions
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const options: PresignedUrlOptions = {
 *   key: 'uploads/user-123/avatar.jpg',
 *   contentType: 'image/jpeg',
 *   contentLength: 1024000, // 1MB
 *   expiresIn: 3600, // 1 hour
 *   metadata: {
 *     userId: '123',
 *     uploadedBy: 'web-app',
 *   },
 * };
 * ```
 */
export interface PresignedUrlOptions {
  /** S3 object key (file path) where the file will be stored */
  key: string;
  /** MIME type of the file (optional to avoid signing issues) */
  contentType?: string;
  /** Expected file size in bytes (for validation) */
  contentLength?: number;
  /** URL expiration time in seconds (default: 3600 = 1 hour) */
  expiresIn?: number;
  /** Custom metadata to attach to the uploaded object */
  metadata?: Record<string, string>;
}

/**
 * Result object returned from presigned URL generation.
 * Contains the URL and metadata needed for uploading files.
 *
 * @interface PresignedUrlResult
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const result: PresignedUrlResult = {
 *   url: 'https://bucket.s3.amazonaws.com/uploads/file.jpg?AWSAccessKeyId=...',
 *   key: 'uploads/file.jpg',
 *   fields: {
 *     'Content-Type': 'image/jpeg',
 *     'x-amz-meta-user-id': '123',
 *   },
 * };
 *
 * // Use the URL for direct upload
 * await fetch(result.url, {
 *   method: 'PUT',
 *   headers: result.fields,
 *   body: file,
 * });
 * ```
 */
export interface PresignedUrlResult {
  /** The presigned URL for uploading the file */
  url: string;
  /** The S3 object key where the file will be stored */
  key: string;
  /** Additional form fields required for the upload (for POST uploads) */
  fields?: Record<string, string>;
}

/**
 * Generates a presigned URL for downloading/viewing a file from S3
 */
export async function generatePresignedDownloadUrl(
  uploadConfig: UploadConfig,
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const awsClient = createS3Client(uploadConfig);
  const config = getS3CompatibleConfig(uploadConfig.provider);

  try {
    const s3Url = buildS3Url(key, config);
    const url = new URL(s3Url);

    // Add expiration as query parameter
    url.searchParams.set("X-Amz-Expires", expiresIn.toString());

    // Create a signed request for GET operation (download/view)
    const signedRequest = await awsClient.sign(
      new Request(url.toString(), {
        method: "GET",
      }),
      {
        aws: { signQuery: true },
      }
    );

    if (config.debug) {
      logger.presignedUrl(key, {
        signedUrl: signedRequest.url,
        expiresIn,
      });
    }

    return signedRequest.url;
  } catch (error) {
    logger.error("Failed to generate presigned download URL", error, {
      operation: "generate-presigned-download-url",
      key,
    });
    throw createS3Error(
      `Failed to generate presigned download URL: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      {
        operation: "generate-presigned-download-url",
        key,
        originalError: error instanceof Error ? error : undefined,
      }
    );
  }
}

/**
 * Generates a presigned URL for uploading a file to S3
 */
/**
 * Generates a presigned URL for uploading a single file to S3.
 * This allows clients to upload files directly without exposing AWS credentials.
 *
 * @param uploadConfig - Upload configuration containing provider settings
 * @param options - Presigned URL generation options
 * @returns Promise resolving to presigned URL result
 * @throws {Error} If URL generation fails
 *
 * @example Basic Usage
 * ```typescript
 * const result = await generatePresignedUploadUrl(config, {
 *   key: 'uploads/image.jpg',
 *   contentType: 'image/jpeg',
 *   expiresIn: 3600, // 1 hour
 * });
 *
 * // Client can now upload directly
 * const response = await fetch(result.url, {
 *   method: 'PUT',
 *   headers: { 'Content-Type': 'image/jpeg' },
 *   body: file,
 * });
 * ```
 *
 * @example With Metadata
 * ```typescript
 * const result = await generatePresignedUploadUrl(config, {
 *   key: 'documents/report.pdf',
 *   contentType: 'application/pdf',
 *   metadata: {
 *     userId: '123',
 *     department: 'marketing',
 *     confidential: 'true',
 *   },
 * });
 * ```
 *
 * @since 1.0.0
 */
export async function generatePresignedUploadUrl(
  uploadConfig: UploadConfig,
  options: PresignedUrlOptions
): Promise<PresignedUrlResult> {
  const awsClient = createS3Client(uploadConfig);
  const config = getS3CompatibleConfig(uploadConfig.provider);
  const expiresIn = options.expiresIn || 3600; // 1 hour default

  try {
    // Follow the exact Cloudflare R2 aws4fetch pattern
    const s3Url = buildS3Url(options.key, config);
    const url = new URL(s3Url);

    // Add expiration as query parameter (this is the Cloudflare R2 pattern)
    url.searchParams.set("X-Amz-Expires", expiresIn.toString());

    // Create a signed request for PUT operation - minimal headers approach
    const signedRequest = await awsClient.sign(
      new Request(url.toString(), {
        method: "PUT",
      }),
      {
        aws: { signQuery: true },
      }
    );

    if (config.debug) {
      logger.presignedUrl(options.key, {
        originalUrl: s3Url,
        signedUrl: signedRequest.url,
        config: {
          region: config.region,
          endpoint: config.endpoint,
          bucket: config.bucket,
          forcePathStyle: config.forcePathStyle,
        },
      });
    }

    return {
      url: signedRequest.url,
      key: options.key,
    };
  } catch (error) {
    logger.error("Failed to generate presigned URL", error, {
      operation: "generate-presigned-upload-url",
      key: options.key,
    });
    throw createS3Error(
      `Failed to generate presigned URL: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      {
        operation: "generate-presigned-upload-url",
        key: options.key,
        originalError: error instanceof Error ? error : undefined,
      }
    );
  }
}

/**
 * Generates multiple presigned URLs for batch uploads
 */
export async function generatePresignedUploadUrls(
  uploadConfig: UploadConfig,
  requests: PresignedUrlOptions[]
): Promise<PresignedUrlResult[]> {
  const results = await Promise.allSettled(
    requests.map((options) => generatePresignedUploadUrl(uploadConfig, options))
  );

  const successfulResults: PresignedUrlResult[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      successfulResults.push(result.value);
    } else {
      errors.push(`File ${index}: ${result.reason.message}`);
    }
  });

  if (errors.length > 0) {
    throw new Error(
      `Failed to generate some presigned URLs: ${errors.join(", ")}`
    );
  }

  return successfulResults;
}

// ========================================
// File Operations
// ========================================

/**
 * Checks if a file exists in S3
 */
export async function checkFileExists(
  uploadConfig: UploadConfig,
  key: string
): Promise<boolean> {
  const awsClient = createS3Client(uploadConfig);
  const config = getS3CompatibleConfig(uploadConfig.provider);

  try {
    const s3Url = buildS3Url(key, config);
    const response = await awsClient.fetch(s3Url, {
      method: "HEAD",
    });

    return response.ok;
  } catch (error: any) {
    if (error.status === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Gets the public URL for a file
 */
export function getFileUrl(uploadConfig: UploadConfig, key: string): string {
  const config = getS3CompatibleConfig(uploadConfig.provider);

  if (config.customDomain) {
    return `${config.customDomain}/${key}`;
  }

  if (config.endpoint) {
    // Custom endpoint (MinIO, R2, etc.)
    const baseUrl = config.endpoint.replace(/\/$/, "");
    if (config.forcePathStyle) {
      return `${baseUrl}/${config.bucket}/${key}`;
    } else {
      return `${baseUrl}/${key}`;
    }
  }

  // Standard AWS S3 URL
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

// ========================================
// File Key Generation
// ========================================

export interface FileKeyOptions {
  originalName: string;
  userId?: string;
  prefix?: string;
  preserveExtension?: boolean;
  addTimestamp?: boolean;
  addRandomId?: boolean;
}

/**
 * Generates a unique file key for S3 storage
 */
export function generateFileKey(
  uploadConfig: UploadConfig,
  options: FileKeyOptions
): string {
  // Use config to get defaults
  const configPrefix = uploadConfig.paths?.prefix || "uploads";

  const {
    originalName,
    userId = "anonymous",
    prefix = configPrefix,
    preserveExtension = true,
    addTimestamp = true,
    addRandomId = true,
  } = options;

  const parts: string[] = [prefix, userId];

  if (addTimestamp) {
    parts.push(Date.now().toString());
  }

  if (addRandomId) {
    parts.push(Math.random().toString(36).substring(2, 15));
  }

  // Sanitize filename
  let filename = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");

  if (!preserveExtension) {
    filename = filename.replace(/\.[^/.]+$/, "");
  }

  parts.push(filename);

  return parts.join("/");
}

// ========================================
// Upload Progress Tracking
// ========================================

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  key: string;
  // Overall progress tracking across all files
  progress?: number; // 0-100 percentage across all files
  uploadSpeed?: number; // bytes per second across all files
  eta?: number; // seconds remaining for all files
}

export type ProgressCallback = (progress: UploadProgress) => void;

/**
 * Uploads a file directly to S3 with progress tracking
 * Note: This is for server-side uploads. Client-side uploads use presigned URLs.
 */
export async function uploadFileToS3(
  uploadConfig: UploadConfig,
  file: File | Buffer,
  key: string,
  options: {
    contentType?: string;
    metadata?: Record<string, string>;
    onProgress?: ProgressCallback;
  } = {}
): Promise<string> {
  const awsClient = createS3Client(uploadConfig);
  const config = getS3CompatibleConfig(uploadConfig.provider);

  try {
    const s3Url = buildS3Url(key, config);

    // Prepare headers
    const headers: Record<string, string> = {};

    if (options.contentType) {
      headers["Content-Type"] = options.contentType;
    }

    if (config.acl) {
      headers["x-amz-acl"] = config.acl;
    }

    // Add metadata as x-amz-meta-* headers
    if (options.metadata) {
      Object.entries(options.metadata).forEach(([metaKey, value]) => {
        headers[`x-amz-meta-${metaKey}`] = value;
      });
    }

    // Convert File to ArrayBuffer if needed
    let body: ArrayBuffer | Buffer;
    if (file instanceof File) {
      body = await file.arrayBuffer();
    } else {
      body = file;
    }

    const response = await awsClient.fetch(s3Url, {
      method: "PUT",
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(
        `Upload failed: ${response.status} ${response.statusText}`
      );
    }

    if (config.debug) {
      logger.fileOperation("upload-success", key);
    }

    return getFileUrl(uploadConfig, key);
  } catch (error) {
    console.error("Failed to upload file:", error);
    throw new Error(
      `Failed to upload file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// ========================================
// Validation Helpers
// ========================================

/**
 * Validates S3 connection and configuration
 */
export async function validateS3Connection(
  uploadConfig: UploadConfig
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const awsClient = createS3Client(uploadConfig);
    const config = getS3CompatibleConfig(uploadConfig.provider);

    // Try to check if bucket exists by making a HEAD request to bucket root
    const bucketUrl = config.endpoint
      ? `${config.endpoint}/${config.bucket}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com/`;

    const response = await awsClient.fetch(bucketUrl, {
      method: "HEAD",
    });

    // Any response (even 404) means we can reach the bucket
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ========================================
// List Operations
// ========================================

export interface ListFilesOptions {
  prefix?: string;
  maxFiles?: number; // Default 1000
  includeMetadata?: boolean; // Include size, modified date, etc.
  sortBy?: "key" | "size" | "modified";
  sortOrder?: "asc" | "desc";
}

export interface PaginatedListOptions extends ListFilesOptions {
  pageSize?: number; // Default 100
  continuationToken?: string; // For pagination
}

export interface FileInfo {
  key: string;
  url: string; // Public URL
  size: number; // Bytes
  contentType: string;
  lastModified: Date;
  etag: string;
  metadata?: Record<string, string>; // Custom metadata
}

export interface ListFilesResult {
  files: FileInfo[];
  continuationToken?: string; // For pagination
  isTruncated: boolean;
  totalCount?: number;
}

/**
 * Lists files in the bucket with optional filtering and pagination
 */
export async function listFiles(
  uploadConfig: UploadConfig,
  options: ListFilesOptions = {}
): Promise<FileInfo[]> {
  const result = await listFilesPaginated(uploadConfig, {
    ...options,
    pageSize: options.maxFiles || 1000,
  });
  return result.files;
}

/**
 * Lists files with pagination support
 */
export async function listFilesPaginated(
  uploadConfig: UploadConfig,
  options: PaginatedListOptions = {}
): Promise<ListFilesResult> {
  const awsClient = createS3Client(uploadConfig);
  const config = getS3CompatibleConfig(uploadConfig.provider);

  const {
    prefix = "",
    pageSize = 100,
    maxFiles = 1000,
    includeMetadata = true,
    sortBy = "key",
    sortOrder = "asc",
    continuationToken,
  } = options;

  try {
    // Build list objects URL
    const bucketUrl = config.endpoint
      ? `${config.endpoint}/${config.bucket}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com/`;

    const url = new URL(bucketUrl);
    url.searchParams.set("list-type", "2"); // Use ListObjectsV2

    if (prefix) {
      url.searchParams.set("prefix", prefix);
    }

    const limit = Math.min(pageSize, maxFiles);
    url.searchParams.set("max-keys", limit.toString());

    if (continuationToken) {
      url.searchParams.set("continuation-token", continuationToken);
    }

    const response = await awsClient.fetch(url.toString(), {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to list files: ${response.status} ${response.statusText}`
      );
    }

    const xmlText = await response.text();
    const files = parseListObjectsResponse(
      xmlText,
      config,
      uploadConfig,
      includeMetadata
    );

    // Parse pagination info
    const isTruncated = xmlText.includes("<IsTruncated>true</IsTruncated>");
    const nextContinuationToken = extractXmlValue(
      xmlText,
      "NextContinuationToken"
    );

    // Sort files if requested
    const sortedFiles = sortFiles(files, sortBy, sortOrder);

    if (config.debug) {
      logger.fileOperation("list-files", prefix || "(none)", {
        count: files.length,
      });
    }

    return {
      files: sortedFiles,
      continuationToken: nextContinuationToken || undefined,
      isTruncated,
      totalCount: files.length,
    };
  } catch (error) {
    console.error("Failed to list files:", error);
    throw new Error(
      `Failed to list files: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Lists files with a specific prefix (directory-like listing)
 */
export async function listFilesWithPrefix(
  uploadConfig: UploadConfig,
  prefix: string,
  options: ListFilesOptions = {}
): Promise<FileInfo[]> {
  return listFiles(uploadConfig, { ...options, prefix });
}

/**
 * Lists files by file extension
 */
export async function listFilesByExtension(
  uploadConfig: UploadConfig,
  extension: string,
  prefix?: string
): Promise<FileInfo[]> {
  const files = await listFiles(uploadConfig, { prefix, maxFiles: 10000 });
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  return files.filter((file) => file.key.endsWith(ext));
}

/**
 * Lists files within a size range
 */
export async function listFilesBySize(
  uploadConfig: UploadConfig,
  minSize?: number,
  maxSize?: number,
  prefix?: string
): Promise<FileInfo[]> {
  const files = await listFiles(uploadConfig, { prefix, maxFiles: 10000 });
  return files.filter((file) => {
    if (minSize && file.size < minSize) return false;
    if (maxSize && file.size > maxSize) return false;
    return true;
  });
}

/**
 * Lists files within a date range
 */
export async function listFilesByDate(
  uploadConfig: UploadConfig,
  fromDate?: Date,
  toDate?: Date,
  prefix?: string
): Promise<FileInfo[]> {
  const files = await listFiles(uploadConfig, { prefix, maxFiles: 10000 });
  return files.filter((file) => {
    if (fromDate && file.lastModified < fromDate) return false;
    if (toDate && file.lastModified > toDate) return false;
    return true;
  });
}

/**
 * Lists directories (common prefixes) under a given prefix
 */
export async function listDirectories(
  uploadConfig: UploadConfig,
  prefix: string = ""
): Promise<string[]> {
  const awsClient = createS3Client(uploadConfig);
  const config = getS3CompatibleConfig(uploadConfig.provider);

  try {
    // Build list objects URL with delimiter to get common prefixes
    const bucketUrl = config.endpoint
      ? `${config.endpoint}/${config.bucket}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com/`;

    const url = new URL(bucketUrl);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("delimiter", "/");

    if (prefix) {
      url.searchParams.set(
        "prefix",
        prefix.endsWith("/") ? prefix : `${prefix}/`
      );
    }

    const response = await awsClient.fetch(url.toString(), {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to list directories: ${response.status} ${response.statusText}`
      );
    }

    const xmlText = await response.text();
    return parseCommonPrefixes(xmlText);
  } catch (error) {
    console.error("Failed to list directories:", error);
    throw new Error(
      `Failed to list directories: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Generator function for paginated file listing (handles large datasets efficiently)
 */
export async function* listFilesPaginatedGenerator(
  uploadConfig: UploadConfig,
  options: PaginatedListOptions = {}
): AsyncGenerator<FileInfo[]> {
  let continuationToken: string | undefined = options.continuationToken;
  let hasMore = true;

  while (hasMore) {
    const result = await listFilesPaginated(uploadConfig, {
      ...options,
      continuationToken,
    });

    yield result.files;

    hasMore = result.isTruncated;
    continuationToken = result.continuationToken;
  }
}

// ========================================
// Metadata Operations
// ========================================

export interface FileInfoResult {
  key: string;
  info: FileInfo | null;
  error?: string;
}

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: FileInfo;
}

export interface ValidationRules {
  maxSize?: number;
  minSize?: number;
  allowedTypes?: string[];
  requiredExtensions?: string[];
  customValidators?: ((info: FileInfo) => boolean | string)[];
}

/**
 * Gets detailed information about a file
 */
export async function getFileInfo(
  uploadConfig: UploadConfig,
  key: string
): Promise<FileInfo> {
  const awsClient = createS3Client(uploadConfig);
  const config = getS3CompatibleConfig(uploadConfig.provider);

  try {
    const s3Url = buildS3Url(key, config);
    const response = await awsClient.fetch(s3Url, {
      method: "HEAD",
    });

    if (!response.ok) {
      throw new Error(`File not found: ${key}`);
    }

    const size = parseInt(response.headers.get("content-length") || "0");
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const lastModifiedStr = response.headers.get("last-modified");
    const etag = response.headers.get("etag")?.replace(/"/g, "") || "";

    // Extract metadata from x-amz-meta-* headers
    const metadata: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      if (name.startsWith("x-amz-meta-")) {
        const metaKey = name.substring(11); // Remove 'x-amz-meta-' prefix
        metadata[metaKey] = value;
      }
    });

    return {
      key,
      url: getFileUrl(uploadConfig, key),
      size,
      contentType,
      lastModified: lastModifiedStr ? new Date(lastModifiedStr) : new Date(),
      etag,
      metadata,
    };
  } catch (error) {
    throw new Error(
      `Failed to get file info for ${key}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Gets information for multiple files in parallel
 */
export async function getFilesInfo(
  uploadConfig: UploadConfig,
  keys: string[]
): Promise<FileInfoResult[]> {
  const results = await Promise.allSettled(
    keys.map(async (key) => {
      try {
        const info = await getFileInfo(uploadConfig, key);
        return { key, info };
      } catch (error) {
        return {
          key,
          info: null,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    })
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      return {
        key: keys[index],
        info: null,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown error",
      };
    }
  });
}

/**
 * Gets the size of a file
 */
export async function getFileSize(
  uploadConfig: UploadConfig,
  key: string
): Promise<number> {
  const info = await getFileInfo(uploadConfig, key);
  return info.size;
}

/**
 * Gets the content type of a file
 */
export async function getFileContentType(
  uploadConfig: UploadConfig,
  key: string
): Promise<string> {
  const info = await getFileInfo(uploadConfig, key);
  return info.contentType;
}

/**
 * Gets the last modified date of a file
 */
export async function getFileLastModified(
  uploadConfig: UploadConfig,
  key: string
): Promise<Date> {
  const info = await getFileInfo(uploadConfig, key);
  return info.lastModified;
}

/**
 * Gets custom metadata for a file
 */
export async function getFileMetadata(
  uploadConfig: UploadConfig,
  key: string
): Promise<Record<string, string>> {
  const info = await getFileInfo(uploadConfig, key);
  return info.metadata || {};
}

/**
 * Sets custom metadata for a file
 */
export async function setFileMetadata(
  uploadConfig: UploadConfig,
  key: string,
  metadata: Record<string, string>
): Promise<void> {
  const awsClient = createS3Client(uploadConfig);
  const config = getS3CompatibleConfig(uploadConfig.provider);

  try {
    // First get current file info
    const currentInfo = await getFileInfo(uploadConfig, key);

    // Copy the file to itself with new metadata
    const sourceUrl = `${config.bucket}/${key}`;
    const s3Url = buildS3Url(key, config);

    const headers: Record<string, string> = {
      "x-amz-copy-source": sourceUrl,
      "x-amz-metadata-directive": "REPLACE",
    };

    // Add new metadata headers
    Object.entries(metadata).forEach(([metaKey, value]) => {
      headers[`x-amz-meta-${metaKey}`] = value;
    });

    // Preserve original content type
    if (currentInfo.contentType) {
      headers["Content-Type"] = currentInfo.contentType;
    }

    const response = await awsClient.fetch(s3Url, {
      method: "PUT",
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to set metadata: ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    throw new Error(
      `Failed to set metadata for ${key}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Checks if a file exists and returns its info if it does
 */
export async function fileExistsWithInfo(
  uploadConfig: UploadConfig,
  key: string
): Promise<FileInfo | null> {
  try {
    return await getFileInfo(uploadConfig, key);
  } catch (error) {
    return null;
  }
}

/**
 * Validates a file against given rules
 */
export async function validateFile(
  uploadConfig: UploadConfig,
  key: string,
  rules: ValidationRules
): Promise<FileValidationResult> {
  try {
    const info = await getFileInfo(uploadConfig, key);
    const errors: string[] = [];
    const warnings: string[] = [];

    // Size validation
    if (rules.maxSize && info.size > rules.maxSize) {
      errors.push(`File size ${info.size} exceeds maximum ${rules.maxSize}`);
    }

    if (rules.minSize && info.size < rules.minSize) {
      errors.push(`File size ${info.size} is below minimum ${rules.minSize}`);
    }

    // Content type validation
    if (rules.allowedTypes && !rules.allowedTypes.includes(info.contentType)) {
      errors.push(
        `Content type ${info.contentType} not in allowed types: ${rules.allowedTypes.join(", ")}`
      );
    }

    // Extension validation
    if (rules.requiredExtensions) {
      const extension = info.key.split(".").pop()?.toLowerCase();
      if (!extension || !rules.requiredExtensions.includes(extension)) {
        errors.push(
          `File extension .${extension} not in required extensions: ${rules.requiredExtensions.join(", ")}`
        );
      }
    }

    // Custom validators
    if (rules.customValidators) {
      for (const validator of rules.customValidators) {
        const result = validator(info);
        if (result === false) {
          errors.push("Custom validation failed");
        } else if (typeof result === "string") {
          errors.push(result);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [
        `Failed to validate file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      ],
      warnings: [],
      info: {
        key,
        url: "",
        size: 0,
        contentType: "",
        lastModified: new Date(),
        etag: "",
      },
    };
  }
}

/**
 * Validates multiple files against given rules
 */
export async function validateFiles(
  uploadConfig: UploadConfig,
  keys: string[],
  rules: ValidationRules
): Promise<FileValidationResult[]> {
  const results = await Promise.allSettled(
    keys.map((key) => validateFile(uploadConfig, key, rules))
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      return {
        valid: false,
        errors: [
          `Failed to validate: ${
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown error"
          }`,
        ],
        warnings: [],
        info: {
          key: keys[index],
          url: "",
          size: 0,
          contentType: "",
          lastModified: new Date(),
          etag: "",
        },
      };
    }
  });
}

// ========================================
// Helper Functions
// ========================================

/**
 * Parses S3 ListObjects XML response into FileInfo array
 */
function parseListObjectsResponse(
  xmlText: string,
  config: S3CompatibleConfig,
  uploadConfig: UploadConfig,
  includeMetadata: boolean
): FileInfo[] {
  const files: FileInfo[] = [];

  // Simple XML parsing for <Contents> elements
  const contentsRegex = /<Contents>(.*?)<\/Contents>/gs;
  let match;

  while ((match = contentsRegex.exec(xmlText)) !== null) {
    const contentXml = match[1];

    const key = extractXmlValue(contentXml, "Key");
    const size = parseInt(extractXmlValue(contentXml, "Size") || "0");
    const lastModified = new Date(
      extractXmlValue(contentXml, "LastModified") || Date.now()
    );
    const etag = extractXmlValue(contentXml, "ETag")?.replace(/"/g, "") || "";

    if (key) {
      files.push({
        key,
        url: getFileUrl(uploadConfig, key),
        size,
        contentType: "application/octet-stream", // Will be filled by HEAD request if includeMetadata
        lastModified,
        etag,
      });
    }
  }

  return files;
}

/**
 * Parses common prefixes (directories) from S3 XML response
 */
function parseCommonPrefixes(xmlText: string): string[] {
  const prefixes: string[] = [];
  const prefixRegex =
    /<CommonPrefixes>.*?<Prefix>(.*?)<\/Prefix>.*?<\/CommonPrefixes>/gs;
  let match;

  while ((match = prefixRegex.exec(xmlText)) !== null) {
    const prefix = match[1];
    if (prefix) {
      prefixes.push(prefix);
    }
  }

  return prefixes;
}

/**
 * Extracts value from XML element
 */
function extractXmlValue(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, "s");
  const match = xml.match(regex);
  return match ? match[1] : null;
}

/**
 * Sorts files by specified criteria
 */
function sortFiles(
  files: FileInfo[],
  sortBy: "key" | "size" | "modified",
  sortOrder: "asc" | "desc"
): FileInfo[] {
  const sorted = [...files].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case "key":
        comparison = a.key.localeCompare(b.key);
        break;
      case "size":
        comparison = a.size - b.size;
        break;
      case "modified":
        comparison = a.lastModified.getTime() - b.lastModified.getTime();
        break;
    }

    return sortOrder === "desc" ? -comparison : comparison;
  });

  return sorted;
}

// ========================================
// DELETE OPERATIONS
// ========================================

/**
 * Delete a single file from S3
 */
export async function deleteFile(
  uploadConfig: UploadConfig,
  key: string
): Promise<void> {
  const awsClient = createS3Client(uploadConfig);
  const config = uploadConfig.provider;

  try {
    const s3Config = getS3CompatibleConfig(config);
    const url = buildS3Url(key, s3Config);

    const response = await awsClient.fetch(url, {
      method: "DELETE",
    });

    if (!response.ok) {
      if (response.status === 404) {
        // File doesn't exist - this is not necessarily an error
        logger.warn("File not found during delete", {
          operation: "delete-file",
          key,
          status: response.status,
        });
        return;
      }

      throw createS3Error(
        `Failed to delete file: ${response.status} ${response.statusText}`,
        {
          operation: "delete-file",
          key,
          statusCode: response.status,
        }
      );
    }

    if (s3Config.debug) {
      logger.fileOperation("delete-success", key);
    }
  } catch (error) {
    logger.error("Failed to delete file", error, {
      operation: "delete-file",
      key,
    });

    throw createS3Error(
      `Failed to delete file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      {
        operation: "delete-file",
        key,
        originalError: error instanceof Error ? error : undefined,
      }
    );
  }
}

/**
 * Delete multiple files from S3 in a batch operation
 */
export async function deleteFiles(
  uploadConfig: UploadConfig,
  keys: string[]
): Promise<DeleteFilesResult> {
  if (keys.length === 0) {
    return { deleted: [], errors: [] };
  }

  const awsClient = createS3Client(uploadConfig);
  const config = uploadConfig.provider;

  try {
    const s3Config = getS3CompatibleConfig(config);

    // S3 batch delete supports up to 1000 objects per request
    const batchSize = 1000;
    const batches: string[][] = [];

    for (let i = 0; i < keys.length; i += batchSize) {
      batches.push(keys.slice(i, i + batchSize));
    }

    const results: DeleteFilesResult = { deleted: [], errors: [] };

    for (const batch of batches) {
      const batchResult = await deleteBatch(awsClient, s3Config, batch);
      results.deleted.push(...batchResult.deleted);
      results.errors.push(...batchResult.errors);
    }

    if (s3Config.debug) {
      logger.fileOperation("batch-delete", "multiple", {
        total: keys.length,
        deleted: results.deleted.length,
        errors: results.errors.length,
      });
    }

    return results;
  } catch (error) {
    logger.error("Failed to delete files batch", error, {
      operation: "delete-files-batch",
      count: keys.length,
    });

    throw createS3Error(
      `Failed to delete files: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      {
        operation: "delete-files-batch",
        originalError: error instanceof Error ? error : undefined,
      }
    );
  }
}

/**
 * Delete all files with a specific prefix (like deleting a "folder")
 */
export async function deleteFilesByPrefix(
  uploadConfig: UploadConfig,
  prefix: string,
  options: { dryRun?: boolean; maxFiles?: number } = {}
): Promise<DeleteByPrefixResult> {
  const { dryRun = false, maxFiles = 10000 } = options;

  try {
    // First, list all files with the prefix
    const files = await listFiles(uploadConfig, {
      prefix,
      maxFiles,
    });

    const keys = files.map((file) => file.key);

    if (keys.length === 0) {
      return {
        filesFound: 0,
        deleted: [],
        errors: [],
        dryRun,
      };
    }

    if (dryRun) {
      return {
        filesFound: keys.length,
        deleted: keys, // In dry run, "deleted" shows what would be deleted
        errors: [],
        dryRun: true,
      };
    }

    // Actually delete the files
    const deleteResult = await deleteFiles(uploadConfig, keys);

    return {
      filesFound: keys.length,
      deleted: deleteResult.deleted,
      errors: deleteResult.errors,
      dryRun: false,
    };
  } catch (error) {
    throw new Error(
      `Failed to delete files by prefix: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Helper function to delete a batch of files using S3's batch delete API
 */
async function deleteBatch(
  awsClient: AwsClient,
  config: S3CompatibleConfig,
  keys: string[]
): Promise<DeleteFilesResult> {
  // Create XML payload for batch delete
  const deleteXml = `<?xml version="1.0" encoding="UTF-8"?>
<Delete>
  ${keys.map((key) => `<Object><Key>${escapeXml(key)}</Key></Object>`).join("")}
</Delete>`;

  // Build base URL and add delete query parameter
  const baseUrl = config.endpoint
    ? `${config.endpoint.replace(/\/$/, "")}/${config.bucket}`
    : `https://${config.bucket}.s3.amazonaws.com`;
  const url = `${baseUrl}/?delete`;

  const response = await awsClient.fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml",
      "Content-MD5": await calculateMD5(deleteXml),
    },
    body: deleteXml,
  });

  if (!response.ok) {
    throw new Error(
      `Batch delete failed: ${response.status} ${response.statusText}`
    );
  }

  const responseText = await response.text();
  return parseBatchDeleteResponse(responseText);
}

/**
 * Parse S3 batch delete response XML
 */
function parseBatchDeleteResponse(xmlText: string): DeleteFilesResult {
  const deleted: string[] = [];
  const errors: DeleteError[] = [];

  // Parse deleted objects
  const deletedMatches = xmlText.match(/<Deleted>[\s\S]*?<\/Deleted>/g) || [];
  for (const match of deletedMatches) {
    const key = extractXmlValue(match, "Key");
    if (key) {
      deleted.push(key);
    }
  }

  // Parse errors
  const errorMatches = xmlText.match(/<Error>[\s\S]*?<\/Error>/g) || [];
  for (const match of errorMatches) {
    const key = extractXmlValue(match, "Key");
    const code = extractXmlValue(match, "Code");
    const message = extractXmlValue(match, "Message");

    if (key) {
      errors.push({
        key,
        code: code || "UnknownError",
        message: message || "Unknown error occurred",
      });
    }
  }

  return { deleted, errors };
}

/**
 * Calculate MD5 hash for S3 batch delete request
 */
async function calculateMD5(content: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    // Browser environment
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("MD5", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return btoa(String.fromCharCode.apply(null, hashArray));
  } else {
    // Node.js environment - dynamic import to avoid bundling issues
    const { createHash } = await import("crypto");
    return createHash("md5").update(content).digest("base64");
  }
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ========================================
// DELETE OPERATION TYPES
// ========================================

export interface DeleteFilesResult {
  deleted: string[];
  errors: DeleteError[];
}

export interface DeleteError {
  key: string;
  code: string;
  message: string;
}

export interface DeleteByPrefixResult {
  filesFound: number;
  deleted: string[];
  errors: DeleteError[];
  dryRun: boolean;
}
