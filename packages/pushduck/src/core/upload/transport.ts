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

/**
 * A single request to transmit one file's bytes to storage.
 */
export interface UploadTransportRequest {
  /** Presigned URL to PUT the bytes to. */
  url: string;
  /** The bytes to send. */
  body: Blob;
  /** Headers that must accompany the request for the signature to validate. */
  headers: Record<string, string>;
  /** Aborts the in-flight transfer when signalled. */
  signal?: AbortSignal;
  /**
   * Called as bytes are transmitted. Transports that cannot observe progress
   * (see {@link fetchTransport}) simply never call it.
   */
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}

/**
 * Transmits one file's bytes to storage.
 *
 * Resolves on a 2xx response. Rejects on a non-2xx status, a network failure,
 * or an abort.
 */
export type UploadTransport = (request: UploadTransportRequest) => Promise<void>;

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
export const xhrTransport: UploadTransport = ({
  url,
  body,
  headers,
  signal,
  onProgress,
}) => {
  return new Promise<void>((resolve, reject) => {
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

    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
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
      reject(new UploadAbortedError());
    };

    xhr.open("PUT", url);

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

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
  };
}

/**
 * Convenience instance of {@link createFetchTransport} bound to the global fetch.
 */
export const fetchTransport: UploadTransport = (request) =>
  createFetchTransport()(request);
