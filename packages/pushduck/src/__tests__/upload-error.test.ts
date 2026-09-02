/**
 * @fileoverview Tests for the ecosystem-neutral error type and wire format.
 *
 * The contract these pin down is deliberately built on standards rather than
 * any framework's conventions:
 *
 * - status codes follow RFC 9110, so proxies and every HTTP client agree
 * - the body follows RFC 9457, so non-TypeScript ports can parse it
 * - `cause` follows ES2022, so the underlying failure is never flattened
 * - `code` is a plain string union, so narrowing needs no library
 */

import { describe, expect, it } from "vitest";
import {
  codeForStatus,
  fromProblemDetails,
  isUploadError,
  PROBLEM_JSON_MEDIA_TYPE,
  toProblemDetails,
  toProblemResponse,
  toUploadError,
  UPLOAD_ERROR_CODES,
  UploadError,
} from "../core/errors";

describe("UploadError", () => {
  it("derives status, title and retryability from the code", () => {
    const error = new UploadError("FILE_TOO_LARGE");

    expect(error.status).toBe(413);
    expect(error.title).toBe("File exceeds the maximum size");
    expect(error.retryable).toBe(false);
    expect(error.message).toBe("File exceeds the maximum size");
  });

  it("is a real Error, so existing catch blocks keep working", () => {
    const error = new UploadError("UNAUTHORIZED");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UploadError");
    expect(typeof error.stack).toBe("string");
  });

  it("preserves the underlying failure via ES2022 `cause`", () => {
    // Flattening the original into a string would lose the stack and any
    // provider-specific fields — the thing you actually need when debugging.
    const original = new Error("ECONNREFUSED");
    const error = new UploadError("NETWORK_ERROR", "Could not reach storage", {
      cause: original,
    });

    expect(error.cause).toBe(original);
  });

  it("carries structured meta rather than only a message", () => {
    const error = new UploadError("QUOTA_EXCEEDED", "Monthly limit reached", {
      meta: { limit: 100, used: 100, resetsAt: "2026-09-01" },
    });

    expect(error.meta).toEqual({
      limit: 100,
      used: 100,
      resetsAt: "2026-09-01",
    });
  });

  it("exposes a documentation URI derived from the code", () => {
    expect(new UploadError("FILE_TOO_LARGE").type).toBe(
      "https://pushduck.org/errors/file-too-large"
    );
  });

  it("classifies storage credential failures as 502, not 403", () => {
    // A 403 would tell the caller to re-authenticate, but the caller is fine —
    // *our* credentials are the problem.
    const error = new UploadError("STORAGE_ACCESS_DENIED");

    expect(error.status).toBe(502);
    expect(error.isClientError).toBe(false);
  });

  it("marks throttling and upstream failures as retryable", () => {
    expect(new UploadError("RATE_LIMITED").retryable).toBe(true);
    expect(new UploadError("STORAGE_UNAVAILABLE").retryable).toBe(true);
    expect(new UploadError("TIMEOUT").retryable).toBe(true);

    expect(new UploadError("FILE_TOO_LARGE").retryable).toBe(false);
    expect(new UploadError("UNAUTHORIZED").retryable).toBe(false);
  });

  it("keeps every code's status in the right class", () => {
    // Guards the table itself: a typo here would silently misroute a failure.
    for (const [code, def] of Object.entries(UPLOAD_ERROR_CODES)) {
      expect(def.status, `${code} status`).toBeGreaterThanOrEqual(400);
      expect(def.status, `${code} status`).toBeLessThan(600);
      expect(def.title.length, `${code} title`).toBeGreaterThan(0);
    }
  });
});

