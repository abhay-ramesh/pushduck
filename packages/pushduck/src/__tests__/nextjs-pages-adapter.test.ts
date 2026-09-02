/**
 * @fileoverview The Next.js Pages Router adapter.
 *
 * Every other framework pushduck supports takes a Web `Request` and returns a
 * Web `Response`, so "the adapter" is usually a one-line pass-through. Pages
 * Router is the exception: it uses Node's `req`/`res` pair, so this adapter has
 * to translate in both directions — URL reconstruction, header copying, a body
 * Next.js has *already parsed*, and a response written through a mutable
 * object rather than returned.
 *
 * That makes it the adapter most able to go wrong, and it had 0% coverage.
 *
 * The tests below drive the real router through the adapter with a faithful
 * `req`/`res` double, because the failures worth catching are the ones where
 * the handler is perfectly correct and the translation loses something.
 */

import { describe, expect, it, vi } from "vitest";
import { toNextJsPagesHandler } from "../adapters/nextjs-pages";
import { createUploadConfig } from "../core/config/upload-config";
import { UploadError } from "../core/errors";

function buildRouter(options: { failing?: boolean } = {}) {
  const { s3 } = createUploadConfig()
    .provider("aws", {
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    })
    .build();

  const image = options.failing
    ? s3
        .image()
        .maxFileSize("5MB")
        .middleware(async () => {
          throw new Error(
            "connection to db-prod-7.internal refused: password authentication failed"
          );
        })
    : s3.image().maxFileSize("5MB");

  return s3.createRouter({ imageUpload: image });
}

/** A faithful enough `NextApiResponse`: records what the adapter writes. */
function createResponse() {
  const state = {
    statusCode: 0,
    headers: {} as Record<string, unknown>,
    body: undefined as unknown,
    sentJson: false,
    headersSent: false,
  };

  const res = {
    get headersSent() {
      return state.headersSent;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    setHeader(key: string, value: unknown) {
      state.headers[key.toLowerCase()] = value;
      return res;
    },
    json(data: unknown) {
      state.body = data;
      state.sentJson = true;
      state.headersSent = true;
      return res;
    },
    send(data: unknown) {
      state.body = data;
      state.headersSent = true;
      return res;
    },
  };

  return { res, state };
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: "GET",
    url: "/api/upload?route=imageUpload",
    headers: { host: "example.com" },
    body: undefined,
    ...overrides,
  } as never;
}

const PRESIGN_BODY = {
  files: [{ name: "photo.jpg", size: 1000, type: "image/jpeg" }],
};

describe("request translation", () => {
  it("serves route introspection through GET", async () => {
    const handler = toNextJsPagesHandler(buildRouter().handlers);
    const { res, state } = createResponse();

    await handler(createRequest({ url: "/api/upload" }), res as never);

    expect(state.statusCode).toBe(200);
    expect((state.body as { routes: Array<{ name: string }> }).routes[0].name).toBe(
      "imageUpload"
    );
  });

  it("forwards a parsed JSON body as a presign request", async () => {
    // Next.js parses the body before the handler sees it, so the adapter has to
    // re-serialise it. Getting that wrong produces a 400 from a request the
    // client sent correctly.
    const handler = toNextJsPagesHandler(buildRouter().handlers);
    const { res, state } = createResponse();

    await handler(
      createRequest({
        method: "POST",
        headers: { host: "example.com", "content-type": "application/json" },
        body: PRESIGN_BODY,
      }),
      res as never
    );

    expect(state.statusCode).toBe(200);
    const body = state.body as { results: Array<{ presignedUrl: string }> };
    expect(body.results[0].presignedUrl).toContain("X-Amz-Signature");
  });

  it("accepts a body that arrives as a raw string", async () => {
    // With `bodyParser: false`, or a non-JSON content type, `req.body` is a
    // string that must not be JSON-stringified a second time.
    const handler = toNextJsPagesHandler(buildRouter().handlers);
    const { res, state } = createResponse();

    await handler(
      createRequest({
        method: "POST",
        headers: { host: "example.com", "content-type": "application/json" },
        body: JSON.stringify(PRESIGN_BODY),
      }),
      res as never
    );

    expect(state.statusCode).toBe(200);
  });

  it("honours x-forwarded-proto when reconstructing the URL", async () => {
    // Behind a proxy the original scheme only survives in this header, and the
    // reconstructed URL is what the handler parses its query from.
    const handler = toNextJsPagesHandler(buildRouter().handlers);
    const { res, state } = createResponse();

    await handler(
      createRequest({
        url: "/api/upload",
        headers: { host: "example.com", "x-forwarded-proto": "https" },
      }),
      res as never
    );

    expect(state.statusCode).toBe(200);
  });

  it("joins header values that arrive as arrays", async () => {
    // Node represents repeated headers as arrays; `Headers.set` would throw on
    // one, taking down an otherwise valid request.
    const handler = toNextJsPagesHandler(buildRouter().handlers);
    const { res, state } = createResponse();

    await handler(
      createRequest({
        url: "/api/upload",
        headers: { host: "example.com", "x-custom": ["a", "b"] },
      }),
      res as never
    );

    expect(state.statusCode).toBe(200);
  });

  it("rejects an unsupported method with 405", async () => {
    const handler = toNextJsPagesHandler(buildRouter().handlers);
    const { res, state } = createResponse();

    await handler(createRequest({ method: "DELETE" }), res as never);

    expect(state.statusCode).toBe(405);
  });
});

