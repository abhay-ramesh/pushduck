/**
 * @fileoverview Client-side multipart orchestration.
 *
 * Splits one file into parts, transfers them with bounded concurrency and
 * per-part retry, and asks the server to stitch them.
 *
 * ## The constraint this module is written against
 *
 * Multipart must be **invisible** above it. A caller sees the same
 * `S3UploadedFile` — same `progress`, `uploadSpeed`, `eta`, same status
 * transitions — whether a file went in one `PUT` or six hundred parts. So the
 * only thing reported outward is `(loadedBytes, totalBytes)`, exactly the
 * shape a single-`PUT` transport reports, and the engine's existing telemetry
 * maths turns it into the same fields it always did.
 *
 * Concurrency is what makes that non-trivial: several parts are in flight at
 * once, each reporting its own progress, and the aggregate has to be monotonic
 * rather than jumping about as parts start and finish.
 */

import { UploadError } from "../../errors";
import { UploadAbortedError, type UploadTransport } from "../transport";
import { planMultipart, type MultipartPlan } from "./plan";
import type { ResumableUpload, UploadStore } from "./store";

/** A part the provider has accepted. */
export interface CompletedPart {
  partNumber: number;
  etag: string;
}

/** Everything the orchestrator needs. All I/O is injected. */
export interface MultipartUploadOptions {
  /** The bytes. */
  blob: Blob;
  /** Descriptor sent to the server for validation and path generation. */
  file: { name: string; size: number; type: string };
  /** Route to upload through. */
  route: string;
  /** Upload endpoint. */
  endpoint: string;
  /** Client metadata, forwarded to middleware. */
  metadata?: unknown;
  /** Talks to the pushduck server. */
  fetcher: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  /** Transfers part bytes to storage. */
  transport: UploadTransport;
  /** Aborts the whole upload. */
  signal: AbortSignal;
  /** Parts in flight at once. */
  concurrency?: number;
  /** Attempts per part, including the first. */
  maxAttempts?: number;
  /**
   * Called as bytes land.
   *
   * Deliberately the same signature a single-`PUT` transport uses, so the
   * engine cannot tell the strategies apart.
   */
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
  /** Preferred part size; clamped to what the providers allow. */
  partSize?: number;
  /** Injectable for deterministic backoff in tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Where interrupted uploads are remembered. Omit to disable resume. */
  store?: UploadStore;
  /** Identifies this exact file, so a different one cannot resume into it. */
  fingerprint?: string;
  /** Clock, injectable for deterministic record ages. */
  now?: () => number;
}

/** What the caller gets back once the object exists. */
export interface MultipartUploadResult {
  key: string;
  url: string;
  metadata: unknown;
}

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_ATTEMPTS = 3;

/** Reads the server's JSON, raising a typed error when it refused. */
async function serverCall<T>(
  fetcher: MultipartUploadOptions["fetcher"],
  url: string,
  body: unknown
): Promise<T> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success === false) {
    const { fromProblemDetails } = await import("../../errors");
    throw fromProblemDetails(payload, response.status);
  }

  return payload as T;
}

/**
 * Uploads one file as multiple parts.
 *
 * On any failure the multipart session is aborted before rethrowing —
 * abandoned parts consume storage and are billed until removed, and AWS never
 * expires them on its own.
 */