describe("isUploadError", () => {
  it("recognises an UploadError", () => {
    expect(isUploadError(new UploadError("UNAUTHORIZED"))).toBe(true);
  });

  it("rejects a plain Error and non-errors", () => {
    expect(isUploadError(new Error("nope"))).toBe(false);
    expect(isUploadError("nope")).toBe(false);
    expect(isUploadError(null)).toBe(false);
  });

  it("recognises a structurally identical error from another package copy", () => {
    // Duplicate installs and cross-realm values break `instanceof`; the guard
    // is structural so it keeps working.
    const foreign = new Error("dup");
    Object.assign(foreign, {
      name: "UploadError",
      code: "UNAUTHORIZED",
      status: 401,
    });

    expect(isUploadError(foreign)).toBe(true);
  });
});

describe("toUploadError", () => {
  it("passes an UploadError through unchanged", () => {
    const original = new UploadError("FORBIDDEN");
    expect(toUploadError(original)).toBe(original);
  });

  it("treats a bare Error as an internal error, preserving it as cause", () => {
    // A `throw new Error()` from user middleware is an unhandled exception, so
    // 500 is the honest reading — but the original must not be lost.
    const original = new Error("something broke");
    const converted = toUploadError(original);

    expect(converted.code).toBe("INTERNAL_ERROR");
    expect(converted.status).toBe(500);
    expect(converted.message).toBe("something broke");
    expect(converted.cause).toBe(original);
  });

  it("handles non-Error throws", () => {
    expect(toUploadError("a string").code).toBe("INTERNAL_ERROR");
    expect(toUploadError({ weird: true }).message).toBe("[object Object]");
  });

  it("accepts an explicit fallback code", () => {
    expect(toUploadError(new Error("x"), "VALIDATION_FAILED").code).toBe(
      "VALIDATION_FAILED"
    );
  });
});

