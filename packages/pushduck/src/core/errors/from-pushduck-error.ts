/**
 * @fileoverview Bridges the pre-existing `PushduckError` into `UploadError`.
 *
 * `core/types/errors.ts` already defines `PushduckError` with 19 infrastructure
 * codes, and `core/storage/client.ts` throws it from 7 places. Those throws are
 * correct and stay — this module translates them at the request boundary so the
 * HTTP layer speaks one vocabulary.
 *
 * Keeping the two sets separate is deliberate. `PushduckErrorCode` describes
 * *what went wrong inside the library* (`S3_BUCKET_NOT_FOUND`,
 * `PROVIDER_CONFIG_INVALID`); `UploadErrorCode` describes *what the caller
 * should be told* (`STORAGE_UNAVAILABLE`, `CONFIG_INVALID`). Several internal
 * codes intentionally collapse to one external code, because the caller cannot
 * act on the difference.
 */

import {
  isPushduckError,
  type PushduckErrorCode,
} from "../types/errors";
import { toUploadError, UploadError, type UploadErrorCode } from "./upload-error";

/**
 * Internal code → the code the caller is told.
 *
 * Where several internal failures are indistinguishable to a caller, they map
 * to the same external code on purpose: an invalid bucket name and a missing
 * bucket are both "storage is not usable right now" from outside.
 */
const CODE_MAP: Record<PushduckErrorCode, UploadErrorCode> = {
  // Our configuration is wrong — not retryable, not the caller's fault.
  CONFIG_INVALID: "CONFIG_INVALID",
  CONFIG_MISSING: "CONFIG_INVALID",
  PROVIDER_UNSUPPORTED: "CONFIG_INVALID",
  PROVIDER_CONFIG_INVALID: "CONFIG_INVALID",

  // Storage rejected us, or is unreachable.
  S3_CONNECTION_FAILED: "STORAGE_UNAVAILABLE",
  S3_BUCKET_NOT_FOUND: "STORAGE_UNAVAILABLE",
  S3_ACCESS_DENIED: "STORAGE_ACCESS_DENIED",
  S3_INVALID_CREDENTIALS: "STORAGE_ACCESS_DENIED",

  // The request or its files are the problem.
  FILE_NOT_FOUND: "NOT_FOUND",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  FILE_TYPE_NOT_ALLOWED: "FILE_TYPE_NOT_ALLOWED",
  FILE_VALIDATION_FAILED: "VALIDATION_FAILED",

  // Transfer-level failures.
  UPLOAD_FAILED: "STORAGE_UNAVAILABLE",
  DOWNLOAD_FAILED: "STORAGE_UNAVAILABLE",
  PRESIGNED_URL_FAILED: "STORAGE_UNAVAILABLE",
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT_ERROR: "TIMEOUT",

  UNKNOWN_ERROR: "INTERNAL_ERROR",
};

/**
 * Normalises anything thrown on the server into an {@link UploadError}.
 *
 * Handles three cases:
 * 1. Already an `UploadError` — returned unchanged.
 * 2. A `PushduckError` from storage or config — translated through
 *    {@link CODE_MAP}, keeping the original as `cause` and its context as `meta`.
 * 3. Anything else, including a bare `throw new Error()` from user
 *    middleware — becomes `INTERNAL_ERROR` / 500, which is the honest reading
 *    of an unhandled exception.
 */
export function normalizeServerError(
  value: unknown,
  fallbackCode: UploadErrorCode = "INTERNAL_ERROR"
): UploadError {
  if (isPushduckError(value)) {
    const code = CODE_MAP[value.code] ?? "INTERNAL_ERROR";

    return new UploadError(code, value.message, {
      cause: value,
      // The original context is diagnostic detail; redaction still applies, so
      // it only leaves the server for 4xx or when debug is enabled.
      meta: { pushduckCode: value.code, ...value.context },
    });
  }

  return toUploadError(value, fallbackCode);
}
