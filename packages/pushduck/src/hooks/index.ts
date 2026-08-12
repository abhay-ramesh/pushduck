/**
 * React Hooks for pushduck
 *
 * This directory contains all client-side React hooks for file uploading.
 * All hooks are marked with "use client" and are safe for browser environments.
 */

// Main upload hook with enhanced type safety
export {
  formatETA,
  formatUploadSpeed,
  useUploadRoute,
} from "./use-upload-route";

// Paste to upload hook
export { usePasteUpload } from "./use-paste-upload";

// Type exports for hooks
export type {
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3UploadedFile,
} from "../types";

// Paste upload types
export type {
  PasteFilePreview,
  UsePasteUploadConfig,
  UsePasteUploadResult,
} from "./use-paste-upload";
