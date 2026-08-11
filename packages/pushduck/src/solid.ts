/**
 * @fileoverview pushduck - SolidJS client
 *
 * A SolidJS binding over the framework-agnostic engine in `pushduck/core`.
 * Upload semantics are identical to the React, React Native, Vue, and Svelte
 * clients — it is the same engine underneath.
 *
 * ## Why the shape differs from the other bindings
 *
 * Solid does not re-render components; it updates the exact DOM nodes that read
 * a changed value. Handing back plain values (React's shape) or refs (Vue's)
 * would throw that away. Instead this returns Solid's own idiom:
 *
 * - a **store** for state, updated through `reconcile` so that changing one
 *   file's progress touches only the nodes bound to that file, not the list
 * - a separate **actions** object, so destructuring never breaks reactivity
 *
 * That is the `[state, actions]` tuple convention used by `createStore` itself
 * and by the Solid Primitives collection.
 *
 * @example SolidStart component
 * ```tsx
 * import { createUploadRoute } from "pushduck/solid";
 * import { For } from "solid-js";
 * import type { AppRouter } from "~/lib/upload";
 *
 * export default function Uploader() {
 *   const [upload, { uploadFiles, cancel }] = createUploadRoute<AppRouter>(
 *     "imageUpload",
 *     { endpoint: "/api/upload" }
 *   );
 *
 *   return (
 *     <>
 *       <input
 *         type="file"
 *         multiple
 *         disabled={upload.isUploading}
 *         onChange={(e) => uploadFiles([...(e.currentTarget.files ?? [])])}
 *       />
 *
 *       <progress value={upload.progress} max="100" />
 *
 *       <For each={upload.files}>
 *         {(file) => (
 *           <div>
 *             {file.name} — {file.status} ({file.progress}%)
 *             <Show when={file.status === "uploading"}>
 *               <button onClick={() => cancel(file.id)}>Cancel</button>
 *             </Show>
 *           </div>
 *         )}
 *       </For>
 *     </>
 *   );
 * }
 * ```
 *
 * @example Passing client metadata
 * ```typescript
 * await uploadFiles(files, { albumId: album().id, visibility: "private" });
 * ```
 */

import { getOwner, onCleanup } from "solid-js";
import { createStore, reconcile, type Store } from "solid-js/store";
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
 * Imperative controls returned alongside the reactive store.
 *
 * Kept separate from state so they can be destructured freely — pulling a
 * function off an object is safe; pulling a value off a Solid store is not.
 */
export interface SolidUploadActions {
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
   * Called automatically via `onCleanup` when created under a reactive owner.
   * Only needed manually outside one — a module-level singleton, say.
   */
  stop(): void;
}

/**
 * Copies a snapshot into a shape Solid's store may write into.
 *
 * The engine's initial state is deliberately frozen, and its `files`/`errors`
 * are exposed as `readonly`. `createStore` and `reconcile` write in place, so
 * handing them a frozen object throws `Cannot assign to read only property`.
 * Cloning at the boundary keeps the engine's immutability guarantee intact
 * while giving Solid something it can own.
 */
function toMutableShape(snapshot: UploadEngineState): UploadEngineState {
  return {
    ...snapshot,
    files: [...snapshot.files],
    errors: [...snapshot.errors],
  };
}

/**
 * Solid primitive for type-safe file uploads.
 *
 * @template TRouter - Server router type, for route-name autocompletion
 * @param routeName - Route as defined in your server router
 * @param config - Endpoint and lifecycle callbacks
 * @returns A `[state, actions]` tuple, matching Solid's `createStore` convention
 *
 * @example
 * ```typescript
 * const [upload, { uploadFiles }] = createUploadRoute<AppRouter>("imageUpload", {
 *   endpoint: "/api/upload",
 * });
 *
 * // `upload.progress` is fine-grained: only nodes reading it update.
 * ```
 */
export function createUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter>,
  config?: UploadClientConfig
): [Store<UploadEngineState>, SolidUploadActions];

export function createUploadRoute(
  routeName: string,
  config?: UploadClientConfig
): [Store<UploadEngineState>, SolidUploadActions];

export function createUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter> | string,
  config: UploadClientConfig = {}
): [Store<UploadEngineState>, SolidUploadActions] {
  const engine = createUploadEngine<TRouter>({
    route: String(routeName) as RouterRouteNames<TRouter> & string,
    ...config,
  });

  const [state, setState] = createStore<UploadEngineState>(
    toMutableShape(engine.getSnapshot())
  );

  const stop = engine.subscribe(() => {
    // `reconcile` diffs the incoming snapshot against the current store and
    // writes only what actually changed. Without it, every progress event would
    // replace the whole state object and invalidate every dependent node —
    // discarding the fine-grained updates that are Solid's entire point.
    //
    // `key: "id"` lets it match files across snapshots by id rather than by
    // array position, so a file that only changed progress keeps its identity.
    setState(
      reconcile(toMutableShape(engine.getSnapshot()), {
        key: "id",
        merge: false,
      })
    );
  });

  // Auto-teardown under a reactive owner (component or createRoot). Outside
  // one, `getOwner()` is null and calling onCleanup would warn and no-op, so
  // the caller owns `stop()`.
  if (getOwner()) onCleanup(stop);

  return [
    state,
    {
      uploadFiles: (files, metadata) => engine.upload(files, metadata),
      uploadFilesAsync: (files, metadata) =>
        settleUpload(engine, files, { metadata }),
      cancel: engine.cancel,
      cancelAll: engine.cancelAll,
      reset: engine.reset,
      stop,
    },
  ];
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
  (options?: UploadClientConfig) => [Store<UploadEngineState>, SolidUploadActions]
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
