/**
 * S3 Upload API Route
 *
 * This route uses the s3 instance and createS3Handler from upload.ts
 * which automatically includes the configured provider and settings.
 */

import { createS3Handler, s3 } from "../../../upload";

// Define upload routes with proper validation and lifecycle hooks
const s3Router = s3.createRouter({
  // Image upload route with size and format validation
  imageUpload: s3
    .image()
    .max("5MB")
    .formats(["jpeg", "jpg", "png", "webp"])
    .middleware(async ({ file, metadata }) => {
      console.log("Processing image upload:", file.name);
      // Add user context (in real app, get from auth)
      return {
        ...metadata,
        userId: "demo-user",
        uploadedAt: new Date().toISOString(),
        category: "images",
      };
    })
    .onUploadStart(async ({ file, metadata }) => {
      console.log(`🖼️ Starting image upload: ${file.name}`, metadata);
    })
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(`✅ Image upload complete: ${file.name} -> ${url}`, metadata);

      // Here you could save to database, send notifications, etc.
      // await db.images.create({
      //   key,
      //   url,
      //   filename: file.name,
      //   size: file.size,
      //   userId: metadata.userId,
      //   category: metadata.category,
      // });
    })
    .onUploadError(async ({ file, error }) => {
      console.error(`❌ Image upload failed: ${file.name}`, error);
    }),

  // Document upload route with different validation
  documentUpload: s3
    .file()
    .max("10MB")
    .types([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ])
    .middleware(async ({ file, metadata }) => {
      console.log("Processing document upload:", file.name);
      return {
        ...metadata,
        userId: "demo-user",
        category: "documents",
        uploadedAt: new Date().toISOString(),
      };
    })
    .onUploadStart(async ({ file, metadata }) => {
      console.log(`📄 Starting document upload: ${file.name}`, metadata);
    })
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(
        `✅ Document upload complete: ${file.name} -> ${url}`,
        metadata
      );
    })
    .onUploadError(async ({ file, error }) => {
      console.error(`❌ Document upload failed: ${file.name}`, error);
    }),
});

// Export router type for client-side usage
export type AppS3Router = typeof s3Router;

// Export the HTTP handlers - uses the configuration from upload.ts!
const handlers = createS3Handler(s3Router);
export const { GET, POST } = handlers;
