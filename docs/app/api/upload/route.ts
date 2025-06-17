import { s3, createS3Handler } from "@/lib/upload-config";

// Define upload routes with proper validation and lifecycle hooks  
const uploadRouter = s3.createRouter({
  // Image upload route with size and format validation
  imageUpload: s3
    .image()
    .max("5MB")
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
      console.log(`✅ Image upload complete: ${file.name} -> ${url}`, metadata);
    }),

  // File upload route  
  fileUpload: s3
    .file()
    .max("10MB")
    .types([
      "application/pdf",
      "application/msword", 
      "text/plain",
      "image/*"
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
      console.log(`✅ File upload complete: ${file.name} -> ${url}`, metadata);
    }),
});

// Export router type for enhanced client type inference
export type AppUploadRouter = typeof uploadRouter;

// Export the HTTP handlers
export const { GET, POST } = createS3Handler(uploadRouter);
