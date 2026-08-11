/**
 * Runs pushduck under Deno, and reports what happened as JSON.
 *
 * Same shape and same reasoning as `bun-server.ts`: vitest runs on Node, so the
 * only way to learn anything about Deno is to execute under Deno. This is
 * spawned by `deno-runtime.test.ts`.
 *
 * Deno is the runtime most likely to expose a portability mistake, because it
 * is the strictest: no implicit `node:` globals, permissions off by default,
 * and its own `Request`/`Response`. Anything here that reaches for a Node
 * built-in without declaring it fails loudly rather than silently falling back.
 *
 * Fresh is covered by proxy. Its route handlers are `(req: Request) => Response`
 * — the object literal in the docs is Fresh's dispatch shape, not a server —
 * so the handler is exercised through exactly that convention rather than by
 * booting a Fresh app, which would test Fresh's router and not pushduck.
 */

import { createUploadConfig } from "../../core/config/upload-config.ts";
import { UploadError } from "../../core/errors/index.ts";

declare const Deno: {
  serve(
    options: { port: number; onListen?: (info: { port: number }) => void },
    handler: (request: Request) => Response | Promise<Response>
  ): { shutdown(): Promise<void>; finished: Promise<void> };
  exit(code: number): never;
};

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

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
    ? s3
        .image()
        .maxFileSize("5MB")
        .middleware(async ({ req }) => {
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

/** Starts a server on an OS-assigned port and waits until it is listening. */
async function listen(
  handler: (request: Request) => Response | Promise<Response>
) {
  const { promise, resolve } = Promise.withResolvers<number>();

  const server = Deno.serve(
    { port: 0, onListen: ({ port }) => resolve(port) },
    handler
  );

  const port = await promise;

  return {
    url: `http://localhost:${port}`,
    stop: () => server.shutdown(),
  };
}

async function presign(base: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/upload?route=imageUpload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: PRESIGN_BODY,
  });
}

async function checkPresignOk(name: string, response: Response) {
  if (response.status !== 200) {
    record(name, false, `status ${response.status}`);
    return;
  }

  const body = (await response.json()) as {
    success?: boolean;
    results?: Array<{ presignedUrl?: string; key?: string }>;
  };

  const result = body.results?.[0];
  const ok =
    body.success === true &&
    typeof result?.presignedUrl === "string" &&
    result.presignedUrl.includes("X-Amz-Signature") &&
    typeof result.key === "string";

  record(name, ok, ok ? undefined : JSON.stringify(body).slice(0, 200));
}

// ─── Deno.serve, the way a Deno app mounts it ────────────────────────────────

{
  const router = buildRouter();
  // Detached, as `Deno.serve(router.handler)` would pass it — so it must not
  // depend on `this`.
  const server = await listen(router.handler);

  await checkPresignOk("Deno.serve — presign", await presign(server.url));

  const introspection = await fetch(`${server.url}/api/upload`);
  const routes = (await introspection.json()) as {
    routes?: Array<{ name: string }>;
  };
  record(
    "Deno.serve — introspection",
    routes.routes?.[0]?.name === "imageUpload",
    JSON.stringify(routes).slice(0, 200)
  );

  await server.stop();
}

// ─── Signing works under Deno's WebCrypto ────────────────────────────────────

{
  // SigV4 presigning is HMAC-SHA256 via WebCrypto. Deno's implementation is
  // its own, and a signature that is self-consistently wrong would still look
  // like a URL — so the query parameters the signature covers are checked
  // explicitly rather than by presence alone.
  const router = buildRouter();
  const server = await listen(router.handler);

  const response = await presign(server.url);
  const body = (await response.json()) as {
    results?: Array<{ presignedUrl?: string }>;
  };
  const url = new URL(body.results?.[0]?.presignedUrl ?? "http://invalid");
  const signature = url.searchParams.get("X-Amz-Signature") ?? "";

  record(
    "Deno — SigV4 signature is well-formed",
    // A SHA-256 HMAC in hex: 64 lowercase hex characters, exactly.
    /^[0-9a-f]{64}$/.test(signature) &&
      url.searchParams.get("X-Amz-Algorithm") === "AWS4-HMAC-SHA256" &&
      (url.searchParams.get("X-Amz-Credential") ?? "").includes("us-east-1"),
    `signature "${signature.slice(0, 16)}…" algorithm ${url.searchParams.get("X-Amz-Algorithm")}`
  );

  await server.stop();
}

// ─── Middleware rejection maps to a status across Deno's Response ────────────

{
  const router = buildRouter({ requireAuth: true });
  const server = await listen(router.handler);

  const denied = await presign(server.url);
  const problem = (await denied.json()) as { code?: string };
  record(
    "Deno.serve — middleware rejection maps to 401",
    denied.status === 401 && problem.code === "UNAUTHORIZED",
    `status ${denied.status} ${JSON.stringify(problem).slice(0, 150)}`
  );

  const allowed = await presign(server.url, { authorization: "Bearer t" });
  await checkPresignOk("Deno.serve — succeeds with credentials", allowed);

  await server.stop();
}

// ─── Fresh's route handler convention ────────────────────────────────────────

{
  const router = buildRouter();

  // Verbatim from docs/integrations/fresh: Fresh dispatches on an object of
  // per-method handlers, each taking a Web `Request`.
  const handler = {
    GET: (req: Request) => router.handler(req),
    POST: (req: Request) => router.handler(req),
  };

  // Dispatched the way Fresh would, rather than by booting Fresh — which would
  // test Fresh's router instead of this handler.
  const server = await listen((request) =>
    request.method === "GET" ? handler.GET(request) : handler.POST(request)
  );

  await checkPresignOk("Fresh handler — presign", await presign(server.url));

  const introspection = await fetch(`${server.url}/api/upload`);
  const routes = (await introspection.json()) as {
    routes?: Array<{ name: string }>;
  };
  record(
    "Fresh handler — introspection",
    routes.routes?.[0]?.name === "imageUpload",
    JSON.stringify(routes).slice(0, 200)
  );

  await server.stop();
}

console.log(`__RESULTS__${JSON.stringify(checks)}`);

Deno.exit(checks.every((c) => c.ok) ? 0 : 1);
