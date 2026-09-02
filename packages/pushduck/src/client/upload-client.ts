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

import { useUploadRoute } from "../hooks/use-upload-route";
import type {
  ClientConfig,
  InferClientRouter,
  S3Router,
  TypedRouteHook,
  UploadAdvancedConfig,
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
  routeOptions?: UploadRouteConfig & UploadAdvancedConfig
): TypedRouteHook<TRouter> {
  /**
   * Delegates wholesale to `useUploadRoute` rather than re-deriving its result.
   *
   * The previous implementation rebuilt the return value field by field, which
   * let it drift: it lacked `cancel`, `cancelAll`, and `uploadFilesAsync`, and
   * its `uploadFiles` resolved with a *stale* file list — React state had not
   * re-rendered yet, so callers received the pre-upload snapshot. Spreading the
   * hook keeps the property-based client and the hook permanently in lockstep.
   */
  const hookResult = useUploadRoute(routeName, {
    /**
     * Merged by spreading rather than field by field.
     *
     * The previous version named six options explicitly, which silently
     * dropped every other one the engine accepts: `transport`, `multipart`,
     * `blobFetcher` and `now`. That made the whole large-file feature set —
     * threshold, resume store, chunk reader — unreachable from the client the
     * documentation leads with, while still type-checking, because
     * `UploadAdvancedConfig` exists precisely so "every binding *and* the
     * property-based client accept an identical options object".
     *
     * Spreading means a new engine option works here the day it is added,
     * instead of the day someone remembers to add a seventh line.
     */
    ...config.defaultOptions,
    ...routeOptions,
    // Resolved last: a route may override the client's endpoint, but an
    // absent route value must not blank it.
    endpoint: routeOptions?.endpoint || config.endpoint,
    fetcher: routeOptions?.fetcher || config.fetcher,
  });

  return { ...hookResult, routeName };
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
 * @see {@link https://pushduck.org/docs/api/client/create-upload-client} for complete documentation
 * @see {@link https://pushduck.org/docs/guides/advanced/client-metadata} for metadata guide
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
      return (routeOptions?: UploadRouteConfig & UploadAdvancedConfig) =>
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
