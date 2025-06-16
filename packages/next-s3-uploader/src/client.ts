/**
 * next-s3-uploader - Client-side exports
 *
 * This file provides all client-side functionality for React components and hooks.
 * Import server-side functionality from 'next-s3-uploader/server'
 */

// ========================================
// ENHANCED CLIENT
// ========================================

// Property-based client with enhanced type inference
export { createUploadClient } from "./client/upload-client";

// ========================================
// HOOKS
// ========================================

// Main upload hook
export { useUploadRoute } from "./hooks";

// ========================================
// UTILITY FUNCTIONS
// ========================================

// File size and time formatting utilities
export { formatETA, formatUploadSpeed } from "./hooks/use-upload-route";

// ========================================
// CLIENT-SAFE TYPES (EXISTING)
// ========================================

export type {
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3UploadedFile,
} from "./types";

// ========================================
// ENHANCED TYPES
// ========================================

// Type-safe client types
export type {
  ClientConfig,
  InferClientRouter,
  RouterRouteNames,
  S3Router,
  TypedRouteHook,
  TypedUploadedFile,
} from "./types";
