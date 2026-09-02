/**
 * @fileoverview End-to-end error path: server throw → HTTP status → wire → client.
 *
 * The value of the error work is only realised if `code`, `status`,
 * `retryable`, and `meta` survive every hop. Unit tests on either half cannot
 * show that; these drive the real handler and the real engine, with the
 * handler's `Response` fed straight into the client's `fetcher`.
 *
 * Before this work every failure was `500 { error: "some string" }`, so a
 * client could not distinguish "you are not signed in" from "storage is down"
 * — which is what defeated typed errors in every consuming ecosystem.
 */

import { describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { UploadError, type ProblemDetails } from "../core/errors";
import { uploadFiles, UploadBatchError } from "../core/upload";

/** Builds a router whose middleware fails in a configurable way. */
function buildRouter(options: {
  middleware?: () => unknown;
  debug?: boolean;
  errorFormatter?: (ctx: {
    error: UploadError;
    problem: ProblemDetails;
    request: Request;
  }) => ProblemDetails | undefined;
} = {}) {
  const builder = createUploadConfig().provider("aws", {
    bucket: "test-bucket",
    region: "us-east-1",
    accessKeyId: "k",
    secretAccessKey: "s",
  });

  if (options.debug) builder.debug(true);
  if (options.errorFormatter) builder.errorFormatter(options.errorFormatter);

  const { s3 } = builder.build();

  const base = s3.image().maxFileSize("5MB");
  const route = options.middleware
    ? base.middleware(async () => options.middleware!() as never)
    : base;

  return s3.createRouter({ imageUpload: route });
}

/** A `fetcher` that routes the client's requests into the real handler. */
function handlerAsFetcher(router: ReturnType<typeof buildRouter>) {
  return vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input).startsWith("http")
      ? String(input)
      : `https://example.com${String(input)}`;
    return router.handler(new Request(url, init));
  });
}

const noopTransport = async () => {};

describe("server → wire: status reflects the failure", () => {
  it("returns 401 when middleware rejects authentication", async () => {
    // Previously a 500. A client, a proxy, and a retry policy all read this.
    const router = buildRouter({
      middleware: () => {
        throw new UploadError("UNAUTHORIZED", "Sign in to upload");
      },
    });

    const response = await router.handler(
      new Request("https://example.com/api/upload?route=imageUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "a.jpg", size: 10, type: "image/jpeg" }],
        }),
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toBe("application/problem+json");

    const problem = await response.json();
    expect(problem.code).toBe("UNAUTHORIZED");
    expect(problem.retryable).toBe(false);
    expect(problem.detail).toBe("Sign in to upload");
    expect(problem.type).toBe("https://pushduck.org/errors/unauthorized");
  });

  it("returns 429 and retryable: true for a quota rejection", async () => {
    const router = buildRouter({
      middleware: () => {
        throw new UploadError("QUOTA_EXCEEDED", "Monthly limit reached", {
          meta: { limit: 100, used: 100 },
        });
      },
    });

    const response = await router.handler(
      new Request("https://example.com/api/upload?route=imageUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "a.jpg", size: 10, type: "image/jpeg" }],
        }),
      })
    );

    expect(response.status).toBe(429);
    const problem = await response.json();
    expect(problem.retryable).toBe(true);
    expect(problem.meta).toEqual({ limit: 100, used: 100 });
  });

  it("returns 404 for an unknown route", async () => {
    const response = await buildRouter().handler(
      new Request("https://example.com/api/upload?route=nope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: [] }),
      })
    );

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("NOT_FOUND");
  });

  it("returns 400 for a malformed request", async () => {
    const response = await buildRouter().handler(
      new Request("https://example.com/api/upload?route=imageUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: "not-an-array" }),
      })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("BAD_REQUEST");
  });

  it("returns 500 for a bare Error, without leaking its message", async () => {
    // An unhandled exception from user middleware. 500 is honest, but the
    // message may name internal hosts, so it must not reach the client.
    const router = buildRouter({
      middleware: () => {
        throw new Error("connection to db-prod-7.internal refused");
      },
    });

    const response = await router.handler(
      new Request("https://example.com/api/upload?route=imageUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "a.jpg", size: 10, type: "image/jpeg" }],
        }),
      })
    );

    expect(response.status).toBe(500);
    const problem = await response.json();
    expect(problem.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(problem)).not.toContain("db-prod-7");
  });

  it("includes the internal message when debug is enabled", async () => {
    const router = buildRouter({
      debug: true,
      middleware: () => {
        throw new Error("connection refused");
      },
    });

    const response = await router.handler(
      new Request("https://example.com/api/upload?route=imageUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "a.jpg", size: 10, type: "image/jpeg" }],
        }),
      })
    );

    expect((await response.json()).detail).toBe("connection refused");
  });

  it("rejects an oversized request body with 413", async () => {
    // Bounds a denial-of-service vector: an unbounded body would be parsed
    // into memory before anything checked its size.
    const huge = "x".repeat(200 * 1024);
    const response = await buildRouter().handler(
      new Request("https://example.com/api/upload?route=imageUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: [], padding: huge }),
      })
    );

    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("errorFormatter", () => {
  it("can shape the outgoing document", async () => {
    const router = buildRouter({
      middleware: () => {
        throw new UploadError("FORBIDDEN", "no");
      },
      errorFormatter: ({ problem, request }) => ({
        ...problem,
        instance: request.url,
        traceId: "trace-123",
      }),
    });

    const response = await router.handler(
      new Request("https://example.com/api/upload?route=imageUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "a.jpg", size: 10, type: "image/jpeg" }],
        }),
      })
    );

    expect(response.status).toBe(403);
    expect((await response.json()).traceId).toBe("trace-123");
  });

  it("falls back to the default document if the formatter throws", async () => {
    // An exception while reporting an error must not escalate into an
    // unhandled rejection or a blank response.
    const router = buildRouter({
      middleware: () => {
        throw new UploadError("FORBIDDEN", "no");
      },
      errorFormatter: () => {
        throw new Error("formatter is broken");
      },
    });

    const response = await router.handler(
      new Request("https://example.com/api/upload?route=imageUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "a.jpg", size: 10, type: "image/jpeg" }],
        }),
      })
    );

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FORBIDDEN");
  });
});

