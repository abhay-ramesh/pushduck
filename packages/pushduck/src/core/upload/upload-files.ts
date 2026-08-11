/**
 * @fileoverview Promise-based upload functions.
 *
 * The engine is built around `subscribe`/`getSnapshot` because that is what
 * reactive frameworks want. But a large class of consumers — TanStack Query's
 * `useMutation`, tRPC mutations, SWR, Effect, or a plain `await` in an event
 * handler — want the opposite shape: **call a function, get results, catch
 * errors**.
 *
 * `engine.upload()` cannot serve them. It resolves to `void` and never rejects,
 * so under `useMutation` the `data` is empty, `onError` never fires, `isError`
 * is never true, and retries never trigger. These functions provide the
 * contract those libraries actually expect:
 *
 * - **resolve** with `{ files, failedFiles }` when the batch ran
 * - **reject** with {@link UploadBatchError} when the batch could not run at all
 *   (auth rejected, route missing, network down)
 *
 * Partial failure resolves rather than rejects: if three of four files upload,
 * you want the three, plus a list of what failed. A thrown error would discard
 * the successes.
 */

import type {
  RouterRouteNames,
  S3Router,
  S3UploadedFile,
  UploadInput,
} from "../../types";
import { UploadError } from "../errors";
import {
  createUploadEngine,
  type UploadClientConfig,
  type UploadEngine,
  type UploadEngineState,
} from "./engine";

/**
 * Thrown when a batch could not run at all.
 *
 * Distinct from individual files failing — those are reported through
 * {@link UploadFilesResult.failedFiles} while the promise still resolves.
 */
export class UploadBatchError extends UploadError {
  override readonly name = "UploadBatchError";

  /** Every batch-level error message reported by the engine. */
  readonly errors: readonly string[];

  /** Per-file state at the moment the batch failed, for diagnostics. */
  readonly files: readonly S3UploadedFile[];

  constructor(
    cause: UploadError,
    errors: readonly string[],
    files: readonly S3UploadedFile[]
  ) {
    // Inherits `code`, `status`, `retryable` and `meta` from the underlying
    // failure, so `catch (e) { if (e.retryable) … }` works whether the caller
    // narrowed to UploadBatchError or only to UploadError.
    super(cause.code, cause.message, {
      cause: cause.cause ?? cause,
      status: cause.status,
      retryable: cause.retryable,
      meta: cause.meta,
      instance: cause.instance,
    });

    this.errors = errors;
    this.files = files;
  }
}

/** Options for {@link uploadFiles}. */
export interface UploadFilesOptions<
  TRouter extends S3Router<any> = S3Router<any>,
> extends UploadClientConfig {
  /** Files (web) or picker assets (React Native) to upload. */
  files: UploadInput[];

  /**
   * Route name as defined in your server router.
   *
   * Pass the router type — `uploadFiles<AppRouter>({ … })` — for
   * autocompletion and a compile error on an unknown route.
   */
  route: RouterRouteNames<TRouter> & string;

  /**
   * Client context forwarded to server middleware.
   *
   * **Untrusted** — validate it in middleware before use.
   */
  metadata?: unknown;

  /**
   * Called whenever an individual file's state changes.
   *
   * Fires on status transitions and on progress updates, so it is the hook to
   * drive a per-file progress UI when you are not using a framework binding.
   */
  onFileStateChange?: (file: S3UploadedFile) => void;

  /**
   * Aborts the batch when signalled.
   *
   * Composes with anything that produces an `AbortSignal` — a TanStack Query
   * `queryFn` signal, a React `useEffect` cleanup, or `AbortSignal.timeout()`.
   */
  signal?: AbortSignal;
}

/** Resolution value of {@link uploadFiles}. */
export interface UploadFilesResult {
  /** Files that uploaded successfully, with their keys and URLs. */
  files: S3UploadedFile[];
  /** Files that failed individually. Each carries an `error` message. */
  failedFiles: S3UploadedFile[];
}

