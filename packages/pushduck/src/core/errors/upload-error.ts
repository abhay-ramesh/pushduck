/**
 * @fileoverview The error type shared by the server, the wire, and the client.
 *
 * ## Why this exists and what it is built on
 *
 * Errors are the one place a library is most tempted to adopt a framework's
 * conventions — a `TRPCError` shape, an Effect error channel, a `Result` type.
 * All of those move, and adopting one makes every consumer of the *other*
 * frameworks a second-class citizen.
 *
 * So this is built only on things that predate the current framework landscape
 * and will outlive it:
 *
 * - **RFC 9110 status codes** — universally understood by proxies, logs, and
 *   every HTTP client in every language.
 * - **RFC 9457 Problem Details** — the IETF standard for HTTP error bodies,
 *   with a defined extension mechanism. Libraries exist for it in Go, Python,
 *   Rust and Java, which matters directly for non-TypeScript ports.
 * - **ES2022 `Error` with `cause`** — the language's own error chaining.
 * - **Plain TypeScript string-literal unions** — narrowing is a language
 *   feature, not a dependency.
 *
 * Throwing (rather than returning a `Result`) is deliberate: rejection is the
 * platform idiom — `fetch` rejects, `await` throws. Consumers who prefer errors
 * as values can `.catch()` in one line; consumers of an effect system can lift
 * a rejection into their own error channel in one line. Neither direction is
 * privileged.
 *
 * @example Throwing from upload middleware
 * ```typescript
 * .middleware(async ({ req }) => {
 *   const user = await auth(req);
 *   if (!user) throw new UploadError("UNAUTHORIZED", "Sign in to upload");
 *   return { userId: user.id };
 * })
 * ```
 *
 * @example Handling on the client
 * ```typescript
 * try {
 *   await uploadFiles({ files, route: "imageUpload" });
 * } catch (error) {
 *   if (error instanceof UploadError && error.code === "FILE_TOO_LARGE") {
 *     alert(`Maximum size is ${error.meta?.limit} bytes`);
 *   }
 * }
 * ```
 */

/**
 * The stable, versioned vocabulary of upload failures.
 *
 * These are **pushduck's own** codes, deliberately not a mirror of any
 * framework's enum. Consumers map them to whatever their ecosystem wants; that
 * mapping lives in their code, so a rename upstream never breaks this library.
 *
 * Grouped by who is at fault, because that determines the status class, whether
 * a retry is meaningful, and whether the detail is safe to expose.
 */
export type UploadErrorCode =
  // ---- Caller's request is wrong: 4xx, not retryable ----
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "FILE_TOO_LARGE"
  | "FILE_TYPE_NOT_ALLOWED"
  | "TOO_MANY_FILES"
  | "PAYLOAD_TOO_LARGE"
  // ---- Caller is being throttled: 429, retryable later ----
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  // ---- Something upstream failed: 5xx, retryable ----
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_ACCESS_DENIED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  // ---- Our fault: 5xx, not retryable without a fix ----
  | "CONFIG_INVALID"
  | "INTERNAL_ERROR"
  // ---- Client-side only ----
  | "UPLOAD_CANCELLED";

/** Static facts about a code: how it maps to HTTP and whether retrying helps. */
interface CodeDefinition {
  /** RFC 9110 status this code maps to. */
  status: number;
  /** Short, stable, human-readable summary. Same for every occurrence. */
  title: string;
  /**
   * Whether retrying the identical request could plausibly succeed.
   *
   * Consumed directly by retry policies — TanStack Query's `retry`, a
   * `Schedule`, or a hand-rolled backoff — none of which can infer this from a
   * message string.
   */
  retryable: boolean;
}

/**
 * The single source of truth mapping each code to its HTTP and retry semantics.
 *
 * Exported so a non-TypeScript implementation can be generated from it, and so
 * the documentation cannot drift from the code.
 */
export const UPLOAD_ERROR_CODES: Readonly<
  Record<UploadErrorCode, CodeDefinition>
> = Object.freeze({
  UNAUTHORIZED: {
    status: 401,
    title: "Authentication required",
    retryable: false,
  },
  FORBIDDEN: { status: 403, title: "Not allowed", retryable: false },
  NOT_FOUND: { status: 404, title: "Not found", retryable: false },
  BAD_REQUEST: { status: 400, title: "Malformed request", retryable: false },
  VALIDATION_FAILED: {
    status: 400,
    title: "File failed validation",
    retryable: false,
  },
  FILE_TOO_LARGE: {
    status: 413,
    title: "File exceeds the maximum size",
    retryable: false,
  },
  FILE_TYPE_NOT_ALLOWED: {
    status: 415,
    title: "File type is not allowed",
    retryable: false,
  },
  TOO_MANY_FILES: {
    status: 400,
    title: "Too many files in one request",
    retryable: false,
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    title: "Request body is too large",
    retryable: false,
  },

  RATE_LIMITED: { status: 429, title: "Rate limit exceeded", retryable: true },
  QUOTA_EXCEEDED: { status: 429, title: "Quota exceeded", retryable: true },

  STORAGE_UNAVAILABLE: {
    status: 502,
    title: "Storage provider unavailable",
    retryable: true,
  },
  STORAGE_ACCESS_DENIED: {
    // 502 rather than 403: the *caller* is authorised; our credentials are not.
    // Reporting 403 would wrongly tell the client to re-authenticate.
    status: 502,
    title: "Storage rejected our credentials",
    retryable: false,
  },
  NETWORK_ERROR: { status: 502, title: "Network failure", retryable: true },
  TIMEOUT: { status: 504, title: "Operation timed out", retryable: true },

  CONFIG_INVALID: {
    status: 500,
    title: "Upload is misconfigured",
    retryable: false,
  },
  INTERNAL_ERROR: { status: 500, title: "Internal error", retryable: false },

  UPLOAD_CANCELLED: { status: 499, title: "Upload cancelled", retryable: false },
});