export async function uploadFileMultipart(
  options: MultipartUploadOptions
): Promise<MultipartUploadResult> {
  const {
    blob,
    file,
    route,
    endpoint,
    metadata,
    fetcher,
    transport,
    signal,
    onProgress,
    concurrency = DEFAULT_CONCURRENCY,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;

  const { store, fingerprint, now = Date.now } = options;
  const base = `${endpoint}?route=${route}`;

  // 1. Resume if we already have a session for *this exact file*, otherwise
  //    start a new one. Middleware, validation and path generation run at
  //    init, exactly as they do for a single PUT.
  const resumed = await loadResumable({
    store,
    fingerprint,
    route,
    totalSize: file.size,
  });

  const init = resumed
    ? {
        session: resumed.session,
        key: resumed.key,
        partSize: resumed.partSize,
        metadata: undefined as unknown,
      }
    : await serverCall<{
        session: string;
        key: string;
        partSize: number;
        metadata: unknown;
      }>(fetcher, `${base}&action=multipart-init`, { file, metadata });

  if (!resumed && store && fingerprint) {
    // Recorded before any part is transferred: a drop during the very first
    // part should still be resumable.
    await store.set({
      session: init.session,
      key: init.key,
      partSize: init.partSize,
      totalSize: file.size,
      fingerprint,
      route,
      createdAt: now(),
    });
  }

  const plan: MultipartPlan = planMultipart(file.size, {
    partSize: init.partSize,
    threshold: 0,
  });

  /**
   * Bytes committed by parts that have finished, plus the live progress of
   * parts still in flight.
   *
   * Tracked separately because an in-flight part's contribution is replaced
   * when it completes; adding both would double-count and let the aggregate
   * exceed the file size.
   */
  let committedBytes = 0;
  const inFlightBytes = new Map<number, number>();

  const reportProgress = () => {
    if (!onProgress) return;
    let loaded = committedBytes;
    for (const bytes of inFlightBytes.values()) loaded += bytes;
    onProgress(Math.min(loaded, file.size), file.size);
  };

  const completed: CompletedPart[] = [];

  try {
    // 2. Ask the provider which parts it actually holds.
    //
    //    The server is the authority, not our record: a locally-noted part may
    //    have been written before the request truly failed, and a provider may
    //    have expired the session entirely. Reconciling here means a resume
    //    never re-uploads what landed and never assumes what did not.
    const alreadyUploaded = resumed
      ? await serverCall<{ parts: CompletedPart[] }>(
          fetcher,
          `${base}&action=multipart-parts`,
          { session: init.session }
        )
          .then((r) => r.parts ?? [])
          .catch(() => [])
      : [];

    for (const part of alreadyUploaded) {
      completed.push(part);
      const range = plan.parts.find((p) => p.partNumber === part.partNumber);
      if (range) committedBytes += range.size;
    }
    reportProgress();

    const done = new Set(alreadyUploaded.map((p) => p.partNumber));
    const remaining = plan.parts.filter((p) => !done.has(p.partNumber));

    // 3. Transfer what is left.
    await runWithConcurrency(remaining, concurrency, async (part) => {
      if (signal.aborted) throw new UploadAbortedError();

      const [{ url }] = await serverCall<
        Array<{ partNumber: number; url: string }>
      >(fetcher, `${base}&action=multipart-sign`, {
        session: init.session,
        partNumbers: [part.partNumber],
      }).then((r) => (Array.isArray(r) ? r : (r as any).results));

      const etag = await transferPart({
        url,
        body: blob.slice(part.start, part.end),
        contentType: file.type,
        signal,
        transport,
        maxAttempts,
        sleep,
        onPartProgress: (loaded) => {
          inFlightBytes.set(part.partNumber, loaded);
          reportProgress();
        },
      });

      // Swap the in-flight contribution for a committed one, so the aggregate
      // never counts the same bytes twice.
      inFlightBytes.delete(part.partNumber);
      committedBytes += part.size;
      reportProgress();

      completed.push({ partNumber: part.partNumber, etag });
    });

    // 4. Stitch. Parts must be ascending; providers reject an unordered list.
    const result = await serverCall<{ key: string; url: string }>(
      fetcher,
      `${base}&action=multipart-complete`,
      {
        session: init.session,
        parts: completed.sort((a, b) => a.partNumber - b.partNumber),
        file,
        metadata: init.metadata,
      }
    );

    // The session is finished; a stale record would resume into an upload that
    // no longer exists.
    if (store && fingerprint) await store.delete(fingerprint);

    return { key: result.key, url: result.url, metadata: init.metadata };
  } catch (error) {
    // How a failure is classified decides whether the transferred bytes
    // survive, so this distinction *is* the value of resume:
    //
    // - **Interrupted** — the network dropped, a request timed out. Keep the
    //   session and the record. These are precisely the failures resume
    //   exists for, and aborting would discard everything already uploaded:
    //   on mobile, usually most of the file, over metered data.
    // - **Cancelled or permanently failed** — the user pressed cancel, auth
    //   was rejected, the bucket is misconfigured. Abort and drop the record:
    //   nothing here succeeds on retry, and abandoned parts are billed until
    //   removed.
    //
    // Keeping a session costs storage bounded by the provider's own expiry —
    // 7 days on R2, 30 on Spaces — or by a lifecycle rule on AWS, which has no
    // default and is called out in the docs.
    const cancelled = error instanceof UploadAbortedError || signal.aborted;
    const permanent = error instanceof UploadError && !error.retryable;

    if (!cancelled && !permanent && store && fingerprint) {
      throw error;
    }

    if (store && fingerprint) {
      await store.delete(fingerprint).catch(() => undefined);
    }

    // Best effort: a failed abort must not replace the real error.
    await serverCall(fetcher, `${base}&action=multipart-abort`, {
      session: init.session,
    }).catch(() => undefined);

    throw error;
  }
}

/**
 * Loads a stored session, if one belongs to this exact file.
 *
 * Every mismatch is a miss rather than an error: resuming is an optimisation,
 * and the correct fallback is always a fresh upload.
 */
async function loadResumable(options: {
  store?: UploadStore;
  fingerprint?: string;
  route: string;
  totalSize: number;
}): Promise<ResumableUpload | undefined> {
  const { store, fingerprint, route, totalSize } = options;
  if (!store || !fingerprint) return undefined;

  const record = await store.get(fingerprint).catch(() => undefined);
  if (!record) return undefined;

  // Defence in depth. The fingerprint already encodes route and size, but a
  // record that disagrees with the file in front of us must never be used —
  // stitching one file's parts onto another produces a corrupt object that
  // completes successfully.
  if (
    record.route !== route ||
    record.totalSize !== totalSize ||
    record.fingerprint !== fingerprint
  ) {
    await store.delete(fingerprint).catch(() => undefined);
    return undefined;
  }

  return record;
}

/** Transfers one part, retrying transient failures. */
async function transferPart(options: {
  url: string;
  body: Blob;
  contentType: string;
  signal: AbortSignal;
  transport: UploadTransport;
  maxAttempts: number;
  sleep: (ms: number) => Promise<void>;
  onPartProgress: (loadedBytes: number) => void;
}): Promise<string> {
  const { url, body, signal, transport, maxAttempts, sleep } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await transport({
        url,
        body,
        // No Content-Type: it is not part of the part signature, and sending a
        // header the signature did not cover makes some providers reject it.
        headers: {},
        signal,
        onProgress: (loaded) => options.onPartProgress(loaded),
      });

      const etag = result?.etag;
      if (!etag) {
        // Almost always CORS: a cross-origin response header is invisible to
        // JavaScript unless the bucket exposes it. Without this the failure
        // surfaces much later as InvalidPart, with no hint of the cause.
        throw new UploadError(
          "CONFIG_INVALID",
          "The storage response did not expose an ETag, which multipart uploads require. " +
            'Add `"ExposeHeaders": ["ETag"]` to the bucket\'s CORS configuration.',
          { meta: { url } }
        );
      }

      return etag;
    } catch (error) {
      lastError = error;

      // A cancelled upload and a misconfigured bucket are both permanent;
      // retrying either wastes the user's bandwidth to reach the same end.
      if (error instanceof UploadAbortedError || signal.aborted) throw error;
      if (error instanceof UploadError && !error.retryable) throw error;

      if (attempt < maxAttempts) {
        // Exponential backoff. Mobile networks recover in seconds, and
        // hammering a throttled provider extends the outage.
        await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
        // Progress from the abandoned attempt must not persist.
        options.onPartProgress(0);
      }
    }
  }

  throw lastError;
}

/**
 * Runs tasks with a bounded number in flight.
 *
 * Unbounded `Promise.all` over a thousand parts would open a thousand
 * connections, which browsers queue, mobile radios choke on, and providers
 * rate-limit. A fixed pool keeps the pipe full without any of that.
 */
async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers: Promise<void>[] = [];

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) return;
      await run(item);
    }
  };

  for (let i = 0; i < Math.max(1, Math.min(limit, items.length)); i++) {
    workers.push(worker());
  }

  // `all`, not `allSettled`: the first failure should stop the upload, and the
  // caller aborts the session on the way out.
  await Promise.all(workers);
}
