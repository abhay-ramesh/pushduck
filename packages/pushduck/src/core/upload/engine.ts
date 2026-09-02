/**
 * @fileoverview The framework-agnostic upload engine.
 *
 * This is the whole upload workflow — presign, transmit, complete — with no
 * framework, no DOM assumptions at module scope, and no dependency on the
 * server half of the library. Every framework binding (React, Vue, Svelte,
 * Solid, vanilla) is a thin subscription over this object.
 *
 * ## The external-store contract
 *
 * The engine exposes `subscribe(listener)` and `getSnapshot()` — the same pair
 * React's `useSyncExternalStore`, Svelte's store contract, and Zustand all
 * speak. Binding to a new framework means translating that pair into the
 * framework's reactivity primitive, which is why each binding is ~50 lines.
 *
 * `getSnapshot()` returns a **referentially stable** object: the same reference
 * is returned until state actually changes. This is a hard requirement, not an
 * optimisation — `useSyncExternalStore` infinite-loops without it, and Vue and
 * Solid re-render on every tick.
 *
 * @example Vanilla usage
 * ```typescript
 * const engine = createUploadEngine({
 *   endpoint: "/api/upload",
 *   route: "imageUpload",
 * });
 *
 * engine.subscribe(() => {
 *   const { files, progress } = engine.getSnapshot();
 *   render(files, progress);
 * });
 *
 * await engine.upload(selectedFiles, { albumId: "abc" });
 * ```
 */

import type {
  RouterRouteNames,
  S3FileMetadata,
  S3Router,
  S3UploadedFile,
  UploadAdvancedConfig,
  UploadInput,
  UploadRouteConfig,
} from "../../types";
import {
  fromProblemDetails,
  toUploadError,
  UploadError,
} from "../errors";
import { getInputMeta, isFile, toBlob } from "./input";
import { computeAggregateProgress, computeFileTelemetry } from "./progress";
import {
  UploadAbortedError,
  xhrTransport,
  type UploadTransport,
} from "./transport";

// ========================================
// Public types
// ========================================

/**
 * The complete observable state of an engine.
 *
 * Field names and semantics match the existing React hook's return value so a
 * binding can hand this straight to consumers without remapping.
 */
export interface UploadEngineState {
  /** Per-file status, progress, and results for the current batch. */
  readonly files: readonly S3UploadedFile[];
  /** Whether a batch is currently in flight. */
  readonly isUploading: boolean;
  /** Batch-level failures. Per-file failures live on the file itself. */
  readonly errors: readonly string[];
  /** Byte-weighted completion across the batch, 0-100. */
  readonly progress: number;
  /** Combined transfer rate in bytes per second. */
  readonly uploadSpeed: number;
  /** Estimated seconds remaining for the batch. */
  readonly eta: number;
}

/**
 * Construction options for {@link createUploadEngine}.
 *
 * Extends the shared {@link UploadRouteConfig} so the React, Vue, and Svelte
 * bindings all accept an identical options object.
 */
export interface UploadEngineOptions<
  TRouter extends S3Router<any> = S3Router<any>,
> extends UploadRouteConfig,
    UploadAdvancedConfig {
  /**
   * Route name as defined in the server router.
   *
   * Pass the router type — `createUploadEngine<AppRouter>({ … })` — to get
   * autocompletion over your route names and a compile error on a typo.
   * Without a type argument this stays a plain `string`, so untyped usage
   * keeps working.
   */
  route: RouterRouteNames<TRouter> & string;
}

/**
 * Engine options minus the route, which framework bindings supply themselves.
 *
 * This is the config type a binding accepts: everything in
 * {@link UploadRouteConfig} (endpoint, fetcher, lifecycle callbacks) plus the
 * advanced injectable collaborators — `transport` for runtimes without
 * `XMLHttpRequest`, `now` for deterministic tests, `blobFetcher` for custom
 * React Native URI resolution.
 */
export type UploadClientConfig = Omit<UploadEngineOptions, "route">;

