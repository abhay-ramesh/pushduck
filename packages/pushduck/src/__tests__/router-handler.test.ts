/**
 * @fileoverview Tests for the single-callable `router.handler`.
 *
 * Most Web-standard frameworks mount one catch-all route, so `handler` — not
 * the per-method `handlers` object — is the shape they want. Five integration
 * doc pages already assumed this existed and called `uploadRouter.handlers(req)`,
 * which threw; these tests pin the real behaviour down.
 */

import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";

function buildRouter() {
  const { s3 } = createUploadConfig()
    .provider("aws", {
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    })
    .build();

  return s3.createRouter({
    imageUpload: s3.image().maxFileSize("5MB"),
    documentUpload: s3.file().maxFileSize("10MB"),
  });
}

describe("router.handler", () => {
  it("is callable, unlike the handlers object", () => {
    const router = buildRouter();

    expect(typeof router.handler).toBe("function");
    // The historical footgun: `handlers` is an object and calling it throws.
    expect(typeof router.handlers).toBe("object");
  });

  it("dispatches GET to route introspection", async () => {
    const router = buildRouter();

    const response = await router.handler(
      new Request("https://example.com/api/upload")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.routes.map((r: { name: string }) => r.name).sort()).toEqual([
      "documentUpload",
      "imageUpload",
    ]);
  });

  it("dispatches POST to the presign flow", async () => {
    const router = buildRouter();

    const response = await router.handler(
      new Request("https://example.com/api/upload?route=imageUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "photo.jpg", size: 1000, type: "image/jpeg" }],
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.results[0].presignedUrl).toContain("test-bucket");
  });

  it("returns 405 with an Allow header for unsupported methods", async () => {
    // A misconfigured mount should be diagnosable, not silently 404 through to
    // the framework's own handler.
    const router = buildRouter();

    const response = await router.handler(
      new Request("https://example.com/api/upload", { method: "DELETE" })
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toContain("POST");
    expect((await response.json()).error).toContain("DELETE");
  });

  it("matches lowercase methods case-insensitively", async () => {
    const router = buildRouter();

    const response = await router.handler(
      new Request("https://example.com/api/upload", { method: "get" })
    );

    expect(response.status).toBe(200);
  });

  it("produces the same result as the per-method handlers", async () => {
    const router = buildRouter();
    const url = "https://example.com/api/upload";

    const viaHandler = await router.handler(new Request(url));
    const viaHandlers = await router.handlers.GET(new Request(url));

    expect(await viaHandler.json()).toEqual(await viaHandlers.json());
  });

  it("survives being destructured off the router", async () => {
    // `export default { fetch: router.handler }` detaches it from `this`.
    const router = buildRouter();
    const { handler } = router;

    const response = await handler(new Request("https://example.com/api/upload"));
    expect(response.status).toBe(200);
  });
});
