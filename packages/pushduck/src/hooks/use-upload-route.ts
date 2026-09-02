"use client";

/**
 * @fileoverview Modern Upload Route Hook
 *
 * This module provides a React hook for type-safe file upload functionality with
 * route-based configuration. Supports progress tracking, error handling, cancellation,
 * and comprehensive upload state management.
 *
 * ## Implementation note
 *
 * The upload workflow itself lives in `pushduck/core` — a framework-agnostic
 * engine with no React dependency. This hook is a thin binding: it creates an
 * engine and subscribes React to it via `useSyncExternalStore`. The same engine
 * backs the React Native, Vue, Svelte, and vanilla clients, so upload semantics
 * are identical across every framework.
 *
 * @example Basic Usage
 * ```typescript
 * import { useUploadRoute } from 'pushduck/client';
 * import type { AppRouter } from '@/lib/upload';
 *
 * function ImageUploader() {
 *   const { uploadFiles, files, isUploading, progress } = useUploadRoute<AppRouter>('imageUpload');
 *
 *   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const selectedFiles = Array.from(e.target.files || []);
 *     uploadFiles(selectedFiles);
 *   };
 *
 *   return (
 *     <div>
 *       <input type="file" multiple accept="image/*" onChange={handleFileSelect} />
 *       <progress value={progress} max={100} />
 *       {files.map(file => (
 *         <div key={file.id}>
 *           {file.name} - {file.status} ({file.progress}%)
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example Advanced Usage with Callbacks
 * ```typescript
 * const { uploadFiles, files, reset } = useUploadRoute('documentUpload', {
 *   onProgress: (progress) => console.log(`Overall progress: ${progress}%`),
 *   onSuccess: (results) => {
 *     console.log('Upload completed:', results);
 *     // Update UI, show success message, etc.
 *   },
 *   onError: (error) => {
 *     console.error('Upload failed:', error);
 *     // Show error message, retry logic, etc.
 *   },
 * });
 * ```
 */

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import {
  createUploadEngine,
  formatETA,
  formatUploadSpeed,
  settleUpload,
  type UploadClientConfig,
  type UploadFilesResult,
} from "../core/upload";
import type {
  RouterRouteNames,
  S3RouteUploadResult,
  S3Router,
  S3UploadedFile,
  UploadInput,
  UploadRouteConfig,
} from "../types";

// ========================================
// Main Hook Implementation
// ========================================

