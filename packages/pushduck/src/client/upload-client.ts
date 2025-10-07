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

  /**
   * Enhanced upload function that supports client-side metadata.
   *
   * @param files - Array of files to upload
   * @param metadata - Optional metadata to attach to the upload (client-side context)
   * @returns Promise resolving to array of uploaded files with metadata
   *
   * @remarks
   * Client-provided metadata is passed through to the server and can be accessed
   * in middleware, lifecycle hooks, and path generation functions. This allows
   * passing contextual information like user selections, form data, or UI state.
   *
   * @security
   * ⚠️ IMPORTANT: Client metadata is UNTRUSTED user input.
   * Always validate and sanitize in server-side middleware before use.
   * Never trust client-provided identity claims (userId, role, etc.).
   *
   * @example Basic usage with metadata
   * ```typescript
   * const { uploadFiles } = upload.imageUpload();
   *
   * // Upload with contextual metadata
   * await uploadFiles(selectedFiles, {
   *   albumId: album.id,
   *   tags: ['vacation', 'summer'],
   *   visibility: 'private'
   * });
   * ```
   *
   * @example Server-side validation
   * ```typescript
   * // In your route configuration
   * s3.createRouter({
   *   imageUpload: s3.image()
   *     .middleware(async ({ req, metadata }) => {
   *       const user = await authenticateUser(req);
   *
   *       return {
   *         // Client metadata (untrusted)
   *         albumId: metadata?.albumId,
   *         tags: metadata?.tags || [],
   *
   *         // Server metadata (trusted) - overrides client
   *         userId: user.id,
   *         role: user.role,
   *         uploadedAt: new Date().toISOString()
   *       };
   *     })
   * });
   * ```
   */
  const enhancedUploadFiles = useCallback(
    async (files: File[], metadata?: any) => {
      await hookResult.uploadFiles(files, metadata);
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
