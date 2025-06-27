/**
 * Upload Configuration for pushduck Demo
 *
 * This file configures the upload client and exports the configured instances.
 * Now simplified - no wrapper function needed! Just call createUploadConfig().build()
 * and destructure { s3,  config } directly.
 */

import { createUploadConfig } from "pushduck/server";

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
const { s3, config, storage } = createUploadConfig()
  .provider("cloudflareR2", {
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
  .paths({
    // Global prefix - forms the base for all uploads
    prefix: "uploads",

    // Global path structure - used when routes don't have custom generateKey
    // This creates the default file organization
    generateKey: (file, metadata) => {
      const userId = metadata.userId || metadata.user?.id || "anonymous";
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");

      // Return ONLY the file path part (no prefix)
      // The hierarchical system will add the prefix and route prefix
      return `${userId}/${timestamp}/${randomId}/${sanitizedName}`;
    },
  })
  .security({
    allowedOrigins: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://your-domain.com",
    ],
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
export { s3, storage };

// ========================================
// Alternative Path Configuration Examples
// ========================================

// Example 1: Simple prefix-only configuration
// .paths({
//   prefix: "user-uploads"
// })
// Result: user-uploads/anonymous/1234567890/abc123/filename.jpg

// Example 2: Date-based organization
// .paths({
//   generateKey: (file, metadata) => {
//     const date = new Date();
//     const year = date.getFullYear();
//     const month = String(date.getMonth() + 1).padStart(2, '0');
//     const day = String(date.getDate()).padStart(2, '0');
//     const userId = metadata.userId || 'anonymous';
//     const randomId = Math.random().toString(36).substring(2, 8);
//
//     return `uploads/${year}/${month}/${day}/${userId}/${randomId}-${file.name}`;
//   }
// })
// Result: uploads/2024/01/20/user123/abc123-filename.jpg

// Example 3: File type organization
// .paths({
//   generateKey: (file, metadata) => {
//     const fileType = file.type.split('/')[0]; // image, video, application, etc.
//     const userId = metadata.userId || 'anonymous';
//     const timestamp = Date.now();
//
//     return `uploads/${fileType}/${userId}/${timestamp}/${file.name}`;
//   }
// })
// Result: uploads/image/user123/1234567890/photo.jpg

// Example 4: Environment-based paths
// .paths({
//   generateKey: (file, metadata) => {
//     const env = process.env.NODE_ENV || 'development';
//     const userId = metadata.userId || 'anonymous';
//     const randomId = Math.random().toString(36).substring(2, 10);
//
//     return `${env}/uploads/${userId}/${randomId}/${file.name}`;
//   }
// })
// Result: production/uploads/user123/abc123def/document.pdf

// ========================================
// Alternative Provider Configurations
// ========================================

// For AWS S3:
// const { s3: awsS3, config: awsConfig } = createUploadConfig()
//   .provider("aws",{
//     region: "us-east-1",
//     bucket: "my-s3-bucket",
//     // accessKeyId and secretAccessKey loaded from AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
//   })
//   .paths({
//     prefix: "aws-uploads",
//     generateKey: (file, metadata) => {
//       return `aws-uploads/${metadata.userId}/${Date.now()}/${file.name}`;
//     }
//   })
//   .build();

// For DigitalOcean Spaces:
// const { s3: doS3, config: doConfig } = createUploadConfig()
//   .provider("digitalOceanSpaces",{
//     region: "nyc3",
//     bucket: "my-spaces-bucket",
//     // accessKeyId and secretAccessKey loaded from DO_SPACES_ACCESS_KEY_ID, DO_SPACES_SECRET_ACCESS_KEY
//   })
//   .paths({
//     prefix: "spaces-uploads"
//   })
//   .build();

// For MinIO:
// const { s3: minioS3, config: minioConfig } = createUploadConfig()
//   .provider("minio",{
//     endpoint: "localhost:9000",
//     bucket: "my-minio-bucket",
//     useSSL: false,
//     // accessKeyId and secretAccessKey loaded from MINIO_ACCESS_KEY_ID, MINIO_SECRET_ACCESS_KEY
//   })
//   .paths({
//     generateKey: (file, metadata) => {
//       // Custom MinIO path structure
//       return `minio/${metadata.project || 'default'}/${file.name}`;
//     }
//   })
//   .build();
