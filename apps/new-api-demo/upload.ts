/**
 * Upload Configuration for next-s3-uploader Demo
 *
 * This file initializes the upload configuration and exports
 * the configured s3 instance and createS3Handler.
 */

import { initializeUploadConfig, uploadConfig } from "next-s3-uploader/server";

// ========================================
// Types
// ========================================

interface FileInfo {
  name: string;
  type: string;
  size?: number;
}

interface UploadMetadata {
  userId?: string;
  [key: string]: unknown;
}

// ========================================
// Provider Configuration
// ========================================

// Initialize upload configuration and get configured instances
const { s3, createS3Handler, config } = initializeUploadConfig(
  uploadConfig
    .auto() // Auto-detect provider from environment variables
    .defaults({
      maxFileSize: "10MB",
      acl: "public-read", // Make uploaded files publicly accessible
    })
    .security({
      allowedOrigins: ["http://localhost:3000", "https://your-domain.com"],
      rateLimiting: {
        maxUploads: 10,
        windowMs: 60000, // 1 minute
      },
    })
    .hooks({
      onUploadStart: async ({ file, metadata }) => {
        console.log(`🚀 Upload started: ${file.name}`, metadata);
      },
      onUploadComplete: async ({ file, url, metadata }) => {
        console.log(`✅ Upload completed: ${file.name} -> ${url}`, metadata);

        // Here you could:
        // - Save to database
        // - Send notifications
        // - Update analytics
        // - Trigger webhooks
      },
      onUploadError: async ({ file, error, metadata }) => {
        console.error(`❌ Upload failed: ${file.name}`, error, metadata);

        // Here you could:
        // - Log errors to monitoring service
        // - Send error notifications
        // - Update error metrics
      },
    })
    .build()
);

console.log(
  "📦 Upload configuration initialized with provider:",
  config.provider.provider
);

// Export the configured instances - these are bound to the configuration above
export { createS3Handler, s3 };

// Export configuration for debugging/inspection
export { config };

// ========================================
// Alternative Configurations
// ========================================

// For AWS S3:
// export const awsConfig = uploadConfig
//   .aws({
//     region: "us-east-1",
//     bucket: "my-s3-bucket",
//     // accessKeyId and secretAccessKey loaded from AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
//   })
//   .build();

// For DigitalOcean Spaces:
// export const doConfig = uploadConfig
//   .digitalOceanSpaces({
//     region: "nyc3",
//     bucket: "my-spaces-bucket",
//     // accessKeyId and secretAccessKey loaded from DO_SPACES_ACCESS_KEY_ID, DO_SPACES_SECRET_ACCESS_KEY
//   })
//   .build();

// For MinIO:
// export const minioConfig = uploadConfig
//   .minio({
//     endpoint: "localhost:9000",
//     bucket: "my-minio-bucket",
//     useSSL: false,
//     // accessKeyId and secretAccessKey loaded from MINIO_ACCESS_KEY_ID, MINIO_SECRET_ACCESS_KEY
//   })
//   .build();

// Auto-detect from environment:
// export const autoConfig = uploadConfig.auto().build();
