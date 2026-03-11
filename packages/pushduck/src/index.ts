/**
 * pushduck - Client-side exports
 *
 * This file provides all client-side functionality for React components and hooks.
 * Import server-side functionality from 'pushduck/server'
 */

// ========================================
// HOOKS
// ========================================

// Preferred upload hook — hooks should look like hooks
export { useUpload } from "./hooks/use-upload-route";
// Legacy name kept for backward compatibility
export { useUploadRoute } from "./hooks";

// ========================================
// UTILITY FUNCTIONS
// ========================================

// File size and time formatting utilities
export { formatETA, formatUploadSpeed } from "./hooks/use-upload-route";

// ========================================
// TYPES & INTERFACES
// ========================================

// Upload result types
export type {
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3UploadedFile,
} from "./types";

// Client configuration types
export type { ClientConfig } from "./types";

// Router types for type inference
export type {
  InferClientRouter,
  RouterRouteNames,
  S3Router,
  TypedRouteHook,
  // Provider-neutral aliases
  UploadRouter,
  UploadedFile,
  UploadResult,
  RouteNames,
} from "./types";

// ========================================
// CONFIGURATION (Client-safe)
// ========================================

// Provider configurations (for setup reference)
export { createProvider } from "./core/providers";

// Upload configuration utilities
export { createUploadConfig } from "./core/config/upload-config";