/**
 * A framework-agnostic upload session bound to a single route.
 */
export interface UploadEngine {
  /**
   * Uploads a batch of files, resolving when the batch settles.
   *
   * Never rejects — failures surface through state, the per-file `error` field,
   * and the `onError` callback, matching the existing hook's contract.
   *
   * @param inputs - Files (web) or picker assets (React Native)
   * @param metadata - Optional client context forwarded to server middleware.
   *   **Untrusted**: server middleware must validate before use.
   */
  upload(inputs: UploadInput[], metadata?: unknown): Promise<void>;

  /** Aborts one in-flight file, marking it errored. */
  cancel(fileId: string): void;

  /** Aborts every in-flight file in the batch. */
  cancelAll(): void;

  /** Aborts everything and returns the engine to its initial state. */
  reset(): void;

  /** Current state. Referentially stable between changes. */
  getSnapshot(): UploadEngineState;

  /**
   * The batch-level failure from the last run, if any.
   *
   * Lets the promise API reject with the original typed error — code, status,
   * retryability and meta intact — rather than rebuilding one from a string.
   */
  getBatchError(): UploadError | undefined;

  /**
   * Registers a change listener.
   * @returns An unsubscribe function.
   */
  subscribe(listener: () => void): () => void;
}

// ========================================
// Internal helpers
// ========================================

const DEFAULT_ENDPOINT = "/api/s3-upload";

/**
 * One entry of the server's presign response.
 *
 * Declared here as the client's view of the wire contract. When the protocol
 * module is extracted, both this and the server's `PresignedUrlResponse` will
 * be replaced by a single shared declaration — the contract currently exists
 * twice because it has no home of its own yet.
 */
interface PresignedUrlResult {
  success: boolean;
  presignedUrl?: string;
  key?: string;
  /** Headers the PUT must carry for the signature to validate. */
  requiredHeaders?: Record<string, string>;
  metadata?: unknown;
  error?: string;
}

/** Per-file bookkeeping the engine needs but consumers never see. */
interface FileTrack {
  id: string;
  input: UploadInput;
  /** Blob resolved during presign for inputs whose size was unknown. */
  earlyBlob: Blob | null;
  meta: S3FileMetadata;
  controller: AbortController;
  startedAt: number;
}

const INITIAL_STATE: UploadEngineState = Object.freeze({
  files: Object.freeze([]) as readonly S3UploadedFile[],
  isUploading: false,
  errors: Object.freeze([]) as readonly string[],
  progress: 0,
  uploadSpeed: 0,
  eta: 0,
});

// ========================================
// Factory
// ========================================

/**
 * Creates an upload engine for a single route.
 *
 * @param options - Endpoint, route, callbacks, and injectable collaborators
 * @returns An engine implementing the external-store contract
 */
export function createUploadEngine<
  TRouter extends S3Router<any> = S3Router<any>,
