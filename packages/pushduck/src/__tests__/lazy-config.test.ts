/**
 * @fileoverview Provider options resolved on first use.
 *
 * `next build` evaluates every route module to collect page data, on a machine
 * that usually has no storage credentials. A config that validates its
 * provider when the module loads therefore fails the build — and five apps
 * worked around it the same way: a hand-written memoised getter around
 * `createUploadConfig()`, plus an `isConfigured()` that re-derives which
 * environment variables are set. Several of them then built a *second* config
 * for server-side storage calls, duplicating every environment read.
 *
 * Passing the provider options as a function moves resolution to the first
 * operation that needs storage, keeps one config behind both the routes and
 * `storage`, and lets `isConfigured()` answer from the same validation the
 * request would hit.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { isUploadError } from "../core/errors";
import { runHealthCheck } from "../core/utils/health-check";

/** Stands in for `process.env`: empty at build time, filled in at runtime. */
let env: Record<string, string | undefined> = {};

afterEach(() => {
  env = {};
});

function deploy() {
  env = {
    R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "uploads",
  };
}

function build({ debug = false } = {}) {
  const options = vi.fn(() => ({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
  }));

  const result = createUploadConfig()
    .provider("cloudflareR2", options)
    .debug(debug)
    .build();

  const router = result.upload.createRouter({
    avatar: result.upload.image().maxFileSize("5MB"),
  });

  return { ...result, router, options };
}

function presign(router: {
  handlers: { POST: (r: Request) => Promise<Response> };
}) {
  return router.handlers.POST(
    new Request("http://localhost/api/upload?route=avatar&action=presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [{ name: "a.png", size: 100, type: "image/png" }],
      }),
    }),
  );
}

describe("lazy provider options", () => {
  it("builds, creates routes and mounts handlers without reading them", () => {
    // Everything a route module does at import time, with no env at all.
    const { options, router } = build();

    expect(router.handlers.GET).toBeTypeOf("function");
    expect(options).not.toHaveBeenCalled();
  });

  it("reports whether storage is configured without throwing", () => {
    const { isConfigured } = build();

    expect(isConfigured()).toBe(false);

    deploy();
    expect(isConfigured()).toBe(true);
  });

  it("fails a request with an error that names the missing option", async () => {
    const { router } = build({ debug: true });

    const response = await presign(router);
    const problem = await response.json();

    expect(response.status).toBe(500);
    expect(problem.code).toBe("CONFIG_INVALID");
    expect(problem.detail).toMatch(/Account ID is required/);
  });

  it("does not leak which option is missing to clients outside debug", async () => {
    const { router } = build();

    const problem = await (await presign(router)).json();

    expect(problem.code).toBe("CONFIG_INVALID");
    expect(JSON.stringify(problem)).not.toMatch(/Account ID/);
  });

  it("fails a storage call with the same error", async () => {
    const { storage } = build();

    const failure = await storage.list.files().catch((error: unknown) => error);

    expect(isUploadError(failure) && failure.code).toBe("CONFIG_INVALID");
    expect((failure as Error).message).toMatch(/Account ID is required/);
  });

  it("resolves once, for routes and storage alike", async () => {
    const { router, storage, options } = build();
    deploy();

    const response = await presign(router);
    expect(response.status).toBe(200);
    expect(storage.getProviderInfo()).toMatchObject({
      provider: "cloudflare-r2",
      bucket: "uploads",
    });
    await presign(router);

    expect(options).toHaveBeenCalledTimes(1);
  });

  it("tries again after a failure, so options that arrive later are used", async () => {
    const { router, options } = build();

    expect((await presign(router)).status).toBe(500);
    deploy();
    expect((await presign(router)).status).toBe(200);
    expect(options).toHaveBeenCalledTimes(2);
  });

  it("wraps an error thrown while reading the options", () => {
    const { config } = createUploadConfig()
      .provider("aws", () => {
        throw new Error("env schema: AWS_REGION missing");
      })
      .build();

    let failure: unknown;
    try {
      void config.provider;
    } catch (error) {
      failure = error;
    }

    expect(isUploadError(failure) && failure.code).toBe("CONFIG_INVALID");
    expect((failure as Error).message).toMatch(/AWS_REGION missing/);
    expect((failure as Error).cause).toBeInstanceOf(Error);
  });

  it("fails the health check instead of throwing", async () => {
    const { config } = build();

    const result = await runHealthCheck(config);
    const check = result.checks.find((c) => c.name === "Configuration");

    expect(check?.status).toBe("fail");
    expect(check?.message).toMatch(/Account ID is required/);
  });
});

describe("eager provider options", () => {
  it("still validate when the config is built", () => {
    expect(() =>
      createUploadConfig().provider("cloudflareR2", { bucket: "b" }).build(),
    ).toThrow(/Account ID is required/);
  });

  it("are always configured once built", () => {
    const { isConfigured } = createUploadConfig()
      .provider("aws", {
        bucket: "b",
        region: "us-east-1",
        accessKeyId: "k",
        secretAccessKey: "s",
      })
      .build();

    expect(isConfigured()).toBe(true);
  });
});
