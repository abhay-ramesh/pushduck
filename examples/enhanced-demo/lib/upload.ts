/**
 * Upload Configuration for pushduck Demo
 *
 * This file configures the upload client and exports the configured instances.
 * Now simplified - no wrapper function needed! Just call uploadConfig.build()
 * and destructure { s3, createS3Handler, config } directly.
 */

import { uploadConfig } from "pushduck/server";

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

// Configure and initialize upload client directly
const { s3, createS3Handler, config } = uploadConfig
  .cloudflareR2({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: "auto",
    endpoint: process.env.AWS_ENDPOINT_URL,
    bucket: process.env.S3_BUCKET_NAME,
    accountId: process.env.R2_ACCOUNT_ID,
  })
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
  .build();

console.log(
  "📦 Upload configuration initialized with provider:",
  config.provider.provider
);

// Export the configured instances - these are bound to the configuration above
export { createS3Handler, s3 };

// ========================================
// Alternative Configurations
// ========================================

// For AWS S3:
// const { s3: awsS3, createS3Handler: awsHandler, config: awsConfig } = uploadConfig
//   .aws({
//     region: "us-east-1",
//     bucket: "my-s3-bucket",
//     // accessKeyId and secretAccessKey loaded from AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
//   })
//   .build();

// For DigitalOcean Spaces:
// const { s3: doS3, createS3Handler: doHandler, config: doConfig } = uploadConfig
//   .digitalOceanSpaces({
//     region: "nyc3",
//     bucket: "my-spaces-bucket",
//     // accessKeyId and secretAccessKey loaded from DO_SPACES_ACCESS_KEY_ID, DO_SPACES_SECRET_ACCESS_KEY
//   })
//   .build();

// For MinIO:
// const { s3: minioS3, createS3Handler: minioHandler, config: minioConfig } = uploadConfig
//   .minio({
//     endpoint: "localhost:9000",
//     bucket: "my-minio-bucket",
//     useSSL: false,
//     // accessKeyId and secretAccessKey loaded from MINIO_ACCESS_KEY_ID, MINIO_SECRET_ACCESS_KEY
//   })
//   .build();