>(options: UploadEngineOptions<TRouter>): UploadEngine {
  const {
    route,
    endpoint = DEFAULT_ENDPOINT,
    fetcher = ((input, init) =>
      fetch(input as RequestInfo, init)) as NonNullable<
      UploadRouteConfig["fetcher"]
    >,
    transport = xhrTransport,
    now = Date.now,
    blobFetcher,
    onStart,
    onSuccess,
    onError,
    onProgress,
  } = options;

  // ---- Observable state -------------------------------------------------

  const listeners = new Set<() => void>();

  let files: S3UploadedFile[] = [];
  let isUploading = false;
  let errors: string[] = [];

  /** Cached snapshot. Rebuilt only on change, preserving reference equality. */
  let snapshot: UploadEngineState = INITIAL_STATE;

  /** Last progress value handed to `onProgress`, to suppress duplicates. */
  let lastReportedProgress: number | null = null;

  const tracks = new Map<string, FileTrack>();

  /**
   * Identifies the batch that currently owns engine state.
   *
   * Calling `upload()` while a batch is in flight starts a new batch that
   * replaces the old one. Without this guard the *earlier* call's `finally`
   * would clear the newer batch's tracks and flip `isUploading` to false,
   * silently breaking cancellation and reporting an idle engine mid-upload.
   * Only the batch that still owns the epoch is allowed to mutate shared state.
   */
  let currentEpoch = 0;

  function notify(): void {
    // Iterate a copy: a listener may unsubscribe during notification.
    for (const listener of [...listeners]) listener();
  }

  /**
   * Rebuilds the snapshot from current state and notifies subscribers.
   *
   * The aggregate is always recomputed from `files`, so it can never drift out
   * of sync with per-file state — the class of bug that arises when aggregates
   * are maintained incrementally.
   */
  function commit(opts: { reportProgress?: boolean } = {}): void {
    const aggregate = computeAggregateProgress(files);

    snapshot = {
      files: [...files],
      isUploading,
      errors: [...errors],
      progress: aggregate.progress,
      uploadSpeed: aggregate.uploadSpeed,
      eta: aggregate.eta,
    };

    if (opts.reportProgress && aggregate.progress !== lastReportedProgress) {
      lastReportedProgress = aggregate.progress;
      onProgress?.(aggregate.progress);
    }

    notify();
  }

  function patchFile(
    fileId: string,
    patch: Partial<S3UploadedFile>,
    opts: { reportProgress?: boolean } = {}
  ): void {
    let changed = false;
    files = files.map((file) => {
      if (file.id !== fileId) return file;
      changed = true;
      return { ...file, ...patch };
    });
    if (changed) commit(opts);
  }

  /**
   * Reports a batch-level failure across every file that has not settled.
   *
   * Records the message on `errors` (for display) and the code on each file
   * (for branching), so a caller can both render the failure and decide what to
   * do about it — retry a `RATE_LIMITED`, re-authenticate an `UNAUTHORIZED`.
   */
  function failBatch(error: UploadError): void {
    errors = [...errors, error.message];
    batchError = error;

    files = files.map((file) =>
      file.status === "success" || file.status === "error"
        ? file
        : {
            ...file,
            status: "error" as const,
            error: error.message,
            errorCode: error.code,
          }
    );
    commit();
  }

  /**
   * The batch-level failure, when there was one.
   *
   * Kept alongside `errors` so the promise API can reject with the original
   * typed error rather than reconstructing one from a string.
   */
  let batchError: UploadError | undefined;

  // ---- Upload workflow --------------------------------------------------

  /**
   * Resolves inputs to metadata, eagerly fetching blobs whose size is unknown.
   *
   * Pickers frequently report size `0`. Resolving those blobs before presigning
   * means the server receives a real byte count (so size limits are enforced
   * against the truth) and the aggregate has a real denominator from the start.
   * Inputs with a known size defer blob resolution to the transmit step.
   */
  async function resolveInputs(inputs: UploadInput[]): Promise<FileTrack[]> {
    return Promise.all(
      inputs.map(async (input) => {
        const meta = getInputMeta(input);
        const earlyBlob = meta.size > 0 ? null : await toBlob(input, blobFetcher);
        const size = meta.size > 0 ? meta.size : (earlyBlob?.size ?? 0);

        return {
          id: nextFileId(),
          input,
          earlyBlob,
          meta: { name: meta.name, size, type: meta.type },
          controller: new AbortController(),
          startedAt: 0,
        };
      })
    );
  }

  let idCounter = 0;
  /**
   * Monotonic per-engine id.
   *
   * The counter — rather than an array index — guarantees uniqueness across
   * batches issued within the same millisecond.
   */
  function nextFileId(): string {
    return `${now()}-${idCounter++}`;
  }

  async function requestPresignedUrls(
    fileMetadata: S3FileMetadata[],
    metadata: unknown
  ): Promise<
    | { ok: true; results: PresignedUrlResult[] }
    | { ok: false; error: UploadError }
  > {
    const response = await fetcher(
      `${endpoint}?route=${route}&action=presign`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: fileMetadata, metadata }),
      }
    );

    if (!response.ok) {
      // The server answers failures with an RFC 9457 problem document, so the
      // code, status, retryability and structured meta all survive the hop
      // instead of collapsing into a message string.
      const body = await response.json().catch(() => null);
      return { ok: false, error: fromProblemDetails(body, response.status) };
    }

    const data = await response.json();
    if (!data?.success) {
      return {
        ok: false,
        error: fromProblemDetails(data, response.status),
      };
    }

    return { ok: true, results: data.results ?? [] };
  }

  /** Transmits one file and returns its completion record, or null on failure. */
  async function transmit(
    track: FileTrack,
    result: PresignedUrlResult | undefined
  ): Promise<{
    key: string;
    clientFileId: string;
    file: S3FileMetadata;
    metadata: unknown;
  } | null> {
    if (!result?.success) {
      // A per-file rejection from the route's validation chain.
      const failure = new UploadError(
        "VALIDATION_FAILED",
        result?.error || "Failed to get presigned URL",
        { meta: { file: track.meta.name } }
      );
      patchFile(track.id, {
        status: "error",
        error: failure.message,
        errorCode: failure.code,
      });
      onError?.(failure);
      return null;
    }

    // A well-behaved server always pairs success with a URL and a key. Guard
    // anyway: without this, a malformed response would PUT to the string
    // "undefined" and fail with an opaque network error instead of a clear one.
    const { presignedUrl, key } = result;
    if (!presignedUrl || !key) {
      const failure = new UploadError(
        "INTERNAL_ERROR",
        "Server returned a successful presign result without a presigned URL or key",
        { meta: { file: track.meta.name } }
      );
      patchFile(track.id, {
        status: "error",
        error: failure.message,
        errorCode: failure.code,
      });
      onError?.(failure);
      return null;
    }

    try {
      track.startedAt = now();
      patchFile(track.id, {
        status: "uploading",
        uploadStartTime: track.startedAt,
      });

      const blob = track.earlyBlob ?? (await toBlob(track.input, blobFetcher));

      // A server on an older version returns no requiredHeaders; sending the
      // content type alone matches what its signature covered.
      const headers: Record<string, string> = result.requiredHeaders ?? {
        "Content-Type": track.meta.type,
      };

      await transport({
        url: presignedUrl,
        body: blob,
        headers,
        signal: track.controller.signal,
        onProgress: (loadedBytes, totalBytes) => {
          const elapsedSeconds = (now() - track.startedAt) / 1000;
          const telemetry = computeFileTelemetry(
            loadedBytes,
            totalBytes,
            elapsedSeconds
          );
          patchFile(track.id, telemetry, { reportProgress: true });
        },
      });

      patchFile(
        track.id,
        // `result.metadata` is the middleware chain's output for this file.
        // Surfacing it here saves the client a round trip to learn what the
        // server decided (record id, resolved path, derived permissions).
        { status: "success", progress: 100, key, metadata: result.metadata },
        { reportProgress: true }
      );

      return {
        key,
        clientFileId: track.id,
        file: track.meta,
        metadata: result.metadata,
      };
    } catch (error) {
      // Cancellation is a distinct outcome from failure: it is not retryable
      // and should not be reported as a network problem.
      const failure =
        error instanceof UploadAbortedError
          ? new UploadError("UPLOAD_CANCELLED", "Upload cancelled", {
              cause: error,
              meta: { file: track.meta.name },
            })
          : toUploadError(error, "NETWORK_ERROR");

      patchFile(track.id, {
        status: "error",
        error: failure.message,
        errorCode: failure.code,
      });
      onError?.(failure);
      return null;
    }
  }

  /**
   * Notifies the server that objects landed, and folds the returned URLs back
   * into file state.
   *
   * Deliberately non-fatal: the bytes are already in storage, so a failure here
   * must not turn a successful upload into a failed one.
   */
  async function notifyCompletion(
    completions: Array<{ key: string; clientFileId: string }>
  ): Promise<void> {
    try {
      const response = await fetcher(
        `${endpoint}?route=${route}&action=complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completions }),
        }
      );

      if (!response.ok) return;

      const data = await response.json();
      if (!data?.success || !Array.isArray(data.results)) return;

      for (const result of data.results) {
        if (!result?.success || !result.key) continue;

        const match = completions.find((c) => c.key === result.key);
        if (!match) continue;

        patchFile(match.clientFileId, {
          status: "success",
          progress: 100,
          key: result.key,
          url: result.url,
          presignedUrl: result.presignedUrl,
        });
      }
    } catch {
      // Swallowed by design — see the doc comment above.
    }
  }

  // ---- Public surface ---------------------------------------------------

  async function upload(
    inputs: UploadInput[],
    metadata?: unknown
  ): Promise<void> {
    if (!inputs.length) {
      isUploading = false;
      commit();
      return;
    }

    const epoch = ++currentEpoch;
    /** True while this call still owns engine state. */
    const owns = () => currentEpoch === epoch;

    try {
      isUploading = true;
      errors = [];
      batchError = undefined;
      lastReportedProgress = null;
      commit();

      const resolved = await resolveInputs(inputs);

      // A newer batch may have started while blobs were resolving. Abandon
      // this one rather than overwriting the newer batch's state.
      if (!owns()) return;

      tracks.clear();
      for (const track of resolved) tracks.set(track.id, track);

      files = resolved.map(({ id, meta, input }) => ({
        id,
        name: meta.name,
        size: meta.size,
        type: meta.type,
        status: "pending" as const,
        progress: 0,
        file: isFile(input) ? input : undefined,
      }));
      commit();

      const fileMetadata = resolved.map((t) => t.meta);
      const presign = await requestPresignedUrls(fileMetadata, metadata);

      if (!presign.ok) {
        // Recorded on `errors` because this is a *batch-level* failure — the
        // whole request was rejected, not one file. Consumers (notably the
        // promise API in ./upload-files) use a non-empty `errors` to decide
        // whether to reject rather than resolve with partial results.
        failBatch(presign.error);
        onError?.(presign.error);
        return;
      }

      await onStart?.(fileMetadata);

      // Explicit zero so consumers can render a determinate bar the moment
      // validation passes, before any bytes move.
      lastReportedProgress = 0;
      onProgress?.(0);

      const settled = await Promise.all(
        resolved.map((track, index) => transmit(track, presign.results[index]))
      );

      const completions = settled.filter(
        (result): result is NonNullable<typeof result> => result !== null
      );

      if (completions.length > 0) {
        await notifyCompletion(completions);
      }

      const succeeded = files.filter((f) => f.status === "success");
      if (succeeded.length > 0) await onSuccess?.(succeeded);
    } catch (error) {
      const failure = toUploadError(error, "NETWORK_ERROR");
      if (owns()) failBatch(failure);
      onError?.(failure);
    } finally {
      // Only the batch that still owns the engine may mark it idle. A superseded
      // batch settling late must not report the live batch as finished.
      if (owns()) {
        isUploading = false;
        tracks.clear();
        commit();
      }
    }
  }

  function cancel(fileId: string): void {
    tracks.get(fileId)?.controller.abort();
  }

  function cancelAll(): void {
    for (const track of tracks.values()) track.controller.abort();
  }

  function reset(): void {
    // Bumping the epoch orphans any in-flight batch, so its late completion
    // cannot resurrect state after the caller asked for a clean slate.
    currentEpoch++;
    cancelAll();
    tracks.clear();
    files = [];
    errors = [];
    batchError = undefined;
    isUploading = false;
    lastReportedProgress = null;
    snapshot = INITIAL_STATE;
    notify();
  }

  return {
    upload,
    cancel,
    cancelAll,
    reset,
    getSnapshot: () => snapshot,
    getBatchError: () => batchError,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
