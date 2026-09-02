/**
 * @fileoverview pushduck - Svelte client
 *
 * A Svelte binding over the framework-agnostic engine in `pushduck/core`.
 * Upload semantics — presign, progress, retry-on-error, completion — are
 * identical to the React and React Native clients, because it is literally the
 * same engine underneath.
 *
 * ## Why this file is small
 *
 * Svelte's store contract is `subscribe(run) => unsubscribe`, where `run` is
 * invoked immediately with the current value. The engine already exposes
 * `subscribe`/`getSnapshot`, so the binding is a five-line adapter between the
 * two — everything else here is types and documentation.
 *
 * Works with Svelte 4 stores and Svelte 5 runes alike: the returned object is a
 * readable store, so `$upload` auto-subscribes in both.
 *
 * @example SvelteKit component
 * ```svelte
 * <script lang="ts">
 *   import { createUploadRoute } from "pushduck/svelte";
 *   import type { AppRouter } from "$lib/upload";
 *
 *   const upload = createUploadRoute<AppRouter>("imageUpload", {
 *     endpoint: "/api/upload",
 *     onSuccess: (files) => console.log("done", files),
 *   });
 *
 *   function onSelect(event: Event) {
 *     const input = event.target as HTMLInputElement;
 *     upload.uploadFiles([...(input.files ?? [])]);
 *   }
 * </script>
 *
 * <input type="file" multiple on:change={onSelect} disabled={$upload.isUploading} />
 *
 * <progress value={$upload.progress} max="100"></progress>
 *
 * {#each $upload.files as file (file.id)}
 *   <div>
 *     {file.name} — {file.status} ({file.progress}%)
 *     {#if file.status === "uploading"}
 *       <button on:click={() => upload.cancel(file.id)}>Cancel</button>
 *     {/if}
 *   </div>
 * {/each}
 * ```
 *
 * @example Svelte 5 runes
 * ```svelte
 * <script lang="ts">
 *   import { createUploadRoute } from "pushduck/svelte";
 *
 *   const upload = createUploadRoute("imageUpload", { endpoint: "/api/upload" });
 *   // `$upload` works unchanged under runes; stores remain first-class.
 *   let progress = $derived($upload.progress);
 * </script>
 * ```
 *
 * @example Passing client metadata
 * ```typescript
 * await upload.uploadFiles(files, {
 *   albumId: selectedAlbum.id,
 *   visibility: "private",
 * });
 * ```
 */

import {
  createUploadEngine,
  formatETA,
  formatUploadSpeed,
  createClientProxy,
  settleUpload,
  type UploadClientConfig,
  type UploadClientProxyConfig,
  type UploadFilesResult,
  type UploadEngineState,
} from "./core/upload";
import type {
  RouterRouteNames,
  S3Router,
  UploadInput,
  UploadRouteConfig,
} from "./types";

/**
 * The subset of Svelte's store contract this binding implements.
 *
 * Declared structurally rather than imported from `svelte/store` so that the
 * package carries no hard dependency on Svelte — consumers who never import
 * `pushduck/svelte` do not need Svelte installed.
 */
export interface Readable<T> {
  /**
   * Subscribes to value changes.
   *
   * Per the store contract, `run` is called synchronously with the current
   * value before returning.
   */
  subscribe(run: (value: T) => void): () => void;
}

/**
 * A Svelte-flavoured upload session: a readable store of {@link UploadEngineState}
 * plus the imperative controls.
 */
export interface SvelteUpload extends Readable<UploadEngineState> {
  /**
   * Uploads files, resolving when the batch settles.
   *
   * @param files - `File` objects from an `<input type="file">`
   * @param metadata - Optional client context forwarded to server middleware.
   *   **Untrusted** — validate it in middleware before use.
   */
  uploadFiles(files: UploadInput[], metadata?: unknown): Promise<void>;
  /**
   * Uploads files and resolves with the results, rejecting on batch failure.
   *
   * Use as a `mutationFn` for TanStack Query, SWR, or any async-state library.
   * It drives the same engine as this binding, so the reactive state above
   * stays live during the upload — you get promise semantics *and* per-file
   * progress from one call.
   *
   * @throws {UploadBatchError} If the batch could not run at all.
   */
  uploadFilesAsync(
    files: UploadInput[],
    metadata?: unknown
  ): Promise<UploadFilesResult>;

