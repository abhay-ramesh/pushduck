/**
 * Enhanced Upload Client with Property-Based Access
 *
 * This implements enhanced property-based access pattern with per-route configuration:
 *
 * const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
 *
 * // Simple usage (unchanged)
 * const { uploadFiles } = upload.imageUpload();
 *
 * // With per-route configuration (new!)
 * const { uploadFiles } = upload.imageUpload({
 *   onSuccess: (results) => console.log('Success!', results),
 *   onError: (error) => console.error('Error:', error),
 *   onProgress: (progress) => console.log('Progress:', progress)
 * });
 */

"use client";

import { useCallback } from "react";
import { useUploadRoute } from "../hooks/use-upload-route";
import type {
  ClientConfig,
  InferClientRouter,
  S3Router,
  TypedRouteHook,
  UploadRouteConfig,
} from "../types";

// ========================================
// Enhanced Hook Implementation
// ========================================

/**
 * Hook for individual route access with optional per-route configuration
 */
function useTypedRoute<TRouter extends S3Router<any>>(
  routeName: string,
  config: ClientConfig,
  routeOptions?: UploadRouteConfig
): TypedRouteHook<TRouter> {
  // Merge global config with route-specific options
  const mergedConfig: UploadRouteConfig = {
    endpoint: routeOptions?.endpoint || config.endpoint,
    onSuccess: routeOptions?.onSuccess || config.defaultOptions?.onSuccess,
    onError: routeOptions?.onError || config.defaultOptions?.onError,
    onProgress: routeOptions?.onProgress || config.defaultOptions?.onProgress,
  };

  const hookResult = useUploadRoute(routeName, mergedConfig);

  const enhancedUploadFiles = useCallback(
    async (files: File[], metadata?: any) => {
      await hookResult.uploadFiles(files);
      return hookResult.files.map((file) => ({
        ...file,
        metadata,
      }));
    },
    [hookResult.uploadFiles, hookResult.files, routeName]
  );

  return {
    files: hookResult.files,
    uploadFiles: enhancedUploadFiles,
    reset: hookResult.reset,
    isUploading: hookResult.isUploading,
    errors: hookResult.errors,
    routeName,
    progress: hookResult.progress,
    uploadSpeed: hookResult.uploadSpeed,
    eta: hookResult.eta,
  };
}

// ========================================
// Type-Safe Client Factory
// ========================================

/**
 * Create a type-safe upload client with property-based access and per-route configuration
 *
 * Following tRPC pattern, each route returns a hook factory function that accepts optional configuration.
 * This ensures React's rules of hooks are followed while maintaining type safety and flexibility.
 *
 * @example
 * ```typescript
 * const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
 *
 * // Simple usage
 * const { uploadFiles, files } = upload.imageUpload();
 *
 * // With per-route callbacks
 * const { uploadFiles, files } = upload.imageUpload({
 *   onSuccess: (results) => console.log('Upload successful!', results),
 *   onError: (error) => console.error('Upload failed:', error),
 *   onProgress: (progress) => setProgress(progress)
 * });
 *
 * // With different endpoint
 * const { uploadFiles } = upload.secureUpload({
 *   endpoint: '/api/secure-upload',
 *   onSuccess: handleSecureUpload
 * });
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

      // Return a hook factory function that accepts optional route configuration
      // This ensures hooks are called consistently on every render
      return (routeOptions?: UploadRouteConfig) =>
        useTypedRoute<TRouter>(prop, config, routeOptions);
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
