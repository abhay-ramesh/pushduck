/**
 * @fileoverview Pluggable transports for the bytes-to-storage leg of an upload.
 *
 * The engine owns *orchestration*; a transport owns *transmission*. Separating
 * them means the engine can be tested with an in-memory transport (no network,
 * no DOM), and lets runtimes without `XMLHttpRequest` — Node, Deno, Workers,
 * server-side rendering — supply their own.
 *
 * `XMLHttpRequest` is referenced lazily inside {@link xhrTransport} rather than
 * at module scope, so importing this module never crashes during SSR.
 */

import { UploadError } from "../errors";

/**
 * A single request to transmit one file's bytes to storage.
 */
export interface UploadTransportRequest {
  /** Presigned URL to PUT the bytes to. */
  url: string;
  /**
   * The bytes to send.
   *
   * A `Blob` on the web, where a slice is a free view into bytes the browser
   * already holds. A `Uint8Array` where the platform can only hand back a byte
   * range it has read — React Native reading a part off disk, for instance.
   * Both are accepted by `XMLHttpRequest.send` and by `fetch`.
   */
  body: Blob | Uint8Array<ArrayBuffer>;
  /** Headers that must accompany the request for the signature to validate. */
  headers: Record<string, string>;
  /** Aborts the in-flight transfer when signalled. */
  signal?: AbortSignal;
  /**
   * Called as bytes are transmitted. Transports that cannot observe progress
   * (see {@link fetchTransport}) simply never call it.
   */
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
  /**
   * Fail if no bytes move for this many milliseconds. `0` disables it.
   *
   * Deliberately *not* `XMLHttpRequest.timeout`, which bounds the whole
   * request: any value permitting a legitimate multi-gigabyte upload is far
   * too large to catch a stall, and any value small enough to catch a stall
   * kills healthy long uploads. An idle timer distinguishes "slow" from
   * "dead"; a total timer cannot.
   *
   * @default 120000
   */
  stallTimeoutMs?: number;
}

/**
 * What a transport reports back after a successful transfer.
 *
 * Only multipart needs this: `CompleteMultipartUpload` requires each part's
 * `ETag`, and the only place to get it is the part's own response.
 */
export interface UploadTransportResult {
  /**
   * Entity tag from the response, quotes included.
   *
   * In a browser this is `null` unless the bucket's CORS policy lists it in
   * `ExposeHeaders` — a cross-origin response header is invisible to
   * JavaScript otherwise. That failure is silent and baffling, so the
   * multipart path raises a specific error naming the fix rather than letting
   * `CompleteMultipartUpload` fail with `InvalidPart` much later.
   */
  etag?: string;
}

/**
 * Transmits one file's bytes to storage.
 *
 * Resolves on a 2xx response. Rejects on a non-2xx status, a network failure,
 * or an abort.
 *
 * The result is optional: a transport that has no use for response headers —
 * or predates multipart — may resolve with nothing.
 */
export type UploadTransport = (
  request: UploadTransportRequest
) => Promise<UploadTransportResult | void>;

/** Error thrown when a transfer is cancelled via its abort signal. */
export class UploadAbortedError extends Error {
  readonly name = "UploadAbortedError";
  constructor(message = "Upload aborted") {
    super(message);
  }
}

/**
 * Default browser and React Native transport, built on `XMLHttpRequest`.
 *
 * XHR rather than `fetch` because it is the only transport with universally
 * supported **upload** progress events. `fetch` request-body streaming exists
 * but is unavailable in React Native and inconsistent across browsers.
 *
 * @throws {UploadAbortedError} If the request is aborted.
 * @throws {Error} On a non-2xx response or a network error.
 */
/**
 * How long a transfer may make no progress before it is considered dead.
 *
 * Two minutes is deliberately generous: a large part on a poor connection can
 * legitimately go quiet while the OS retransmits, and a false positive costs a
 * re-upload. It only has to be short enough that a user is not staring at a
 * frozen bar indefinitely, which the previous behaviour — no timeout at all —
 * allowed forever.
 */
const DEFAULT_STALL_TIMEOUT_MS = 120_000;

export const xhrTransport: UploadTransport = ({
  url,
  body,
  headers,
  signal,
  onProgress,
  stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS,
}) => {
  return new Promise<UploadTransportResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadAbortedError());
      return;
    }

    if (typeof XMLHttpRequest === "undefined") {
      reject(
        new Error(
          "[pushduck] XMLHttpRequest is unavailable in this runtime. Pass a " +
            "custom `transport` (for example `fetchTransport`) to createUploadEngine."
        )
      );
      return;
    }

    const xhr = new XMLHttpRequest();

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    /**
     * The stall watchdog.
     *
     * `stalled` records *why* the request was aborted, because `xhr.abort()`
     * fires `onabort` either way and the two cases must not be confused: a
     * user pressing cancel is final, while a stall is transient and should be
     * retried.
     */
    let stalled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    const clearWatchdog = () => {
      if (watchdog !== undefined) clearTimeout(watchdog);
      watchdog = undefined;
    };

    const armWatchdog = () => {
      if (!stallTimeoutMs) return;
      clearWatchdog();
      watchdog = setTimeout(() => {
        stalled = true;
        xhr.abort();
      }, stallTimeoutMs);
    };

    const cleanup = () => {
      clearWatchdog();
      signal?.removeEventListener("abort", onAbort);
    };

    xhr.upload.onprogress = (event) => {
      // Any byte movement means the connection is alive, so the clock restarts.
      armWatchdog();
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        // `getResponseHeader` returns null cross-origin unless the bucket
        // exposes ETag; the multipart path turns that into a specific error.
        // Optional call: React Native's XHR and some polyfills implement a
        // partial surface, and a single-PUT upload has no use for the ETag —
        // it must not fail merely because the header could not be read.
        resolve({ etag: xhr.getResponseHeader?.("ETag") ?? undefined });
      } else {
        reject(new Error(`Upload failed with status: ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error("Upload failed"));
    };

    xhr.onabort = () => {
      cleanup();

      // A stall is a transient network failure, not a cancellation: reporting
      // it as an abort would tell the retry layer the user asked to stop, and
      // the upload would fail permanently on a connection that recovered
      // seconds later.
      if (stalled) {
        reject(
          new UploadError(
            "TIMEOUT",
            `Upload stalled: no data transferred for ${stallTimeoutMs}ms`,
            { meta: { stallTimeoutMs, url } }
          )
        );
        return;
      }

      reject(new UploadAbortedError());
    };

    xhr.open("PUT", url);

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    // Armed before sending: a connection that is accepted and then goes
    // silent never fires a progress event, which is exactly the case this
    // exists to catch.
    armWatchdog();
    xhr.send(body);
  });
};

/**
 * Transport built on `fetch`, for runtimes without `XMLHttpRequest`.
 *
 * **Reports no progress.** The engine still tracks per-file status, and marks a
 * file 0% → 100% on completion, but intermediate progress, transfer rate, and
 * ETA are unavailable. Use {@link xhrTransport} wherever it exists.
 *
 * @param fetchImpl - Fetch implementation to use. Defaults to the global.
 */
export function createFetchTransport(
  fetchImpl: typeof fetch = fetch
): UploadTransport {
  return async ({ url, body, headers, signal }) => {
    const response = await fetchImpl(url, {
      method: "PUT",
      body,
      headers,
      signal,
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status: ${response.status}`);
    }

    return { etag: response.headers.get("etag") ?? undefined };
  };
}

/**
 * Convenience instance of {@link createFetchTransport} bound to the global fetch.
 */
export const fetchTransport: UploadTransport = (request) =>
  createFetchTransport()(request);
