/**
 * @fileoverview Verifies pushduck mounts into an Effect Platform HTTP app.
 *
 * Effect Platform's HTTP layer is built on Web-standard `Request`/`Response`,
 * and exposes `HttpApp.fromWebHandler` to lift a `(Request) => Promise<Response>`
 * into an `HttpApp`. `router.handler` is exactly that signature, so pushduck
 * mounts with no adapter — the same story as Hono, Elysia, and Bun.
 *
 * These tests exist because "works with Effect" is otherwise an unverified
 * claim: the integration is only one function call, but it is the *right* one
 * function call, and that is worth pinning down.
 */

import { HttpApp, HttpRouter } from "@effect/platform";
import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";

function buildUploadRouter() {
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

/** Mounts pushduck under `/api/upload` in an Effect HTTP app. */
function buildEffectApp() {
  const uploadRouter = buildUploadRouter();

  // The entire integration: lift the Web-standard handler into an HttpApp.
  const uploadApp = HttpApp.fromWebHandler(uploadRouter.handler);

  const app = HttpRouter.empty.pipe(
    HttpRouter.mountApp("/api/upload", uploadApp)
  );

  return HttpApp.toWebHandler(app);
}

describe("Effect Platform integration", () => {
  it("mounts via HttpApp.fromWebHandler with no adapter", async () => {
    const handler = buildEffectApp();

    const response = await handler(
      new Request("http://localhost/api/upload", { method: "GET" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.routes.map((r: { name: string }) => r.name).sort()).toEqual([
      "documentUpload",
      "imageUpload",
    ]);
  });

  it("serves the presign flow through the Effect runtime", async () => {
    const handler = buildEffectApp();

    const response = await handler(
      new Request("http://localhost/api/upload?route=imageUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "photo.jpg", size: 1000, type: "image/jpeg" }],
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.results[0].presignedUrl).toContain("test-bucket");
  });

  it("preserves query parameters across the mount prefix", async () => {
    // `mountApp` rewrites the path but must leave the query string intact —
    // pushduck reads `route` and `action` from searchParams, so losing them
    // would break routing silently.
    const handler = buildEffectApp();

    const response = await handler(
      new Request("http://localhost/api/upload?route=documentUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "notes.pdf", size: 2048, type: "application/pdf" }],
        }),
      })
    );

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.results[0].key).toContain("notes");
  });

  it("propagates the 405 for unsupported methods", async () => {
    const handler = buildEffectApp();

    const response = await handler(
      new Request("http://localhost/api/upload", { method: "DELETE" })
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toContain("POST");
  });

  it("returns a 404 for an unknown route name, not a 500", async () => {
    const handler = buildEffectApp();

    const response = await handler(
      new Request("http://localhost/api/upload?route=doesNotExist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: [] }),
      })
    );

    expect(response.status).toBe(404);
  });
});

// ========================================
// Client side
// ========================================

describe("Effect client integration", () => {
  it("maps the engine's subscribe/getSnapshot onto a SubscriptionRef", async () => {
    // The engine's external-store contract is a plain observer pair, so it
    // lifts into Effect's state primitives without a shim. This is a recipe
    // rather than a shipped binding — see the caveats in the Effect guide.
    const { createUploadEngine } = await import("../core/upload");
    const { Effect, SubscriptionRef } = await import("effect");

    const fetcher = async (input: RequestInfo) => {
      const payload = String(input).includes("action=presign")
        ? {
            success: true,
            results: [
              {
                success: true,
                presignedUrl: "https://bucket.s3.amazonaws.com/signed",
                key: "uploads/photo.jpg",
                requiredHeaders: { "Content-Type": "image/jpeg" },
              },
            ],
          }
        : { success: true, results: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const program = Effect.gen(function* () {
      const engine = createUploadEngine({
        route: "imageUpload",
        endpoint: "/api/upload",
        fetcher,
        transport: async () => {},
      });

      const ref = yield* SubscriptionRef.make(engine.getSnapshot());

      const unsubscribe = engine.subscribe(() => {
        Effect.runSync(SubscriptionRef.set(ref, engine.getSnapshot()));
      });

      yield* Effect.promise(() =>
        engine.upload([
          new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" }),
        ])
      );

      unsubscribe();
      return yield* SubscriptionRef.get(ref);
    });

    const state = await Effect.runPromise(program);

    expect(state.files).toHaveLength(1);
    expect(state.files[0].status).toBe("success");
    expect(state.progress).toBe(100);
  });
});