describe("RFC 9457 serialisation", () => {
  it("emits every standard member plus pushduck's extensions", () => {
    const error = new UploadError("FILE_TOO_LARGE", "photo.jpg is 9 MB", {
      meta: { limit: 5242880, actual: 9437184 },
      instance: "/api/upload?route=imageUpload",
    });

    expect(toProblemDetails(error)).toEqual({
      type: "https://pushduck.org/errors/file-too-large",
      title: "File exceeds the maximum size",
      status: 413,
      detail: "photo.jpg is 9 MB",
      instance: "/api/upload?route=imageUpload",
      code: "FILE_TOO_LARGE",
      retryable: false,
      meta: { limit: 5242880, actual: 9437184 },
      // Legacy mirror of `detail` for pre-0.7 clients.
      error: "photo.jpg is 9 MB",
    });
  });

  it("passes 4xx detail through — it describes the caller's own request", () => {
    const problem = toProblemDetails(
      new UploadError("VALIDATION_FAILED", "png is not accepted", {
        meta: { accepted: ["image/jpeg"] },
      })
    );

    expect(problem.detail).toBe("png is not accepted");
    expect(problem.meta).toEqual({ accepted: ["image/jpeg"] });
  });

  it("redacts 5xx detail and meta by default", () => {
    // A server-side failure may name buckets, hosts, or upstream internals.
    const problem = toProblemDetails(
      new UploadError("INTERNAL_ERROR", "connection to db-prod-7 refused", {
        meta: { host: "db-prod-7.internal" },
      })
    );

    expect(problem.detail).toBe("Internal error");
    expect(problem.detail).not.toContain("db-prod-7");
    expect(problem.meta).toBeUndefined();
  });

  it("includes 5xx detail when debug is enabled", () => {
    const problem = toProblemDetails(
      new UploadError("INTERNAL_ERROR", "connection refused", {
        meta: { host: "db" },
      }),
      { debug: true }
    );

    expect(problem.detail).toBe("connection refused");
    expect(problem.meta).toEqual({ host: "db" });
  });

  it("builds a Response with the RFC 9457 media type and status", async () => {
    const response = toProblemResponse(new UploadError("UNAUTHORIZED"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toBe(PROBLEM_JSON_MEDIA_TYPE);
    expect((await response.json()).code).toBe("UNAUTHORIZED");
  });
});

describe("RFC 9457 deserialisation", () => {
  it("round-trips an error through the wire format", () => {
    const original = new UploadError("QUOTA_EXCEEDED", "Limit reached", {
      meta: { limit: 100 },
    });

    const revived = fromProblemDetails(toProblemDetails(original));

    expect(revived.code).toBe("QUOTA_EXCEEDED");
    expect(revived.status).toBe(429);
    expect(revived.retryable).toBe(true);
    expect(revived.message).toBe("Limit reached");
    expect(revived.meta).toEqual({ limit: 100 });
  });

  it("falls back to the HTTP status when the body carries no code", () => {
    // An nginx 502 or a CDN error page is not a problem document, but the
    // client must still produce a usable, correctly-classified error.
    const revived = fromProblemDetails("<html>Bad Gateway</html>", 502);

    expect(revived.code).toBe("STORAGE_UNAVAILABLE");
    expect(revived.retryable).toBe(true);
  });

  it("understands the pre-RFC error shape from older servers", () => {
    // Older pushduck servers returned `{ success: false, error: "..." }`.
    const revived = fromProblemDetails({ error: "Route not found" }, 404);

    expect(revived.code).toBe("NOT_FOUND");
    expect(revived.message).toBe("Route not found");
  });

  it("ignores an unrecognised code rather than trusting it", () => {
    const revived = fromProblemDetails({ code: "NOT_A_REAL_CODE" }, 403);
    expect(revived.code).toBe("FORBIDDEN");
  });

  it("never throws while handling a malformed error", () => {
    expect(() => fromProblemDetails(null, undefined)).not.toThrow();
    expect(() => fromProblemDetails(undefined)).not.toThrow();
    expect(fromProblemDetails(null).code).toBe("INTERNAL_ERROR");
  });
});

describe("codeForStatus", () => {
  it("maps well-known statuses", () => {
    expect(codeForStatus(401)).toBe("UNAUTHORIZED");
    expect(codeForStatus(413)).toBe("PAYLOAD_TOO_LARGE");
    expect(codeForStatus(429)).toBe("RATE_LIMITED");
    expect(codeForStatus(504)).toBe("TIMEOUT");
  });

  it("falls back by status class", () => {
    expect(codeForStatus(418)).toBe("BAD_REQUEST");
    expect(codeForStatus(500)).toBe("INTERNAL_ERROR");
    expect(codeForStatus(undefined)).toBe("INTERNAL_ERROR");
  });
});

describe("ecosystem neutrality", () => {
  it("maps to any framework's vocabulary in a few lines, in their code", () => {
    // The point of the design: consumers translate our stable codes into
    // whatever their ecosystem wants. pushduck ships none of these mappings,
    // so an upstream rename is never our breaking change.
    const error = new UploadError("QUOTA_EXCEEDED");

    // tRPC-style
    const trpcCode = ({ 401: "UNAUTHORIZED", 429: "TOO_MANY_REQUESTS" } as const)[
      error.status as 401 | 429
    ];
    expect(trpcCode).toBe("TOO_MANY_REQUESTS");

    // retry policies
    expect(error.retryable).toBe(true);

    // plain TypeScript narrowing, no library
    if (error.code === "QUOTA_EXCEEDED") {
      expect(error.status).toBe(429);
    }
  });
});

describe("backward compatibility with pre-0.7 clients", () => {
  it("still emits the legacy `error` field", () => {
    // A client older than the RFC 9457 change reads `body.error`. Without this
    // it would fall back to "Server error: <statusText>" and lose the message
    // whenever a server is deployed ahead of its clients.
    const problem = toProblemDetails(
      new UploadError("UNAUTHORIZED", "Sign in to upload")
    );

    expect(problem.error).toBe("Sign in to upload");
    expect(problem.detail).toBe("Sign in to upload");
  });

  it("redacts the legacy field on 5xx, exactly like detail", () => {
    const problem = toProblemDetails(
      new UploadError("INTERNAL_ERROR", "db-prod-7 refused")
    );

    expect(problem.error).toBe("Internal error");
    expect(JSON.stringify(problem)).not.toContain("db-prod-7");
  });
});
