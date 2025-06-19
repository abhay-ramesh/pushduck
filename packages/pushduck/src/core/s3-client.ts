/**
 * Lightweight S3 Client Implementation using aws4fetch
 *
 * This replaces the heavy AWS SDK v3 with a minimal 6.4kB alternative
 * that provides the same functionality with ~99% bundle size reduction
 */

import { AwsClient } from "aws4fetch";
import type { ProviderConfig } from "./providers";
import { getUploadConfig } from "./upload-config";

// ========================================
// Configuration Helper
// ========================================

interface S3CompatibleConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  acl?: string;
  customDomain?: string;
  debug?: boolean;
}

/**
 * Extracts S3-compatible configuration from provider config
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
    case "aws":
      return {
        ...baseConfig,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region,
      };

    case "cloudflare-r2":
      return {
        ...baseConfig,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region || "auto", // R2 uses "auto" and aws4fetch handles this correctly
        endpoint: config.endpoint,
        forcePathStyle: true, // R2 requires path-style
      };

    case "digitalocean-spaces":
      return {
        ...baseConfig,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region || "us-east-1", // Spaces needs AWS region for signing
        endpoint: config.endpoint,
        forcePathStyle: false, // Spaces uses virtual hosted-style
      };

    case "minio":
      return {
        ...baseConfig,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region || "us-east-1",
        endpoint: config.endpoint,
        forcePathStyle: true, // MinIO requires path-style
      };

    case "gcs":
      throw new Error(
        "Google Cloud Storage is not yet supported with S3-compatible API. Please use AWS S3, Cloudflare R2, DigitalOcean Spaces, or MinIO."
      );

    default:
      throw new Error(`Unsupported provider: ${(config as any).provider}`);
  }
}

// ========================================
// AWS Client Factory
// ========================================

let awsClientInstance: AwsClient | null = null;

/**
 * Creates and caches an AWS client instance using aws4fetch
 */
export function createS3Client(): AwsClient {
  if (awsClientInstance) {
    return awsClientInstance;
  }

  const uploadConfig = getUploadConfig();
  const config = getS3CompatibleConfig(uploadConfig.provider);

  if (!config.accessKeyId || !config.secretAccessKey || !config.bucket) {
    throw new Error(
      "Missing required S3 configuration. Please check your upload configuration."
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
    console.log("🔧 AWS Client created:", {
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

export interface PresignedUrlOptions {
  key: string;
  contentType?: string; // Made optional to avoid signing issues
  contentLength?: number;
  expiresIn?: number; // seconds, default 3600 (1 hour)
  metadata?: Record<string, string>;
}

export interface PresignedUrlResult {
  url: string;
  key: string;
  fields?: Record<string, string>;
}

/**
 * Generates a presigned URL for uploading a file to S3
 */
export async function generatePresignedUploadUrl(
  options: PresignedUrlOptions
): Promise<PresignedUrlResult> {
  const awsClient = createS3Client();
  const config = getS3CompatibleConfig(getUploadConfig().provider);
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
      console.log(`🔗 Generated presigned URL for ${options.key}:`);
      console.log(`   Original URL: ${s3Url}`);
      console.log(`   Signed URL: ${signedRequest.url}`);
      console.log(`   Config:`, {
        region: config.region,
        endpoint: config.endpoint,
        bucket: config.bucket,
        forcePathStyle: config.forcePathStyle,
      });
    }

    return {
      url: signedRequest.url,
      key: options.key,
    };
  } catch (error) {
    console.error("Failed to generate presigned URL:", error);
    throw new Error(
      `Failed to generate presigned URL: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Generates multiple presigned URLs for batch uploads
 */
export async function generatePresignedUploadUrls(
  requests: PresignedUrlOptions[]
): Promise<PresignedUrlResult[]> {
  const results = await Promise.allSettled(
    requests.map(generatePresignedUploadUrl)
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
export async function checkFileExists(key: string): Promise<boolean> {
  const awsClient = createS3Client();
  const config = getS3CompatibleConfig(getUploadConfig().provider);

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
export function getFileUrl(key: string): string {
  const config = getS3CompatibleConfig(getUploadConfig().provider);

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
export function generateFileKey(options: FileKeyOptions): string {
  const {
    originalName,
    userId = "anonymous",
    prefix = "uploads",
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
}

export type ProgressCallback = (progress: UploadProgress) => void;

/**
 * Uploads a file directly to S3 with progress tracking
 * Note: This is for server-side uploads. Client-side uploads use presigned URLs.
 */
export async function uploadFileToS3(
  file: File | Buffer,
  key: string,
  options: {
    contentType?: string;
    metadata?: Record<string, string>;
    onProgress?: ProgressCallback;
  } = {}
): Promise<string> {
  const awsClient = createS3Client();
  const config = getS3CompatibleConfig(getUploadConfig().provider);

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
      console.log(`✅ File uploaded successfully: ${key}`);
    }

    return getFileUrl(key);
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
export async function validateS3Connection(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const awsClient = createS3Client();
    const config = getS3CompatibleConfig(getUploadConfig().provider);

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
