// app/api/s3-upload/route.ts
import { s3 } from "@/lib/upload";

const s3Router = s3.createRouter({
  // Define your upload routes with validation
  imageUpload: s3.image().max("10MB").formats(["jpg", "jpeg", "png", "webp"]),

  documentUpload: s3
    .file()
    .max("50MB")
    .types(["application/pdf", "application/msword"]),
});

export const { GET, POST } = s3Router.handlers;

// Export the router type for client-side type safety
export type Router = typeof s3Router;
