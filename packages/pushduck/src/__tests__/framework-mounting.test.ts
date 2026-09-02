/**
 * @fileoverview Mounts pushduck in every framework the docs claim support for.
 *
 * Framework support was previously a claim backed by *construction* — "it takes
 * a Web `Request`, so it must work" — rather than by any test. The two real
 * adapters (Express, Fastify) had no tests at all, and no framework's actual
 * router had ever been exercised.
 *
 * Each case below mounts the handler the way that framework's own
 * documentation says to, then drives a real presign request through it and
 * checks the response. Frameworks that genuinely need no adapter are proven to
 * need none, rather than assumed to.
 *
 * Elysia and Bun are absent from *this* file because they require the Bun
 * runtime, which vitest does not provide. They are covered for real in
 * `bun-runtime.test.ts`, which spawns the `bun` binary against a fixture that
 * starts actual servers — rather than the argument this comment used to make,
 * that their mounting pattern is identical to Hono's so they must work.
 */

import express from "express";
import Fastify from "fastify";
import { Hono } from "hono";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toExpressHandler } from "../adapters/express";
import { toFastifyHandler } from "../adapters/fastify";
import { createUploadConfig } from "../core/config/upload-config";
import { UploadError } from "../core/errors";

// ========================================
// Shared router
// ========================================

function buildRouter(options: { requireAuth?: boolean } = {}) {
  const { s3 } = createUploadConfig()
    .provider("aws", {
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    })
    .build();

  const image = options.requireAuth
    ? s3.image().maxFileSize("5MB").middleware(async ({ req }) => {
        if (!req.headers.get("authorization")) {
          throw new UploadError("UNAUTHORIZED", "Sign in to upload");
        }
        return { userId: "u1" };
      })
    : s3.image().maxFileSize("5MB");

  return s3.createRouter({ imageUpload: image });
}

const PRESIGN_BODY = JSON.stringify({
  files: [{ name: "photo.jpg", size: 1000, type: "image/jpeg" }],
});

/** Asserts a presign response is the successful shape every framework must produce. */
async function expectPresignOk(response: {
  status: number;
  json: () => Promise<any>;
}) {
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.results[0].presignedUrl).toContain("test-bucket");
  expect(body.results[0].key).toContain("photo");
}

/** Starts a Node server on an ephemeral port and returns its base URL. */
async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

// ========================================
// Web-standard frameworks: no adapter
// ========================================

describe("Web-standard frameworks mount with no adapter", () => {
  /**
   * Only frameworks whose server can genuinely run in-process are exercised
   * here. SvelteKit, Astro, Remix and Workers are verified in
   * `framework-conformance.test-d.ts` against their own published handler
   * types — hand-writing their calling convention here would only assert what
   * we assumed it to be.
   */
  it("Hono — app.all with c.req.raw", async () => {
    const router = buildRouter();
    const app = new Hono();

    // Exactly the snippet in docs/integrations/hono.
    app.all("/api/upload/*", (c) => router.handler(c.req.raw));

    await expectPresignOk(
      await app.request("/api/upload?route=imageUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: PRESIGN_BODY,
      })
    );
  });

  it("Hono — per-method handlers", async () => {
    const router = buildRouter();
    const app = new Hono();

    app.get("/api/upload", (c) => router.handlers.GET(c.req.raw));
    app.post("/api/upload", (c) => router.handlers.POST(c.req.raw));

    const introspection = await app.request("/api/upload");
    expect((await introspection.json()).routes[0].name).toBe("imageUpload");
  });




  it("Cloudflare Workers / Bun — default export fetch", async () => {
    const router = buildRouter();

    // `router.handler` is detached from the router here, so it must not rely
    // on `this`.
    const worker = { fetch: router.handler };

    await expectPresignOk(
      await worker.fetch(
        new Request("http://localhost/api/upload?route=imageUpload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: PRESIGN_BODY,
        })
      )
    );
  });

});

// ========================================
// Nuxt / Nitro (h3)
// ========================================

describe("Nuxt / Nitro mounts via h3", () => {
  it("serves a presign request through an h3 app", async () => {
    const router = buildRouter();
    const { H3, serve, toWebHandler } = await import("h3");

    const app = new H3();
    app.all("/api/upload", (event: { req: Request }) =>
      router.handler(event.req)
    );

    const handler = toWebHandler(app);

    await expectPresignOk(
      await handler(
        new Request("http://localhost/api/upload?route=imageUpload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: PRESIGN_BODY,
        })
      )
    );

    void serve;
  });
});

