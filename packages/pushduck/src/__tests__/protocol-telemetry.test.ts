/**
 * @fileoverview Request identity headers and protocol version.
 *
 * These exist because route and action live only in the query string, which
 * CDNs, API gateways and APM tools are entitled to drop or ignore — so every
 * upload request currently looks like one undifferentiated `POST /api/upload`
 * to every dashboard and every rate-limit rule.
 *
 * Headers give the same operational grip that path segments would, without a
 * breaking wire change. The failure cases matter most: an observability signal
 * that disappears exactly when something goes wrong is worse than none.
 */

import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { UploadError } from "../core/errors";
import {
  HEADER_ACTION,
  HEADER_PROTOCOL,
  HEADER_ROUTE,
  PROTOCOL_VERSION,
} from "../core/protocol";

function buildRouter(options: { failWith?: UploadError } = {}) {
  const { s3 } = createUploadConfig()
    .provider("aws", {
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "k",
      secretAccessKey: "s",
    })
    .build();

  const base = s3.image().maxFileSize("5MB");
  const route = options.failWith
    ? base.middleware(async () => {
        throw options.failWith;
      })
    : base;

  return s3.createRouter({ imageUpload: route });
}

const PRESIGN_BODY = JSON.stringify({
  files: [{ name: "photo.jpg", size: 1000, type: "image/jpeg" }],
});

function presign(url = "https://example.com/api/upload?route=imageUpload") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: PRESIGN_BODY,
  });
}

describe("identity headers on success", () => {
  it("labels a presign with its route and action", async () => {
    const response = await buildRouter().handler(presign());

    expect(response.headers.get(HEADER_ROUTE)).toBe("imageUpload");
    expect(response.headers.get(HEADER_ACTION)).toBe("presign");
    expect(response.headers.get(HEADER_PROTOCOL)).toBe(String(PROTOCOL_VERSION));
  });

  it("distinguishes complete from presign", async () => {
    // The distinction rate limiters and APMs cannot make today: both are
    // `POST /api/upload`, but only one runs post-processing hooks.
    const response = await buildRouter().handler(
      new Request(
        "https://example.com/api/upload?route=imageUpload&action=complete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completions: [] }),
        }
      )
    );

    expect(response.headers.get(HEADER_ACTION)).toBe("complete");
    expect(response.headers.get(HEADER_ROUTE)).toBe("imageUpload");
  });

  it("labels introspection distinctly", async () => {
    const response = await buildRouter().handler(
      new Request("https://example.com/api/upload")
    );

    expect(response.headers.get(HEADER_ACTION)).toBe("introspect");
    expect(response.headers.get(HEADER_ROUTE)).toBeNull();
  });
});

describe("identity headers on failure", () => {
  it("labels a rejected request, so failures stay attributable", async () => {
    const router = buildRouter({
      failWith: new UploadError("UNAUTHORIZED", "Sign in"),
    });

    const response = await router.handler(presign());

    expect(response.status).toBe(401);
    expect(response.headers.get(HEADER_ROUTE)).toBe("imageUpload");
    expect(response.headers.get(HEADER_ACTION)).toBe("presign");
  });

  it("labels an unknown route with the action that was attempted", async () => {
    const response = await buildRouter().handler(
      presign("https://example.com/api/upload?route=doesNotExist")
    );

    expect(response.status).toBe(404);
    expect(response.headers.get(HEADER_ROUTE)).toBe("doesNotExist");
    expect(response.headers.get(HEADER_ACTION)).toBe("presign");
  });

  it("still reports the action when the route is missing entirely", async () => {
    const response = await buildRouter().handler(
      new Request("https://example.com/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: PRESIGN_BODY,
      })
    );

    expect(response.status).toBe(400);
    expect(response.headers.get(HEADER_ROUTE)).toBeNull();
    expect(response.headers.get(HEADER_ACTION)).toBe("presign");
  });

  it("labels a 405 for an unsupported method", async () => {
    const response = await buildRouter().handler(
      new Request("https://example.com/api/upload", { method: "DELETE" })
    );

    expect(response.status).toBe(405);
  });
});

describe("protocol version", () => {
  it("is advertised by introspection", async () => {
    const response = await buildRouter().handler(
      new Request("https://example.com/api/upload")
    );

    expect((await response.json()).protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it("is on every response, so a mismatch is detectable without a body", async () => {
    // A synthetic check or proxy can compare versions after a deploy without
    // issuing an upload or parsing JSON.
    const router = buildRouter();

    for (const request of [
      presign(),
      new Request("https://example.com/api/upload"),
    ]) {
      const response = await router.handler(request);
      expect(response.headers.get(HEADER_PROTOCOL)).toBe(
        String(PROTOCOL_VERSION)
      );
    }
  });
});

describe("no telemetry dependency", () => {
  it("adds no vendor SDK to the import graph", async () => {
    // Depending on @opentelemetry/api would tie the library to one vendor's
    // evolving API — the trap the error design deliberately avoids. Emitting
    // headers lets any tracer, proxy or log tool consume the same values.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    const source = readFileSync(
      join(__dirname, "../core/protocol/telemetry.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/from ["']@opentelemetry/);
    expect(source).not.toMatch(/from ["']dd-trace/);
    expect(source).not.toMatch(/from ["']@sentry/);
  });
});
