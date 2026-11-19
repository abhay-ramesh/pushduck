/**
 * S3 Upload API Route
 *
 * This route uses the s3 instance from upload.ts
 * which automatically includes the configured provider and settings.
 */

import { s3 } from "@/lib/upload";

// Define upload routes with simple, clear path configuration
const s3Router = s3.createRouter({
  // Image uploads: uploads/images/{userId}/{name}-{id}.jpg
  imageUpload: s3
    .image()
    .maxFileSize("1MB")
    .accept(["image/jpeg", "image/png", "image/webp"])
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
      // Result: uploads/images/demo-user/photo-k3x9m2a7qp.jpg
      prefix: ({ metadata }) => `images/${metadata.userId}`,
      name: "unique",
    })
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(`Image upload complete: ${file.name} -> ${url}`, metadata);

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

  // Document uploads: uploads/documents/{userId}/{name}-{id}.pdf
  documentUpload: s3
    .file()
    .maxFileSize("10MB")
    .accept([
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
      // Result: uploads/documents/demo-user/report-k3x9m2a7qp.pdf
      prefix: ({ metadata }) => `documents/${metadata.userId}`,
      name: "unique",
    })
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(`Document uploaded: ${file.name} -> ${url}`);
    }),

  // Date-organized images: uploads/gallery/2024/06/demo-user/{name}-{id}.jpg
  galleryUpload: s3
    .image()
    .maxFileSize("5MB")
    .accept(["image/jpeg", "image/png", "image/webp"])
    .middleware(async ({ file, metadata }) => {
      return {
        ...metadata,
        userId: "demo-user",
        category: "gallery",
      };
    })
    .paths({
      prefix: ({ metadata }) => {
        const date = new Date();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        return `gallery/${date.getFullYear()}/${month}/${metadata.userId}`;
      },
      name: "unique",
    })
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(`Gallery image uploaded: ${file.name} -> ${url}`);
    }),

  // General uploads: uploads/general/{userId}/{name}-{id}.ext
  generalUpload: s3
    .file()
    .maxFileSize("20MB")
    .middleware(async ({ file, metadata }) => {
      return {
        ...metadata,
        userId: "demo-user",
        category: "general",
      };
    })
    .paths({ prefix: ({ metadata }) => `general/${metadata.userId}`, name: "unique" })
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(`General file uploaded: ${file.name} -> ${url}`);
    }),
});

// Export router type for client-side usage
export type AppS3Router = typeof s3Router;

// Export the HTTP handlers
export const { GET, POST } = s3Router.handlers;
