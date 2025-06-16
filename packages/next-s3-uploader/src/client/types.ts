/**
 * Enhanced Type Definitions for Client-Side Type Inference
 */

import type { S3UploadedFile } from "../core/route-hooks-v2";
import type { S3Router } from "../core/router-v2";

// ========================================
// Template Literal Types
// ========================================

// Extract route names as string literal union
export type RouterRouteNames<T> =
  T extends S3Router<infer TRoutes> ? keyof TRoutes : never;

// ========================================
// Client Configuration
// ========================================

export interface ClientConfig {
  endpoint: string;
  fetcher?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
}

// ========================================
// Enhanced Upload Result Types
// ========================================

// Type-safe upload results with route-specific data
export interface TypedUploadedFile<TOutput = any> extends S3UploadedFile {
  metadata?: TOutput;
  constraints?: {
    maxSize?: string;
    formats?: readonly string[];
    dimensions?: { width?: number; height?: number };
  };
  routeName?: string;
}

// ========================================
// Enhanced Hook Types
// ========================================

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
// Client Router Type Inference
// ========================================

// Infer complete client interface from server router - only known routes allowed
export type InferClientRouter<T> =
  T extends S3Router<infer TRoutes>
    ? {
        readonly [K in keyof TRoutes]: TypedRouteHook<
          T,
          K extends string ? K : string
        >;
      }
    : never;

// ========================================
// Constraint Inference (Future Enhancement) - Removed unused type
// ========================================
