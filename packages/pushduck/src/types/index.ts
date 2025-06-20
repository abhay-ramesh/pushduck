/**
 * Centralized Type Definitions for pushduck
 *
 * This file consolidates all type definitions to prevent circular dependencies
 * and provide a single source of truth for types used across the library.
 */

// ========================================
// Core Upload Types
// ========================================

export interface S3UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  url?: string;
  key?: string;
  error?: string;
  file?: File;
  // ETA tracking
  uploadStartTime?: number;
  uploadSpeed?: number; // bytes per second
  eta?: number; // seconds remaining
}

export interface S3FileMetadata {
  name: string;
  size: number;
  type: string;
}

export interface S3RouteUploadConfig {
  endpoint?: string;
  onSuccess?: (results: S3UploadedFile[]) => void | Promise<void>;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
}

export interface S3RouteUploadResult {
  files: S3UploadedFile[];
  uploadFiles: (files: File[]) => Promise<void>;
  reset: () => void;
  isUploading: boolean;
  errors: string[];
}

// ========================================
// Router Types
// ========================================

export interface S3Route<TSchema = any, TConstraints = any> {
  schema: TSchema;
  constraints?: TConstraints;
}

// S3Router is imported above and re-exported through usage

// ========================================
// Client Types
// ========================================

export interface ClientConfig {
  endpoint: string;
  fetcher?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
}

// Enhanced upload results with route-specific data
export interface TypedUploadedFile<TOutput = any> extends S3UploadedFile {
  metadata?: TOutput;
  constraints?: {
    maxSize?: string;
    formats?: readonly string[];
    dimensions?: { width?: number; height?: number };
  };
  routeName?: string;
}

// Enhanced hook return with route-specific types
export interface TypedRouteHook<
  TRouter = any,
  TRouteName extends string = string,
> {
  files: TypedUploadedFile[];
  uploadFiles: (files: File[], metadata?: any) => Promise<any[]>;
  reset: () => void;
  isUploading: boolean;
  errors: string[];
  routeName: TRouteName;
}

// ========================================
// Template Literal Types
// ========================================

// Import S3Router type before using it
import type { S3Router } from "../core/router/router-v2";

// Re-export for external use
export type { S3Router };

// Extract route names as string literal union
export type RouterRouteNames<T> =
  T extends S3Router<infer TRoutes> ? keyof TRoutes : never;

// Infer complete client interface from server router
// Each route property returns a hook factory function (tRPC pattern)
export type InferClientRouter<T> =
  T extends S3Router<infer TRoutes>
    ? {
        readonly [K in keyof TRoutes]: () => TypedRouteHook<
          T,
          K extends string ? K : string
        >;
      }
    : never;

// Legacy types removed - use TypedRouteHook and ClientConfig instead
