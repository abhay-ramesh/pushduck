/**
 * Enhanced Upload Client with Property-Based Access
 *
 * This provides type-safe upload functionality with enhanced developer experience.
 */

import type { AppUploadRouter } from "@/app/api/upload/route";
import { createUploadClient } from "pushduck/client";

/**
 * Type-safe upload client with property-based access
 *
 * Usage:
 * const { uploadFiles, files, isUploading, reset } = upload.imageUpload();
 * const { uploadFiles, files, isUploading, reset } = upload.fileUpload();
 */
export const upload = createUploadClient<AppUploadRouter>({
  endpoint: "/api/upload",
});

// Export types for manual usage
export type { AppUploadRouter };
