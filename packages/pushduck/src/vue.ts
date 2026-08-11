/**
 * @fileoverview pushduck - Vue client
 *
 * A Vue 3 Composition API binding over the framework-agnostic engine in
 * `pushduck/core`. Upload semantics are identical to the React, React Native,
 * and Svelte clients — it is the same engine underneath.
 *
 * Pairs naturally with Nuxt: define the route handler in `server/api` and use
 * this composable in any component.
 *
 * ## Reactivity notes
 *
 * State is exposed through `shallowRef`, not `ref`. The engine already replaces
 * its state object on every change, so deep reactivity would add proxy overhead
 * across the whole file array for no benefit — meaningful when uploading
 * hundreds of files.
 *
 * The subscription is released via `onScopeDispose` when created inside a
 * component or effect scope. Outside a scope — a module singleton, say — the
 * returned `stop()` is the caller's responsibility.
 *
 * @example Vue 3 SFC
 * ```vue
 * <script setup lang="ts">
 * import { useUploadRoute } from "pushduck/vue";
 * import type { AppRouter } from "@/lib/upload";
 *
 * const { files, progress, isUploading, uploadFiles, cancel } =
 *   useUploadRoute<AppRouter>("imageUpload", {
 *     endpoint: "/api/upload",
 *     onSuccess: (uploaded) => console.log("done", uploaded),
 *   });
 *
 * function onSelect(event: Event) {
 *   const input = event.target as HTMLInputElement;
 *   uploadFiles([...(input.files ?? [])]);
 * }
 * </script>
 *
 * <template>
 *   <input type="file" multiple :disabled="isUploading" @change="onSelect" />
 *
 *   <progress :value="progress" max="100" />
 *
 *   <div v-for="file in files" :key="file.id">
 *     {{ file.name }} — {{ file.status }} ({{ file.progress }}%)
 *     <button v-if="file.status === 'uploading'" @click="cancel(file.id)">
 *       Cancel
 *     </button>
 *   </div>
 * </template>
 * ```
 *
 * @example Nuxt
 * ```vue
 * <script setup lang="ts">
 * // server/api/upload.ts exposes the handler; the composable just points at it
 * const { uploadFiles, progress } = useUploadRoute("imageUpload", {
 *   endpoint: "/api/upload",
 * });
 * </script>
 * ```
 *
 * @example Passing client metadata
 * ```typescript
 * await uploadFiles(files, { albumId: album.value.id, visibility: "private" });
 * ```
 */

import {
  computed,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  type ComputedRef,
  type ShallowRef,
} from "vue";
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
  S3UploadedFile,
  UploadInput,
  UploadRouteConfig,
} from "./types";

/**
 * Reactive upload state and controls returned by {@link useUploadRoute}.
 *
 * Every state field is a ref, so destructuring at the call site preserves
 * reactivity — the idiomatic Vue shape, rather than React's plain values.
 */
export interface VueUploadRoute {
  /** Per-file status, progress, and results for the current batch. */
  files: ComputedRef<S3UploadedFile[]>;
  /** Whether a batch is currently in flight. */
  isUploading: ComputedRef<boolean>;
  /** Batch-level failures. Per-file failures live on the file itself. */
  errors: ComputedRef<string[]>;
  /** Byte-weighted completion across the batch, 0-100. */
  progress: ComputedRef<number>;
  /** Combined transfer rate in bytes per second. */
  uploadSpeed: ComputedRef<number>;
  /** Estimated seconds remaining for the batch. */
  eta: ComputedRef<number>;

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
  /**
   * Releases the engine subscription.
   *
   * Called automatically on scope disposal when used inside a component. Only
   * needed manually when the composable is created outside any effect scope.
   */
  stop(): void;
}

/**
 * Vue composable for type-safe file uploads.
 *
 * @template TRouter - Server router type, for route-name autocompletion
 * @param routeName - Route as defined in your server router
 * @param config - Endpoint and lifecycle callbacks
 *
 * @example
 * ```typescript
 * const { uploadFiles, progress } = useUploadRoute<AppRouter>("imageUpload", {
 *   endpoint: "/api/upload",
 * });
 * ```
 */
export function useUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter>,
  config?: UploadClientConfig
): VueUploadRoute;

export function useUploadRoute(
  routeName: string,
  config?: UploadClientConfig
): VueUploadRoute;

export function useUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter> | string,
  config: UploadClientConfig = {}
): VueUploadRoute {
  const engine = createUploadEngine<TRouter>({
    route: String(routeName) as RouterRouteNames<TRouter> & string,
    ...config,
  });

  // shallowRef: the engine hands back a new state object per change, so deep
  // reactivity would proxy the entire file array to observe nothing extra.
  const state: ShallowRef<UploadEngineState> = shallowRef(engine.getSnapshot());

  const stop = engine.subscribe(() => {
    state.value = engine.getSnapshot();
  });

  // Auto-teardown inside a component or effect scope. Outside one — a module
  // singleton, for instance — `getCurrentScope()` is undefined and the caller
  // owns `stop()`.
  if (getCurrentScope()) onScopeDispose(stop);

  return {
    files: computed(() => state.value.files as S3UploadedFile[]),
    isUploading: computed(() => state.value.isUploading),
    errors: computed(() => state.value.errors as string[]),
    progress: computed(() => state.value.progress),
    uploadSpeed: computed(() => state.value.uploadSpeed),
    eta: computed(() => state.value.eta),

    uploadFiles: (files, metadata) => engine.upload(files, metadata),
    uploadFilesAsync: (files, metadata) =>
      settleUpload(engine, files, { metadata }),
    cancel: engine.cancel,
    cancelAll: engine.cancelAll,
    reset: engine.reset,
    stop,
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
  (options?: UploadClientConfig) => VueUploadRoute
> {
  return createClientProxy(config, useUploadRoute as never) as never;
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