/**
 * Uploads files and resolves with the results.
 *
 * Use this when an async-state library owns the loading and error state —
 * TanStack Query, tRPC, SWR, Effect — or when you just want to `await` an
 * upload. For reactive per-file state without a state library, prefer the
 * framework binding (`pushduck/client`, `/vue`, `/svelte`, `/solid`) or
 * `createUploadEngine` directly.
 *
 * @throws {UploadBatchError} If the batch could not run — for example the
 *   server rejected the presign request, or the network was unavailable.
 *
 * @example TanStack Query
 * ```typescript
 * const { mutate, isPending } = useMutation({
 *   mutationFn: (files: File[]) =>
 *     uploadFiles({ files, route: "imageUpload", endpoint: "/api/upload" }),
 *   onSuccess: ({ files, failedFiles }) => {
 *     console.log(`${files.length} uploaded, ${failedFiles.length} failed`);
 *   },
 *   onError: (error) => console.error(error),
 * });
 * ```
 *
 * @example Plain await
 * ```typescript
 * const { files, failedFiles } = await uploadFiles({
 *   files: selected,
 *   route: "imageUpload",
 *   endpoint: "/api/upload",
 *   metadata: { albumId: "summer-2026" },
 * });
 * ```
 */
export async function uploadFiles<
  TRouter extends S3Router<any> = S3Router<any>,
>(options: UploadFilesOptions<TRouter>): Promise<UploadFilesResult> {
  const {
    files: inputs,
    route,
    metadata,
    onFileStateChange,
    signal,
    ...engineConfig
  } = options;

  const engine = createUploadEngine({ route, ...engineConfig });

  return settleUpload(engine, inputs, {
    metadata,
    onFileStateChange,
    signal,
  });
}

/**
 * Runs a batch on an existing engine and settles it as a promise.
 *
 * Shared by {@link uploadFiles}, which owns a throwaway engine, and by the
 * framework bindings' `uploadFilesAsync`, which reuse the engine already
 * backing the component's reactive state. That sharing is the point: a caller
 * gets promise semantics *and* live per-file state from one upload, instead of
 * choosing between them and re-implementing whichever half they lost.
 *
 * @internal
 */
export async function settleUpload(
  engine: UploadEngine,
  inputs: UploadInput[],
  options: {
    metadata?: unknown;
    onFileStateChange?: (file: S3UploadedFile) => void;
    signal?: AbortSignal;
  } = {}
): Promise<UploadFilesResult> {
  const { metadata, onFileStateChange, signal } = options;

  // Track the last emitted state per file so `onFileStateChange` fires only for
  // files that actually changed, rather than once per file on every commit.
  const lastSeen = new Map<string, S3UploadedFile>();

  const unsubscribe = onFileStateChange
    ? engine.subscribe(() => {
        for (const file of engine.getSnapshot().files) {
          const previous = lastSeen.get(file.id);
          if (previous === file) continue;
          lastSeen.set(file.id, file);
          onFileStateChange(file);
        }
      })
    : () => {};

  const onAbort = () => engine.cancelAll();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (signal?.aborted) engine.cancelAll();

    await engine.upload(inputs, metadata);

    const state: UploadEngineState = engine.getSnapshot();

    const batchError = engine.getBatchError();
    if (batchError) {
      throw new UploadBatchError(batchError, state.errors, state.files);
    }

    return {
      files: state.files.filter((f) => f.status === "success"),
      failedFiles: state.files.filter((f) => f.status === "error"),
    };
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Options for {@link uploadFile}. */
export interface UploadFileOptions<
  TRouter extends S3Router<any> = S3Router<any>,
> extends Omit<UploadFilesOptions<TRouter>, "files" | "onFileStateChange"> {
  /** The single file to upload. */
  file: UploadInput;
  /** Called whenever the file's state changes. */
  onFileStateChange?: (file: S3UploadedFile) => void;
}

/**
 * Uploads a single file and resolves with it.
 *
 * Unlike {@link uploadFiles}, a failure of *the* file is a failure of the whole
 * call, so this rejects rather than resolving with an empty result.
 *
 * @throws {UploadBatchError} If the batch could not run, or the file failed.
 *
 * @example
 * ```typescript
 * const uploaded = await uploadFile({
 *   file,
 *   route: "imageUpload",
 *   endpoint: "/api/upload",
 * });
 * console.log(uploaded.url);
 * ```
 */
export async function uploadFile<
  TRouter extends S3Router<any> = S3Router<any>,
>(options: UploadFileOptions<TRouter>): Promise<S3UploadedFile> {
  const { file, ...rest } = options;

  const result = await uploadFiles({ ...rest, files: [file] });

  const uploaded = result.files[0];
  if (!uploaded) {
    const failed = result.failedFiles[0];
    const cause = new UploadError(
      failed?.errorCode ?? "INTERNAL_ERROR",
      failed?.error ?? "Upload failed",
      { meta: { file: failed?.name } }
    );
    throw new UploadBatchError(
      cause,
      [cause.message],
      result.failedFiles
    );
  }

  return uploaded;
}
