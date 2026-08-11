/**
 * @fileoverview RFC 9457 Problem Details — the wire format for errors.
 *
 * [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) is the IETF standard for
 * HTTP error response bodies (July 2023; obsoletes RFC 7807). Using it instead
 * of an invented shape means:
 *
 * - Go, Python, Rust, and Java clients already have libraries for it, which
 *   matters directly for non-TypeScript server implementations.
 * - Extension members are explicitly permitted, so `code`, `retryable`, and
 *   `meta` are conforming rather than a fork of the standard.
 * - It is finished. There is no upstream to keep up with.
 *
 * This module is pure and framework-free: it is imported by the server handler
 * *and* by the client engine, so both sides speak one format described in one
 * place.
 *
 * @example The wire shape
 * ```jsonc
 * {
 *   "type": "https://pushduck.org/errors/file-too-large",
 *   "title": "File exceeds the maximum size",
 *   "status": 413,
 *   "detail": "photo.jpg is 9.0 MB; the limit is 5.0 MB",
 *   "instance": "/api/upload?route=imageUpload",
 *   "code": "FILE_TOO_LARGE",
 *   "retryable": false,
 *   "meta": { "limit": 5242880, "actual": 9437184 }
 * }
 * ```
 */

import {
  UploadError,
  type UploadErrorCode,
  UPLOAD_ERROR_CODES,
} from "./upload-error";

/** The media type RFC 9457 defines for these documents. */
export const PROBLEM_JSON_MEDIA_TYPE = "application/problem+json";

/**
 * An RFC 9457 problem document.
 *
 * The first five members are the standard's; the rest are extension members,
 * which the standard permits and which carry pushduck's semantics.
 */
export interface ProblemDetails {
  /** URI identifying the problem *type*. Stable; doubles as documentation. */
  type: string;
  /** Short human summary of the type. Stable across occurrences. */
  title: string;
  /** HTTP status generated for this occurrence. */
  status: number;
  /** Human explanation specific to *this* occurrence. */
  detail?: string;
  /** URI reference identifying the specific occurrence. */
  instance?: string;

  // ---- extension members ----
  /** Machine-readable code. Branch on this, not on `title` or `detail`. */
  code: UploadErrorCode;
  /** Whether retrying the identical request could plausibly succeed. */
  retryable: boolean;
  /** Structured context for this occurrence. */
  meta?: Record<string, unknown>;

  /**
   * The pre-RFC-9457 message field, for clients older than this release.
   *
   * pushduck ≤0.6 read `body.error` and fell back to
   * `Server error: <statusText>` when absent — so a server upgraded ahead of
   * its clients (the usual deployment order) would silently replace every
   * message with "Server error: Unauthorized". Emitting both keeps those
   * clients working.
   *
   * @deprecated Read `detail` and `code` instead. Removed in the next major.
   */
  error?: string;
}

/** Options controlling how much detail leaves the server. */
export interface ProblemDetailsOptions {
  /**
   * Include `detail` and `meta` for server-side failures.
   *
   * Off by default. A 5xx may describe our internals — bucket names, upstream
   * messages, stack context — none of which the caller needs. 4xx detail is
   * always included: it describes input the caller already has.
   */
  debug?: boolean;
}

/**
 * Serialises an {@link UploadError} to a problem document.
 *
 * Redaction is driven by status class rather than configuration, so the safe
 * behaviour is the default and requires no setup:
 *
 * - **4xx** — the caller's own request; `detail` and `meta` pass through.
 * - **5xx** — ours or upstream's; `detail` is replaced with the generic title
 *   and `meta` is dropped, unless `debug` is enabled.
 */
export function toProblemDetails(
  error: UploadError,
  options: ProblemDetailsOptions = {}
): ProblemDetails {
  const exposeDetail = error.isClientError || options.debug === true;

  return {
    type: error.type,
    title: error.title,
    status: error.status,
    detail: exposeDetail ? error.message : error.title,
    ...(error.instance ? { instance: error.instance } : {}),
    code: error.code,
    retryable: error.retryable,
    ...(exposeDetail && error.meta ? { meta: error.meta } : {}),
    // Mirrors `detail` for pre-0.7 clients. See the field's doc comment.
    error: exposeDetail ? error.message : error.title,
  };
}

/**
 * Reconstructs an {@link UploadError} from a problem document.
 *
 * Tolerant by design: a proxy, a CDN error page, or an older server may return
 * something that is not a valid problem document, and the client must still
 * produce a usable error rather than throwing while handling an error.
 *
 * @param body - Parsed response body, of unknown shape
 * @param status - HTTP status observed, used when the body omits or lies
 */
export function fromProblemDetails(
  body: unknown,
  status?: number
): UploadError {
  // `error` is widened here beyond the ProblemDetails declaration: very old
  // responses used a bare string, and some deployments wrap it in an object.
  const problem = (body ?? {}) as LegacyAwareProblem;

  const code = resolveCode(problem, status);
  const definition = UPLOAD_ERROR_CODES[code];

  const message =
    problem.detail ??
    (typeof problem.error === "string" ? problem.error : undefined) ??
    (typeof problem.error === "object" ? problem.error?.message : undefined) ??
    problem.title ??
    definition.title;

  return new UploadError(code, message, {
    status: problem.status ?? status ?? definition.status,
    retryable: problem.retryable ?? definition.retryable,
    meta: problem.meta,
    instance: problem.instance,
  });
}

/**
 * A response that may be a problem document, a pre-0.7 pushduck body, or
 * neither — an nginx page, a CDN error, a proxy's own JSON.
 */
type LegacyAwareProblem = Omit<Partial<ProblemDetails>, "error"> & {
  error?: string | { code?: string; message?: string };
};

/**
 * Determines the code from a response, in order of trustworthiness.
 *
 * 1. An explicit, recognised `code` extension member.
 * 2. The HTTP status, which every intermediary sets correctly.
 * 3. `INTERNAL_ERROR`.
 */
function resolveCode(
  problem: LegacyAwareProblem,
  status?: number
): UploadErrorCode {
  const declared =
    problem.code ??
    (typeof problem.error === "object" ? problem.error?.code : undefined);

  if (declared && declared in UPLOAD_ERROR_CODES) {
    return declared as UploadErrorCode;
  }

  return codeForStatus(problem.status ?? status);
}

/**
 * Best-effort code for a bare HTTP status.
 *
 * Used when a response carries no pushduck code at all — an nginx 502, a
 * CDN 504, or a server predating the error envelope.
 */
export function codeForStatus(status: number | undefined): UploadErrorCode {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 413:
      return "PAYLOAD_TOO_LARGE";
    case 415:
      return "FILE_TYPE_NOT_ALLOWED";
    case 429:
      return "RATE_LIMITED";
    case 502:
    case 503:
      return "STORAGE_UNAVAILABLE";
    case 504:
      return "TIMEOUT";
    default:
      return status !== undefined && status >= 400 && status < 500
        ? "BAD_REQUEST"
        : "INTERNAL_ERROR";
  }
}

/**
 * Builds the HTTP `Response` for an error.
 *
 * Sets the RFC 9457 media type so intermediaries and clients can recognise the
 * body without guessing.
 */
export function toProblemResponse(
  error: UploadError,
  options: ProblemDetailsOptions = {}
): Response {
  const problem = toProblemDetails(error, options);

  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: { "Content-Type": PROBLEM_JSON_MEDIA_TYPE },
  });
}