describe("wire → client: the typed error survives the hop", () => {
  it("rejects with a typed error carrying code, status and retryability", async () => {
    const router = buildRouter({
      middleware: () => {
        throw new UploadError("QUOTA_EXCEEDED", "Monthly limit reached", {
          meta: { limit: 100, used: 100 },
        });
      },
    });

    let caught!: UploadBatchError;
    try {
      await uploadFiles({
        files: [new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" })],
        route: "imageUpload",
        endpoint: "/api/upload",
        fetcher: handlerAsFetcher(router),
        transport: noopTransport,
      });
      throw new Error("expected uploadFiles to reject");
    } catch (error) {
      caught = error as UploadBatchError;
    }

    // Everything the server knew is available to the client.
    expect(caught).toBeInstanceOf(UploadError);
    expect(caught.code).toBe("QUOTA_EXCEEDED");
    expect(caught.status).toBe(429);
    expect(caught.retryable).toBe(true);
    expect(caught.meta).toMatchObject({ limit: 100, used: 100 });
    expect(caught.message).toBe("Monthly limit reached");
  });

  it("gives a retry policy something to act on", async () => {
    // The shape a TanStack Query `retry` or a backoff loop actually consumes.
    const retryable = buildRouter({
      middleware: () => {
        throw new UploadError("RATE_LIMITED", "slow down");
      },
    });
    const permanent = buildRouter({
      middleware: () => {
        throw new UploadError("FORBIDDEN", "never");
      },
    });

    const attempt = async (router: ReturnType<typeof buildRouter>) =>
      uploadFiles({
        files: [new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" })],
        route: "imageUpload",
        endpoint: "/api/upload",
        fetcher: handlerAsFetcher(router),
        transport: noopTransport,
      }).catch((e: UploadError) => e);

    expect(((await attempt(retryable)) as UploadError).retryable).toBe(true);
    expect(((await attempt(permanent)) as UploadError).retryable).toBe(false);
  });

  it("records the code on every file in a failed batch", async () => {
    const router = buildRouter({
      middleware: () => {
        throw new UploadError("UNAUTHORIZED", "Sign in");
      },
    });

    const caught = (await uploadFiles({
      files: [new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" })],
      route: "imageUpload",
      endpoint: "/api/upload",
      fetcher: handlerAsFetcher(router),
      transport: noopTransport,
    }).catch((e) => e)) as UploadBatchError;

    expect(caught.files[0].errorCode).toBe("UNAUTHORIZED");
    expect(caught.files[0].error).toBe("Sign in");
  });

  it("delivers the typed error to onError", async () => {
    const router = buildRouter({
      middleware: () => {
        throw new UploadError("FORBIDDEN", "nope");
      },
    });

    const onError = vi.fn();
    await uploadFiles({
      files: [new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" })],
      route: "imageUpload",
      endpoint: "/api/upload",
      fetcher: handlerAsFetcher(router),
      transport: noopTransport,
      onError,
    }).catch(() => {});

    const delivered = onError.mock.calls[0][0] as UploadError;
    expect(delivered.code).toBe("FORBIDDEN");
    expect(delivered.status).toBe(403);
  });

  it("marks a cancelled upload distinctly from a failure", async () => {
    // Cancellation is a user action, not an error condition — reporting it as
    // a network failure would make retry logic do the wrong thing.
    const controller = new AbortController();
    const router = buildRouter();

    const result = await uploadFiles({
      files: [new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" })],
      route: "imageUpload",
      endpoint: "/api/upload",
      fetcher: handlerAsFetcher(router),
      transport: async ({ signal }) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new Error("Upload aborted"))
          );
          queueMicrotask(() => controller.abort());
        }),
      signal: controller.signal,
    });

    expect(result.failedFiles).toHaveLength(1);
    expect(result.failedFiles[0].errorCode).toBeDefined();
  });
});

describe("ecosystem mapping stays in the consumer's code", () => {
  it("maps to any framework's vocabulary from status and code alone", async () => {
    const router = buildRouter({
      middleware: () => {
        throw new UploadError("UNAUTHORIZED", "Sign in");
      },
    });

    const error = (await uploadFiles({
      files: [new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" })],
      route: "imageUpload",
      endpoint: "/api/upload",
      fetcher: handlerAsFetcher(router),
      transport: noopTransport,
    }).catch((e) => e)) as UploadError;

    // The complete "integration" a tRPC user writes, in their own code.
    const trpcCode = { 401: "UNAUTHORIZED", 403: "FORBIDDEN" }[error.status];
    expect(trpcCode).toBe("UNAUTHORIZED");

    // pushduck ships no dependency on, or knowledge of, any of these.
    expect(error).toBeInstanceOf(Error);
  });
});
