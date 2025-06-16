/**
 * Server-side functionality for next-s3-uploader
 *
 * This directory contains all server-side functionality including
 * routers, handlers, and configuration utilities.
 */

// Router implementation
export { createS3Router } from "./router";

// Re-export from core for backward compatibility
export { createS3Handler } from "../core/router-v2";

// Types
export type { S3Router } from "../types";

export type {
  CompletionResponse,
  PresignedUrlResponse,
  S3FileMetadata,
  UploadCompletion,
} from "./router";
