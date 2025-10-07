/**
 * Enhanced Upload Client with Property-Based Access
 *
 * This implements enhanced property-based access pattern with per-route configuration
 * and client-side metadata support:
 *
 * const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
 *
 * // Simple usage (unchanged)
 * const { uploadFiles } = upload.imageUpload();
 *
 * // With per-route configuration
 * const { uploadFiles } = upload.imageUpload({
 *   onSuccess: (results) => console.log('Success!', results),
 *   onError: (error) => console.error('Error:', error),
 *   onProgress: (progress) => console.log('Progress:', progress)
 * });
 *
 * // With client-side metadata (new!)
 * await uploadFiles(files, {
 *   albumId: selectedAlbum.id,
 *   tags: ['vacation', 'summer'],
 *   visibility: 'private'
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
 * Create a type-safe upload client with property-based access, per-route configuration,
 * and client-side metadata support.
 *
 * Following tRPC pattern, each route returns a hook factory function that accepts optional configuration.
 * This ensures React's rules of hooks are followed while maintaining type safety and flexibility.
 *
 * @template TRouter - The S3Router type from your server configuration
 * @param config - Client configuration with endpoint and optional defaults
 * @returns Type-safe client with property-based route access
 *
 * @example Basic usage
 * ```typescript
 * const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
 *
 * // Simple usage
 * const { uploadFiles, files } = upload.imageUpload();
 * await uploadFiles(selectedFiles);
 * ```
 *
 * @example With per-route callbacks
 * ```typescript
 * const { uploadFiles, files } = upload.imageUpload({
 *   onSuccess: (results) => console.log('Upload successful!', results),
 *   onError: (error) => console.error('Upload failed:', error),
 *   onProgress: (progress) => setProgress(progress)
 * });
 * ```
 *
 * @example With client-side metadata
 * ```typescript
 * const { uploadFiles } = upload.imageUpload();
 *
 * // Pass UI context as metadata
 * await uploadFiles(selectedFiles, {
 *   albumId: selectedAlbum.id,
 *   tags: ['vacation', 'beach'],
 *   visibility: 'private',
 *   category: 'travel'
 * });
 * ```
 *
 * @example Combined: callbacks + metadata
 * ```typescript
 * const { uploadFiles } = upload.productImages({
 *   onSuccess: (results) => {
 *     console.log('Product images uploaded:', results);
 *     updateProductGallery(results);
 *   }
 * });
 *
 * await uploadFiles(imageFiles, {
 *   productId: product.id,
 *   variantId: variant.id,
 *   imageType: 'gallery',
 *   sortOrder: existingImages.length + 1
 * });
 * ```
 *
 * @example With different endpoint
 * ```typescript
 * const { uploadFiles } = upload.secureUpload({
 *   endpoint: '/api/secure-upload',
 *   onSuccess: handleSecureUpload
 * });
 * ```
 *
 * @see {@link https://pushduck.dev/docs/api/client/create-upload-client} for complete documentation
 * @see {@link https://pushduck.dev/docs/guides/advanced/client-metadata} for metadata guide
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