/**
 * React hook for managing file uploads with type-safe route configuration.
 * Provides comprehensive upload state management, progress tracking, and error handling.
 *
 * @template TRouter - The router type for type-safe route names
 * @param routeName - Name of the upload route (type-safe when TRouter is provided)
 * @param config - Optional configuration for upload behavior and callbacks
 * @returns Upload state and control functions
 *
 * @overload
 * @template TRouter - Router type extending S3Router
 * @param routeName - Type-safe route name from the router
 * @param config - Optional upload configuration
 * @returns Upload result object with type-safe route handling
 *
 * @overload
 * @param routeName - Route name as string (for dynamic usage)
 * @param config - Optional upload configuration
 * @returns Upload result object with standard route handling
 *
 * @example Type-Safe Usage
 * ```typescript
 * import type { AppRouter } from '@/lib/upload';
 *
 * function TypedUploader() {
 *   // TypeScript will validate 'imageUpload' exists in AppRouter
 *   const { uploadFiles, files, isUploading, progress } =
 *     useUploadRoute<AppRouter>('imageUpload', {
 *       onProgress: (progress) => {
 *         console.log(`Upload progress: ${progress}%`);
 *       },
 *       onSuccess: (results) => {
 *         console.log('All uploads completed:', results);
 *       },
 *       onError: (error) => {
 *         console.error('Upload error:', error);
 *       },
 *     });
 *
 *   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const files = Array.from(e.target.files || []);
 *     uploadFiles(files);
 *   };
 *
 *   return (
 *     <div>
 *       <input
 *         type="file"
 *         multiple
 *         accept="image/*"
 *         onChange={handleFileSelect}
 *         disabled={isUploading}
 *       />
 *
 *       <div>Overall Progress: {progress}%</div>
 *
 *       {files.map((file) => (
 *         <div key={file.id}>
 *           <span>{file.name}</span>
 *           <progress value={file.progress} max={100} />
 *           <span>{file.status}</span>
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example Dynamic Route Usage
 * ```typescript
 * function DynamicUploader({ routeName }: { routeName: string }) {
 *   const { uploadFiles, files, reset } = useUploadRoute(routeName, {
 *     onError: (error) => {
 *       console.error(`Upload to ${routeName} failed:`, error);
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <input
 *         type="file"
 *         onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
 *       />
 *       <button onClick={reset}>Clear All</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter>,
  config?: UploadClientConfig
): S3RouteUploadResult;

export function useUploadRoute(
  routeName: string,
  config?: UploadClientConfig
): S3RouteUploadResult;

export function useUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter> | string,
  config: UploadClientConfig = {}
): S3RouteUploadResult {
  /**
   * Latest config, read at call time rather than captured at engine creation.
   *
   * Callbacks are typically inline arrow functions with a fresh identity every
   * render. Rebuilding the engine for them would tear down subscriptions and
   * discard in-flight state on each render, so the engine holds stable
   * forwarders that dereference this ref instead.
   */
  const configRef = useRef(config);
  configRef.current = config;

  /**
   * The engine is rebuilt only when the route or endpoint changes — both
   * primitives, so the identity is stable across ordinary re-renders.
   */
  const engine = useMemo(
    () =>
      createUploadEngine({
        ...configRef.current,
        route: String(routeName),
        endpoint: config.endpoint,
        fetcher: (input, init) =>
          configRef.current.fetcher
            ? configRef.current.fetcher(input, init)
            : fetch(input as RequestInfo, init),
        onStart: (files) => configRef.current.onStart?.(files),
        onSuccess: (results) => configRef.current.onSuccess?.(results),
        onError: (error) => configRef.current.onError?.(error),
        onProgress: (progress) => configRef.current.onProgress?.(progress),
      }),
    // Callbacks and `fetcher` are deliberately absent from this dependency
    // list — they are read through `configRef` at call time, so including them
    // would rebuild the engine on every render for no behavioural gain.
    [routeName, config.endpoint]
  );

  /**
   * Subscribes React to the engine.
   *
   * `getSnapshot` is passed as the server snapshot too: the engine's initial
   * state is a frozen constant, so server rendering and hydration agree without
   * a separate code path.
   */
  const state = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getSnapshot
  );

  const uploadFiles = useCallback(
    async (files: UploadInput[], metadata?: unknown) => {
      await engine.upload(files, metadata);
    },
    [engine]
  );

  /**
   * Promise-returning variant, for use as a `mutationFn`.
   *
   * Named after TanStack Query's own `mutate` / `mutateAsync` pair: the plain
   * `uploadFiles` never rejects and reports through state, while this resolves
   * with results and rejects on batch failure.
   *
   * Crucially it drives the *same* engine as the hook, so the reactive `files`,
   * `progress`, `uploadSpeed`, and `eta` stay live throughout — you do not have
   * to choose between promise semantics and per-file state, or rebuild the
   * half you gave up.
   */
  const uploadFilesAsync = useCallback(
    (files: UploadInput[], metadata?: unknown): Promise<UploadFilesResult> =>
      settleUpload(engine, files, { metadata }),
    [engine]
  );

  return {
    files: state.files as S3UploadedFile[],
    uploadFiles,
    uploadFilesAsync,
    reset: engine.reset,
    cancel: engine.cancel,
    cancelAll: engine.cancelAll,
    isUploading: state.isUploading,
    errors: state.errors as string[],
    progress: state.progress,
    uploadSpeed: state.uploadSpeed,
    eta: state.eta,
  };
}

// ========================================
// Re-exported utilities
// ========================================

/**
 * Formatting helpers for upload telemetry.
 *
 * Re-exported from `pushduck/core` so existing imports from this module keep
 * working; the implementations are shared with every other framework binding.
 */
export { formatETA, formatUploadSpeed };
