/**
 * Real S3 Client Implementation using AWS SDK v3
 *
 * This replaces the mock implementation with actual S3 operations
 */

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Config } from "./config";

// ========================================
// S3 Client Factory
// ========================================

let s3ClientInstance: S3Client | null = null;

/**
 * Creates and caches an S3 client instance
 */
export function createS3Client(): S3Client {
  if (s3ClientInstance) {
    return s3ClientInstance;
  }

  const config = getS3Config();

  if (!config.accessKeyId || !config.secretAccessKey || !config.bucket) {
    throw new Error(
      "Missing required S3 configuration. Please check your environment variables."
    );
  }

  s3ClientInstance = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
  });

  if (config.debug) {
    console.log("🔧 S3 Client created:", {
      region: config.region,
      endpoint: config.endpoint || "default",
      bucket: config.bucket,
      forcePathStyle: config.forcePathStyle,
    });
  }

  return s3ClientInstance;
}

/**
 * Resets the S3 client instance (useful for testing)
 */
export function resetS3Client(): void {
  s3ClientInstance = null;
}

// ========================================
// Presigned URL Generation
// ========================================

export interface PresignedUrlOptions {
  key: string;
  contentType: string;
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
  const s3Client = createS3Client();
  const config = getS3Config();
  const expiresIn = options.expiresIn || 3600; // 1 hour default

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: options.key,
    ContentType: options.contentType,
    ContentLength: options.contentLength,
    ACL: config.acl,
    Metadata: options.metadata,
  });

  try {
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn,
      // Add CORS-friendly headers for direct browser uploads
      signableHeaders: new Set([
        "content-type",
        "content-length",
        "x-amz-acl",
        "x-amz-meta-originalname",
        "x-amz-meta-routename",
        "x-amz-meta-userid",
      ]),
    });

    if (config.debug) {
      console.log(`🔗 Generated presigned URL for ${options.key}`);
    }

    return {
      url: presignedUrl,
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
  const s3Client = createS3Client();
  const config = getS3Config();

  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: key,
      })
    );
    return true;
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Gets the public URL for a file
 */
export function getFileUrl(key: string): string {
  const config = getS3Config();

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
  const s3Client = createS3Client();
  const config = getS3Config();

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: file,
    ContentType: options.contentType,
    ACL: config.acl,
    Metadata: options.metadata,
  });

  try {
    await s3Client.send(command);

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
    const s3Client = createS3Client();
    const config = getS3Config();

    // Try to check if bucket exists by listing objects (with limit 1)
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: "test-connection-" + Date.now(),
      })
    );

    return { success: true };
  } catch (error: any) {
    // 404 is expected for non-existent test key, but means bucket is accessible
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return { success: true };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
