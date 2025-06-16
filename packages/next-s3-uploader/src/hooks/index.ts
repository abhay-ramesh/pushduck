/**
 * React Hooks for next-s3-uploader
 *
 * This directory contains all client-side React hooks for file uploading.
 * All hooks are marked with "use client" and are safe for browser environments.
 */

// Main upload hook with enhanced type safety
export {
  formatETA,
  formatUploadSpeed,
  useS3RouteUpload,
  useUploadRoute,
} from "./use-upload-route";

// Type exports for hooks
export type {
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3UploadedFile,
} from "../types";
