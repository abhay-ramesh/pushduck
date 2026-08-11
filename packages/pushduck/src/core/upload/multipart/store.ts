/**
 * @fileoverview Persisting an in-progress multipart upload, so it can resume.
 *
 * Resume is the reason multipart matters on mobile. A network drop — lift,
 * tunnel, wifi-to-cellular handoff — currently restarts a 500 MB file from
 * zero, on a metered connection. Once parts commit independently, the client
 * only has to remember which ones landed.
 *
 * ## Why the store is injectable
 *
 * `localStorage` does not exist in React Native, Workers, Deno Deploy, or any
 * server-side runtime, and a test needs determinism rather than a real one. So
 * this is an interface with a memory implementation by default, exactly like
 * `transport`, `fetcher` and `now`.
 *
 * ## Why a fingerprint, not a filename
 *
 * A resume record keyed on filename alone is a corruption bug waiting to
 * happen: pick `report.pdf`, upload half, replace it with a *different*
 * `report.pdf`, and the remaining parts are stitched onto the first file's
 * committed parts. The object completes successfully and its contents are
 * garbage. The fingerprint makes that a cache miss instead.
 */

import type { UploadInput } from "../../../types";

/** What is remembered about an interrupted upload. */
export interface ResumableUpload {
  /** Opaque server session token, replayed on later calls. */
  session: string;
  /** Object key the parts assemble into. */
  key: string;
  /** Uniform part size agreed at init. Part ranges derive from it. */
  partSize: number;
  /** Total file size, so the final part's range is computable. */
  totalSize: number;
  /** Identifies the exact file this session belongs to. */
  fingerprint: string;
  /** Route the session was created on. */
  route: string;
  /** When the record was written, so stale entries can be dropped. */
  createdAt: number;
}

/**
 * Where interrupted uploads are remembered.
 *
 * Deliberately tiny and synchronous-friendly: implementations may be async
 * (`AsyncStorage`) or not (`localStorage`), so every method returns a promise
 * and callers await.
 */
export interface UploadStore {
  get(fingerprint: string): Promise<ResumableUpload | undefined>;
  set(record: ResumableUpload): Promise<void>;
  delete(fingerprint: string): Promise<void>;
}

/**
 * Identifies a file well enough to refuse a mismatched resume.
 *
 * Uses name, size and last-modified time where available. A browser `File`
 * exposes all three; React Native picker assets expose no reliable timestamp,
 * so those fall back to name and size — weaker, but the size check alone stops
 * the common "different file, same name" case, and a same-name same-size
 * replacement is rare enough to accept against the cost of hashing a
 * multi-gigabyte file on a phone.
 */
export function fingerprintFile(
  input: UploadInput,
  meta: { name: string; size: number },
  route: string
): string {
  const lastModified =
    typeof (input as File)?.lastModified === "number"
      ? (input as File).lastModified
      : 0;

  return [route, meta.name, meta.size, lastModified].join(":");
}

/**
 * In-memory store, the default.
 *
 * Survives a network drop within the same page or app session, which is the
 * common case, but not a reload. Persisting across reloads means opting into a
 * real store — see {@link createWebStore}.
 */
export function createMemoryStore(): UploadStore {
  const records = new Map<string, ResumableUpload>();

  return {
    async get(fingerprint) {
      return records.get(fingerprint);
    },
    async set(record) {
      records.set(record.fingerprint, record);
    },
    async delete(fingerprint) {
      records.delete(fingerprint);
    },
  };
}

/** How long a stored session is considered usable. */
const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * A store backed by a `Storage` implementation — `localStorage` by default.
 *
 * Opt in explicitly, because persisting upload sessions has consequences the
 * library should not assume: the record names an object key, and it survives
 * until it expires or the upload finishes.
 *
 * Records older than `maxAgeMs` are ignored and removed. Providers expire
 * abandoned sessions on their own schedule — 7 days on R2, 30 on Spaces, never
 * on AWS — so a stale record would otherwise resume into a session the
 * provider has already discarded.
 *
 * @example
 * ```typescript
 * createUploadEngine({
 *   route: "videoUpload",
 *   multipart: { store: createWebStore() },
 * });
 * ```
 */
export function createWebStore(options: {
  storage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  keyPrefix?: string;
  maxAgeMs?: number;
  now?: () => number;
} = {}): UploadStore {
  const {
    keyPrefix = "pushduck:multipart:",
    maxAgeMs = DEFAULT_MAX_AGE_MS,
    now = Date.now,
  } = options;

  // Resolved lazily: `localStorage` does not exist during SSR, and merely
  // constructing the store must not throw there.
  const storage = () =>
    options.storage ??
    (typeof localStorage !== "undefined" ? localStorage : undefined);

  const storageKey = (fingerprint: string) => `${keyPrefix}${fingerprint}`;

  return {
    async get(fingerprint) {
      const store = storage();
      if (!store) return undefined;

      // A quota-exceeded or privacy-mode failure must degrade to "no resume",
      // never break the upload it was meant to help.
      try {
        const raw = store.getItem(storageKey(fingerprint));
        if (!raw) return undefined;

        const record = JSON.parse(raw) as ResumableUpload;

        if (now() - record.createdAt > maxAgeMs) {
          store.removeItem(storageKey(fingerprint));
          return undefined;
        }

        return record;
      } catch {
        return undefined;
      }
    },

    async set(record) {
      try {
        storage()?.setItem(storageKey(record.fingerprint), JSON.stringify(record));
      } catch {
        // Full or unavailable storage costs a resume, not an upload.
      }
    },

    async delete(fingerprint) {
      try {
        storage()?.removeItem(storageKey(fingerprint));
      } catch {
        // As above.
      }
    },
  };
}
