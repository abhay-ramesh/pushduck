/**
 * S3 Upload API Route
 *
 * This route uses the s3 instance from upload.ts
 * which automatically includes the configured provider and settings.
 */

import { s3 } from "@/lib/upload";

// Define upload routes with simple, clear path configuration
const s3Router = s3.createRouter({
  // Image uploads: uploads/images/{userId}/{timestamp}/{randomId}/filename.jpg
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
    .paths({
      // Simple: just add "images" folder under global prefix
      // Result: uploads/images/{userId}/{timestamp}/{randomId}/filename.jpg
      prefix: "images",
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

  // Document uploads: uploads/documents/{userId}/{timestamp}/{randomId}/filename.pdf
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
    .paths({
      // Simple: just add "documents" folder under global prefix
      // Result: uploads/documents/{userId}/{timestamp}/{randomId}/filename.pdf
      prefix: "documents",
    })
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(`✅ Document uploaded: ${file.name} -> ${url}`);
    }),

  // Custom organized images: uploads/gallery/2024/06/demo-user/filename.jpg
  galleryUpload: s3
    .image()
    .max("5MB")
    .formats(["jpeg", "jpg", "png", "webp"])
    .middleware(async ({ file, metadata }) => {
      return {
        ...metadata,
        userId: "demo-user",
        category: "gallery",
      };
    })
    .paths({
      // Custom organization with date-based structure
      generateKey: (ctx) => {
        const { file, metadata, globalConfig } = ctx;
        const globalPrefix = globalConfig.prefix || "uploads";
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const userId = metadata.userId || "anonymous";

        // Custom path: uploads/gallery/2024/06/demo-user/filename.jpg
        return `${globalPrefix}/gallery/${year}/${month}/${userId}/${file.name}`;
      },
    })
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(`✅ Gallery image uploaded: ${file.name} -> ${url}`);
    }),

  // General uploads: uploads/{userId}/{timestamp}/{randomId}/filename.ext
  // Uses pure global configuration - no route-level paths
  generalUpload: s3
    .file()
    .max("20MB")
    .middleware(async ({ file, metadata }) => {
      return {
        ...metadata,
        userId: "demo-user",
        category: "general",
      };
    })
    // No .paths() - uses global configuration only
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(`✅ General file uploaded: ${file.name} -> ${url}`);
    }),
});

// Export router type for client-side usage
export type AppS3Router = typeof s3Router;

// Export the HTTP handlers
export const { GET, POST } = s3Router.handlers;