  /** Aborts one in-flight file. */
  cancel(fileId: string): void;
  /** Aborts every in-flight file. */
  cancelAll(): void;
  /** Aborts everything and clears state. */
  reset(): void;
}

/**
 * Creates an upload store bound to a single route.
 *
 * Call this at component initialisation. The store holds no Svelte-specific
 * lifecycle state, so it is equally valid in a `.svelte.ts` module or a shared
 * context — Svelte's `$` auto-subscription handles teardown at the use site.
 *
 * @template TRouter - Server router type, for route-name autocompletion
 * @param routeName - Route as defined in your server router
 * @param config - Endpoint and lifecycle callbacks
 *
 * @example
 * ```typescript
 * const upload = createUploadRoute<AppRouter>("imageUpload", {
 *   endpoint: "/api/upload",
 * });
 * ```
 */
export function createUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter>,
  config?: UploadClientConfig
): SvelteUpload;

export function createUploadRoute(
  routeName: string,
  config?: UploadClientConfig
): SvelteUpload;

export function createUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter> | string,
  config: UploadClientConfig = {}
): SvelteUpload {
  const engine = createUploadEngine<TRouter>({
    route: String(routeName) as RouterRouteNames<TRouter> & string,
    ...config,
  });

  return {
    subscribe(run) {
      // The store contract requires an immediate synchronous emission so that
      // `$upload` has a value on first render, before any upload starts.
      run(engine.getSnapshot());
      return engine.subscribe(() => run(engine.getSnapshot()));
    },
    uploadFiles: (files, metadata) => engine.upload(files, metadata),
    uploadFilesAsync: (files, metadata) =>
      settleUpload(engine, files, { metadata }),
    cancel: engine.cancel,
    cancelAll: engine.cancelAll,
    reset: engine.reset,
  };
}


/**
 * Type-safe client with one property per route.
 *
 * Identical in shape to the React, Svelte, and Solid clients — each returns its
 * own framework's binding when a route is called, so `upload.imageUpload()`
 * means the same thing everywhere.
 *
 * @example
 * ```typescript
 * const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
 * const { uploadFiles, files, progress } = upload.imageUpload();
 * ```
 */
export function createUploadClient<TRouter extends S3Router<any>>(
  config: UploadClientProxyConfig
): Record<
  RouterRouteNames<TRouter> & string,
  (options?: UploadClientConfig) => SvelteUpload
> {
  return createClientProxy(config, createUploadRoute as never) as never;
}

/**
 * Promise-based upload functions, re-exported for convenience.
 *
 * Framework-free: use them when an async-state library (TanStack Query, SWR)
 * should own loading and error state. Identical across every pushduck entry
 * point, so switching frameworks never changes this import.
 */
export {
  uploadFile,
  uploadFiles,
  UploadBatchError,
} from "./core/upload/upload-files";
export type {
  UploadFileOptions,
  UploadFilesOptions,
  UploadFilesResult,
} from "./core/upload/upload-files";

export { formatETA, formatUploadSpeed };

export type { UploadEngineState } from "./core/upload";
export type {
  S3FileMetadata,
  S3UploadedFile,
  UploadInput,
  UploadRouteConfig,
} from "./types";

/**
 * The error type every pushduck failure uses.
 *
 * Built on HTTP status codes and RFC 9457 rather than any framework's error
 * convention — map `code`/`status` to your ecosystem's shape in your own code.
 */
export { isUploadError, UPLOAD_ERROR_CODES, UploadError } from "./core/errors";
export type { UploadErrorCode } from "./core/errors";
