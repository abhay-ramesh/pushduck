import { getPostHogClient } from "@/lib/posthog-server";
import { s3 } from "@/lib/upload";

// Define upload routes with proper validation and lifecycle hooks
const uploadRouter = s3.createRouter({
  // Image upload route with size and format validation
  imageUpload: s3
    .image()
    .maxFileSize("5MB")
    .formats(["jpeg", "jpg", "png", "webp"])
    .middleware(async ({ file, metadata }) => {
      console.log("Processing image upload:", file.name);
      return {
        ...metadata,
        userId: "demo-user", // Replace with actual auth
        uploadedAt: new Date().toISOString(),
        category: "images",
      };
    })
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(`Image upload complete: ${file.name} -> ${url}`, metadata);
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: metadata.userId ?? "anonymous",
        event: "upload_completed_server",
        properties: {
          file_name: file.name,
          file_size_bytes: file.size,
          file_type: file.type,
          category: metadata.category,
          route: "imageUpload",
        },
      });
    }),

  // File upload route
  fileUpload: s3
    .file()
    .maxFileSize("10MB")
    .types([
      "application/pdf",
      "application/msword",
      "text/plain",
      "image/*",
      "video/*",
    ])
    .middleware(async ({ file, metadata }) => {
      console.log("Processing file upload:", file.name);
      return {
        ...metadata,
        userId: "demo-user", // Replace with actual auth
        uploadedAt: new Date().toISOString(),
        category: "documents",
      };
    })
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(`File upload complete: ${file.name} -> ${url}`, metadata);
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: metadata.userId ?? "anonymous",
        event: "upload_completed_server",
        properties: {
          file_name: file.name,
          file_size_bytes: file.size,
          file_type: file.type,
          category: metadata.category,
          route: "fileUpload",
        },
      });
    }),
});

// Export router type for enhanced client type inference
export type AppUploadRouter = typeof uploadRouter;

// Export the HTTP handlers
export const { GET, POST } = uploadRouter.handlers;