// ========================================
// Express — real server, real HTTP
// ========================================

describe("Express adapter", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const router = buildRouter();
    const app = express();
    app.use(express.json());
    // Mounted exactly as docs/integrations/express says to. The earlier test
    // used an exact path instead, so it never caught that the documented
    // `app.all('/api/upload/*')` throws at startup on Express 5.
    app.use("/api/upload", toExpressHandler(router.handlers));

    server = createServer(app);
    baseUrl = await listen(server);
  });

  afterAll(() => {
    server.close();
  });

  it("survives a prefix mount, where Express rewrites req.url", async () => {
    // `app.use` strips the prefix from `req.url`; the adapter reads
    // `req.originalUrl` for exactly this reason (adapters/express.ts).
    const response = await fetch(`${baseUrl}/api/upload?route=imageUpload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: PRESIGN_BODY,
    });
    expect(response.status).toBe(200);
  });

  it("serves a presign request over real HTTP", async () => {
    await expectPresignOk(
      await fetch(`${baseUrl}/api/upload?route=imageUpload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: PRESIGN_BODY,
      })
    );
  });

  it("serves route introspection", async () => {
    const response = await fetch(`${baseUrl}/api/upload`);
    expect(response.status).toBe(200);
    expect((await response.json()).routes[0].name).toBe("imageUpload");
  });

  it("propagates the error status rather than flattening to 500", async () => {
    const response = await fetch(`${baseUrl}/api/upload?route=nope`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: PRESIGN_BODY,
    });

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("NOT_FOUND");
  });
});

describe("Express adapter — authentication", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const router = buildRouter({ requireAuth: true });
    const app = express();
    app.use(express.json());
    app.use("/api/upload", toExpressHandler(router.handlers));

    server = createServer(app);
    baseUrl = await listen(server);
  });

  afterAll(() => {
    server.close();
  });

  it("returns 401 through the adapter when middleware rejects", async () => {
    // The whole point of the error work: the status has to survive the adapter
    // layer, not just the handler.
    const response = await fetch(`${baseUrl}/api/upload?route=imageUpload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: PRESIGN_BODY,
    });

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("UNAUTHORIZED");
  });

  it("succeeds when the header is present", async () => {
    await expectPresignOk(
      await fetch(`${baseUrl}/api/upload?route=imageUpload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer token",
        },
        body: PRESIGN_BODY,
      })
    );
  });
});

// ========================================
// Fastify — real server, real HTTP
// ========================================

describe("Fastify adapter", () => {
  let app: ReturnType<typeof Fastify>;
  let baseUrl: string;

  beforeAll(async () => {
    const router = buildRouter();
    app = Fastify();
    // Fastify's find-my-way needs both: `*` does not match zero segments, so a
    // wildcard alone would 404 the bare introspection URL.
    app.all("/api/upload", toFastifyHandler(router.handlers));
    app.all("/api/upload/*", toFastifyHandler(router.handlers));

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves a presign request over real HTTP", async () => {
    await expectPresignOk(
      await fetch(`${baseUrl}/api/upload?route=imageUpload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: PRESIGN_BODY,
      })
    );
  });

  it("serves route introspection", async () => {
    const response = await fetch(`${baseUrl}/api/upload`);
    expect((await response.json()).routes[0].name).toBe("imageUpload");
  });

  it("propagates the error status", async () => {
    const response = await fetch(`${baseUrl}/api/upload?route=nope`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: PRESIGN_BODY,
    });

    expect(response.status).toBe(404);
  });
});

// ========================================
// Next.js
// ========================================

describe("Next.js adapters", () => {
  it("App Router — named GET/POST exports", async () => {
    const router = buildRouter();
    const { toNextJsHandler } = await import("../adapters/nextjs");

    const { GET, POST } = toNextJsHandler(router.handlers);

    await expectPresignOk(
      await POST(
        new Request("http://localhost/api/upload?route=imageUpload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: PRESIGN_BODY,
        }) as never
      )
    );

    expect(
      (await GET(new Request("http://localhost/api/upload") as never)).status
    ).toBe(200);
  });

  it("App Router — direct export without the adapter", async () => {
    // The documented shortcut: NextRequest extends Request, so no shim needed.
    const router = buildRouter();
    const { GET, POST } = router.handlers;

    await expectPresignOk(
      await POST(
        new Request("http://localhost/api/upload?route=imageUpload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: PRESIGN_BODY,
        })
      )
    );
    expect((await GET(new Request("http://localhost/api/upload"))).status).toBe(
      200
    );
  });
});
