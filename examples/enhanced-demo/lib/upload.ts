/**
 * Upload Configuration for pushduck Demo
 *
 * This file configures the upload client and exports the configured instances.
 * Now simplified - no wrapper function needed! Just call createUploadConfig().build()
 * and destructure { s3,  config } directly.
 */

import { createUploadConfig } from "pushduck/server";

// ========================================
// Provider Configuration
// ========================================

// One config for the upload routes and server-side storage calls. The
// provider options are a function, so they are read on the first upload rather
// than when this module is imported — `next build` runs without credentials.
const { s3, config, storage } = createUploadConfig()
  .provider("cloudflareR2", () => ({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: "auto",
    endpoint: process.env.AWS_ENDPOINT_URL,
    bucket: process.env.S3_BUCKET_NAME,
    accountId: process.env.R2_ACCOUNT_ID,
  }))
  .defaults({
    maxFileSize: "10MB",
    acl: "public-read", // Make uploaded files publicly accessible
  })
  .paths({
    // Every key lives under "uploads/". Routes add their own folder and
    // naming with `.paths({ prefix, name })` (see app/api/s3-upload/route.ts).
    prefix: "uploads",
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
      console.log(`Upload started: ${file.name}`, metadata);
    },
    onUploadComplete: async ({ file, url, metadata }) => {
      console.log(`Upload completed: ${file.name} -> ${url}`, metadata);

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
// Path Configuration
// ========================================

// A key is {global prefix}/{route prefix}/{name}. Routes declare the rest:
//
//   .middleware(async ({ req }) => ({ userId: await getUserId(req) }))
//   .paths({
//     prefix: ({ metadata }) => `users/${metadata.userId}`, // typed metadata
//     name: "unique", // "original" (default) | "unique" | (ctx) => string
//   })
//   // → uploads/users/42/photo-k3x9m2a7qp.jpg
//
// Every segment is sanitised and keys that would escape their folder are
// refused, so routes never sanitise filenames or add random ids themselves.

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
//   .paths({ prefix: "aws-uploads" })
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
//   .paths({ prefix: "minio" })
//   .build();
