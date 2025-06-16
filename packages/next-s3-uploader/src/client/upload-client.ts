/**
 * Enhanced Upload Client with Property-Based Access
 *
 * This implements Option 1: Property-Based Access pattern:
 *
 * const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
 * const { uploadFiles } = upload.imageUpload(); // Note: Now a function call!
 */

"use client";

import { useCallback } from "react";
import { useUploadRoute } from "../hooks/use-upload-route";
import type {
  ClientConfig,
  InferClientRouter,
  S3Router,
  TypedRouteHook,
} from "../types";

// ========================================
// Enhanced Hook Implementation
// ========================================

/**
 * Hook for individual route access (internal)
 */
function useTypedRoute<TRouter extends S3Router<any>>(
  routeName: string,
  config: ClientConfig
): TypedRouteHook<TRouter> {
  const hookResult = useUploadRoute(routeName, { endpoint: config.endpoint });

  const enhancedUploadFiles = useCallback(
    async (files: File[], metadata?: any) => {
      await hookResult.uploadFiles(files);
      return hookResult.files.map((file) => ({
        ...file,
        metadata,
      }));
    },
    [hookResult.uploadFiles, hookResult.files]
  );

  return {
    files: hookResult.files,
    uploadFiles: enhancedUploadFiles,
    reset: hookResult.reset,
    isUploading: hookResult.isUploading,
    errors: hookResult.errors,
    routeName,
  };
}

// ========================================
// Type-Safe Client Factory
// ========================================

/**
 * Create a type-safe upload client with property-based access
 *
 * Following tRPC pattern, each route returns a hook factory function.
 * This ensures React's rules of hooks are followed while maintaining type safety.
 *
 * @example
 * ```typescript
 * const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
 * const { uploadFiles, files } = upload.imageUpload(); // Hook factory function!
 * ```
 */
export function createUploadClient<TRouter extends S3Router<any>>(
  config: ClientConfig
): InferClientRouter<TRouter> {
  return new Proxy({} as any, {
    get(target, prop) {
      if (typeof prop !== "string") {
        throw new Error(
          `Invalid route access: Routes must be strings, got ${typeof prop}`
        );
      }

      // Return a hook factory function (tRPC pattern)
      // This ensures hooks are called consistently on every render
      return () => useTypedRoute<TRouter>(prop, config);
    },

    has(target, prop) {
      return typeof prop === "string";
    },

    ownKeys() {
      // Return empty array since we don't know routes at runtime
      return [];
    },

    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string") {
        return {
          enumerable: true,
          configurable: true,
          get: () => this.get!(target, prop, target),
        };
      }
      return undefined;
    },
  }) as InferClientRouter<TRouter>;
}

// ========================================
// Utility Functions
// ========================================

// Removed unused functions:
// - createUploadClientWithRoutes (unused)
// - getRouterRoutes (unused)
