/**
 * Enhanced Upload Client Configuration
 *
 * This demonstrates the structured client approach with both simple
 * and advanced per-route configuration options.
 */

import { createUploadClient } from "pushduck/client";
import type { AppS3Router } from "../app/api/s3-upload/route";

/**
 * Create the typed upload client with global configuration
 *
 * This provides property-based access to upload routes:
 * - upload.imagegUpload() - for image uploads
 * - upload.documentUpload() - for document uploads
 *
 * Features:
 * - Full TypeScript inference from server router
 * - Property-based access (no string literals)
 * - Compile-time type safety
 * - Enhanced IntelliSense support
 */
export const upload = createUploadClient<AppS3Router>({
  endpoint: "/api/s3-upload",

  // Global default options (optional)
  defaultOptions: {
    onProgress: (progress) => {
      console.log(`Global progress: ${progress}%`);
    },
    onError: (error) => {
      console.error("Global error handler:", error);
    },
  },
});

// Export type for components to use
export type TypedUploadedFile = any; // Simplified for now

/**
 * Usage Examples:
 *
 * @example
 * ```typescript
 * // Property-based access with full type safety (hook factory pattern)
 * const { uploadFiles, files, isUploading, errors, reset } = upload.imagegUpload();
 *
 * // Upload files with automatic route inference
 * await uploadFiles(selectedFiles);
 *
 * // Access typed file properties
 * files.map(file => (
 *   <div key={file.id}>
 *     <span>{file.name}</span>
 *     <span>{file.status}</span> // 'pending' | 'uploading' | 'success' | 'error'
 *     <progress value={file.progress} max={100} />
 *   </div>
 * ));
 * ```
 */