/** Base URI for the `type` member of a problem document. */
const ERROR_TYPE_BASE = "https://pushduck.org/errors/";

/** Converts `FILE_TOO_LARGE` to the documentation URI `…/file-too-large`. */
export function errorTypeUri(code: UploadErrorCode): string {
  return ERROR_TYPE_BASE + code.toLowerCase().replace(/_/g, "-");
}

/** Options accepted by the {@link UploadError} constructor. */
export interface UploadErrorOptions extends ErrorOptions {
  /**
   * Structured, machine-readable context for this occurrence.
   *
   * Deliberately `Record<string, unknown>` rather than a schema type — the
   * error path must not depend on a validation library.
   */
  meta?: Record<string, unknown>;
  /** Override the status implied by the code. Rarely needed. */
  status?: number;
  /** Override retryability. Rarely needed. */
  retryable?: boolean;
  /** The request path this failure relates to, for the `instance` member. */
  instance?: string;
}

/**
 * A pushduck upload failure.
 *
 * The same class is thrown on the server, serialised to RFC 9457 on the wire,
 * and reconstructed on the client — so `code`, `status`, `retryable`, and
 * `meta` survive the network hop rather than collapsing to a string.
 */
export class UploadError extends Error {
  /**
   * Declared as `string` rather than a literal so subclasses such as
   * `UploadBatchError` can set their own name. `isUploadError` checks the
   * runtime value, not the type.
   */
  override readonly name: string = "UploadError";

  /** Stable machine-readable code. Branch on this, never on `message`. */
  readonly code: UploadErrorCode;

  /** RFC 9110 status this failure maps to. */
  readonly status: number;

  /** Whether retrying the identical request could plausibly succeed. */
  readonly retryable: boolean;

  /** Structured context for this occurrence. */
  readonly meta?: Record<string, unknown>;

  /** The request this failure relates to, when known. */
  readonly instance?: string;

  constructor(
    code: UploadErrorCode,
    message?: string,
    options: UploadErrorOptions = {}
  ) {
    const definition = UPLOAD_ERROR_CODES[code] ?? UPLOAD_ERROR_CODES.INTERNAL_ERROR;

    // `cause` is passed through to the ES2022 Error constructor, preserving the
    // underlying failure rather than flattening it into a string.
    super(message ?? definition.title, { cause: options.cause });

    this.code = code;
    this.status = options.status ?? definition.status;
    this.retryable = options.retryable ?? definition.retryable;
    this.meta = options.meta;
    this.instance = options.instance;

    // Keeps the constructor frame out of the stack in V8.
    if (Error.captureStackTrace) Error.captureStackTrace(this, UploadError);
  }

  /** Short, stable summary for this code. Identical for every occurrence. */
  get title(): string {
    return (
      UPLOAD_ERROR_CODES[this.code] ?? UPLOAD_ERROR_CODES.INTERNAL_ERROR
    ).title;
  }

  /** Documentation URI identifying this error class. */
  get type(): string {
    return errorTypeUri(this.code);
  }

  /**
   * True when the failure is attributable to the caller's request.
   *
   * Drives redaction: a 4xx describes input the caller already has, so its
   * detail is safe to return; a 5xx may describe our internals.
   */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

/**
 * Codes that describe the *request*, not one file within it.
 *
 * A batch presign runs validation per file, so one rejected file must not fail
 * the other nine — those failures are reported per file with a 200. But a
 * failure that applies to the whole request (the caller is not signed in, the
 * account is over quota, our credentials are wrong) is not a property of any
 * one file: reporting it N times inside a 200 would hide it from every status
 * check, proxy, retry policy, and alert.
 *
 * These abort the batch and surface as the appropriate HTTP status.
 */
const REQUEST_SCOPED: ReadonlySet<UploadErrorCode> = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "NOT_FOUND",
  "BAD_REQUEST",
  "PAYLOAD_TOO_LARGE",
  "CONFIG_INVALID",
  "STORAGE_ACCESS_DENIED",
  "INTERNAL_ERROR",
]);

/**
 * Whether a failure applies to the whole request rather than a single file.
 *
 * @see {@link REQUEST_SCOPED}
 */
export function isRequestScoped(code: UploadErrorCode): boolean {
  return REQUEST_SCOPED.has(code);
}

/**
 * Type guard for {@link UploadError}.
 *
 * Prefer this over `instanceof` at module boundaries: duplicate copies of the
 * package, or a value that crossed a realm, break `instanceof` while this
 * structural check still holds.
 */
export function isUploadError(value: unknown): value is UploadError {
  return (
    value instanceof Error &&
    // Checks shape rather than the `name` label, because subclasses such as
    // UploadBatchError set their own name.
    typeof (value as UploadError).code === "string" &&
    typeof (value as UploadError).status === "number"
  );
}

/**
 * Coerces any thrown value into an {@link UploadError}.
 *
 * A bare `throw new Error("…")` from user middleware becomes `INTERNAL_ERROR`
 * with a 500 — the honest reading of an unhandled exception — while the
 * original is preserved as `cause`.
 */
export function toUploadError(
  value: unknown,
  fallbackCode: UploadErrorCode = "INTERNAL_ERROR"
): UploadError {
  if (isUploadError(value)) return value;

  if (value instanceof Error) {
    return new UploadError(fallbackCode, value.message, { cause: value });
  }

  return new UploadError(fallbackCode, String(value), { cause: value });
}
