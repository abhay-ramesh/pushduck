/**
 * Fixed S3 Upload API Route using the new router architecture
 */

import { createS3HandlerV2, s3 } from "next-s3-uploader/server";

// Define upload routes with proper validation and lifecycle hooks
const s3Router = s3.createRouter({
  // Image upload route with size and format validation
  imageUpload: s3
    .image()
    .max("5MB")
    .formats(["jpeg", "jpg", "png", "webp"])
    .middleware(async ({ file, metadata }) => {
      console.log("file", file);
      // Add user context (in real app, get from auth)
      return {
        ...metadata,
        userId: "demo-user",
        uploadedAt: new Date().toISOString(),
      };
    })
    .onUploadStart(async ({ file, metadata }) => {
      console.log(`🚀 Starting upload: ${file.name}`, metadata);
    })
    .onUploadComplete(async ({ file, url }) => {
      console.log(`✅ Upload complete: ${file.name} -> ${url}`);

      // Here you could save to database, send notifications, etc.
      // await db.files.create({
      //   key,
      //   url,
      //   filename: file.name,
      //   size: file.size,
      //   userId: metadata.userId,
      // });
    })
    .onUploadError(async ({ file, error }) => {
      console.error(`❌ Upload failed: ${file.name}`, error);
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
    .middleware(async ({ metadata }) => {
      return {
        ...metadata,
        userId: "demo-user",
        category: "documents",
        uploadedAt: new Date().toISOString(),
      };
    }),
});

// Export router type for client-side usage
export type S3Router = typeof s3Router;

// Export the HTTP handlers
const handlers = createS3HandlerV2(s3Router);
export const { GET, POST } = handlers;