describe("response translation", () => {
  it("propagates a failure status rather than flattening it", async () => {
    const { s3 } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build();

    const router = s3.createRouter({
      imageUpload: s3
        .image()
        .maxFileSize("5MB")
        .middleware(async () => {
          throw new UploadError("UNAUTHORIZED", "Sign in to upload");
        }),
    });

    const handler = toNextJsPagesHandler(router.handlers);
    const { res, state } = createResponse();

    await handler(
      createRequest({
        method: "POST",
        headers: { host: "example.com", "content-type": "application/json" },
        body: PRESIGN_BODY,
      }),
      res as never
    );

    expect(state.statusCode).toBe(401);
    // Sent as JSON, like every other response. Error documents use
    // `application/problem+json`, which the old content-type check missed.
    expect(state.sentJson).toBe(true);
    expect((state.body as { code: string }).code).toBe("UNAUTHORIZED");
  });

  it("carries the protocol headers through", async () => {
    // Observability headers are set by the handler and must survive the hop,
    // or the Pages Router is the one framework where they vanish.
    const handler = toNextJsPagesHandler(buildRouter().handlers);
    const { res, state } = createResponse();

    await handler(createRequest({ url: "/api/upload" }), res as never);

    expect(state.headers["x-pushduck-protocol"]).toBeDefined();
  });

  it("does not copy a content-length that no longer matches the body", async () => {
    // The response is re-serialised by `res.json`, so a `content-length`
    // carried over from the Web Response describes different bytes. Node will
    // truncate the payload or hang the socket waiting for bytes that never
    // come.
    const handler = toNextJsPagesHandler(buildRouter().handlers);
    const { res, state } = createResponse();

    await handler(createRequest({ url: "/api/upload" }), res as never);

    expect(state.headers["content-length"]).toBeUndefined();
  });
});

describe("error handling", () => {
  it("does not leak an internal error message to the client", async () => {
    // The core handler is deliberate about this: a bare `Error` becomes a 500
    // whose detail is withheld, because the message routinely contains
    // hostnames, credentials and query fragments. An adapter that echoes
    // `error.message` undoes that for every Pages Router deployment.
    const handler = toNextJsPagesHandler(buildRouter({ failing: true }).handlers);
    const { res, state } = createResponse();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await handler(
      createRequest({
        method: "POST",
        headers: { host: "example.com", "content-type": "application/json" },
        body: PRESIGN_BODY,
      }),
      res as never
    );

    const serialised = JSON.stringify(state.body);
    expect(serialised).not.toContain("db-prod-7.internal");
    expect(serialised).not.toContain("password authentication failed");

    consoleError.mockRestore();
  });

  it("still reports a server failure as a 5xx", async () => {
    const handler = toNextJsPagesHandler(buildRouter({ failing: true }).handlers);
    const { res, state } = createResponse();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await handler(
      createRequest({
        method: "POST",
        headers: { host: "example.com", "content-type": "application/json" },
        body: PRESIGN_BODY,
      }),
      res as never
    );

    expect(state.statusCode).toBeGreaterThanOrEqual(500);

    consoleError.mockRestore();
  });

  it("does not write twice when the response is already sent", async () => {
    // Writing after headers are sent throws in Node and masks the original
    // failure with an unrelated one.
    const throwingHandlers = {
      GET: async () => {
        throw new Error("boom");
      },
      POST: async () => {
        throw new Error("boom");
      },
    };

    const handler = toNextJsPagesHandler(throwingHandlers);
    const { res, state } = createResponse();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      handler(createRequest({ url: "/api/upload" }), res as never)
    ).resolves.toBeUndefined();
    expect(state.statusCode).toBe(500);

    consoleError.mockRestore();
  });
});
