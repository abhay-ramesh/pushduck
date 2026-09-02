/**
 * Runs pushduck under Bun, and reports what happened as JSON.
 *
 * This is a standalone script rather than a vitest file because the whole point
 * is the *runtime*. Vitest runs on Node, so a Bun test executed by vitest would
 * prove nothing about Bun. `bun-runtime.test.ts` spawns this with the `bun`
 * binary and asserts on what it prints.
 *
 * Everything here goes over real HTTP against a real `Bun.serve` listener, on
 * an ephemeral port. Calling `router.handler(request)` directly would not
 * exercise Bun's own `Request`/`Response` implementations, which is the only
 * thing that could differ from Node.
 */

import { Elysia } from "elysia";
import { createUploadConfig } from "../../core/config/upload-config";
import { UploadError } from "../../core/errors";

declare const Bun: {
  serve(options: {
    port: number;
    fetch: (request: Request) => Response | Promise<Response>;
  }): { port: number; stop(): void };
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

/** Starts a server on an ephemeral port and hands back its base URL. */
function listen(fetch: (request: Request) => Response | Promise<Response>) {
  // Port 0 lets the OS choose, so concurrent runs cannot collide.
  const server = Bun.serve({ port: 0, fetch });
  return { url: `http://localhost:${server.port}`, stop: () => server.stop() };
}

async function presign(base: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/upload?route=imageUpload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: PRESIGN_BODY,
  });
}

/** The shape every framework must produce for a successful presign. */
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

// ─── Bun.serve, the way the docs show a Bun app mounting it ──────────────────

{
  const router = buildRouter();
  // `router.handler` is passed detached, exactly as `export default { fetch }`
  // would — so it must not depend on `this`.
  const server = listen(router.handler);

  await checkPresignOk("Bun.serve — presign", await presign(server.url));

  const introspection = await fetch(`${server.url}/api/upload`);
  const routes = (await introspection.json()) as {
    routes?: Array<{ name: string }>;
  };
  record(
    "Bun.serve — introspection",
    routes.routes?.[0]?.name === "imageUpload",
    JSON.stringify(routes).slice(0, 200)
  );

  server.stop();
}

// ─── Bun.serve with a rejecting middleware ───────────────────────────────────

{
  const router = buildRouter({ requireAuth: true });
  const server = listen(router.handler);

  const denied = await presign(server.url);
  const problem = (await denied.json()) as { code?: string; status?: number };
  record(
    "Bun.serve — middleware rejection maps to 401",
    denied.status === 401 && problem.code === "UNAUTHORIZED",
    `status ${denied.status} ${JSON.stringify(problem).slice(0, 150)}`
  );

  const allowed = await presign(server.url, { authorization: "Bearer t" });
  await checkPresignOk("Bun.serve — succeeds with credentials", allowed);

  server.stop();
}

// ─── Elysia via .all(), the pattern in Elysia's own routing docs ─────────────

{
  const router = buildRouter();
  const app = new Elysia().all("/api/upload", ({ request }) =>
    router.handler(request)
  );

  const server = listen(app.fetch);

  await checkPresignOk("Elysia .all — presign", await presign(server.url));

  const introspection = await fetch(`${server.url}/api/upload`);
  const routes = (await introspection.json()) as {
    routes?: Array<{ name: string }>;
  };
  record(
    "Elysia .all — introspection",
    routes.routes?.[0]?.name === "imageUpload",
    JSON.stringify(routes).slice(0, 200)
  );

  server.stop();
}

// ─── Elysia via split .get/.post, the pattern the docs actually show ─────────

{
  const router = buildRouter();
  // Verbatim from docs/integrations/elysia. Tested because a docs snippet
  // nobody executes is a claim, not a guarantee.
  const app = new Elysia()
    .get("/api/upload", ({ request }) => router.handlers.GET(request))
    .post("/api/upload", ({ request }) => router.handlers.POST(request));

  const server = listen(app.fetch);

  await checkPresignOk(
    "Elysia .get/.post — presign",
    await presign(server.url)
  );

  const introspection = await fetch(`${server.url}/api/upload`);
  const routes = (await introspection.json()) as {
    routes?: Array<{ name: string }>;
  };
  record(
    "Elysia .get/.post — introspection",
    routes.routes?.[0]?.name === "imageUpload",
    JSON.stringify(routes).slice(0, 200)
  );

  server.stop();
}

// ─── Elysia via .mount(), its documented WinterCG interop ────────────────────

{
  const router = buildRouter();
  // `.mount` is Elysia's supported way to host any Web-standard handler, and
  // is the more idiomatic mounting for a library like this.
  const app = new Elysia().mount("/api/upload", router.handler);

  const server = listen(app.fetch);

  await checkPresignOk("Elysia .mount — presign", await presign(server.url));

  server.stop();
}

// ─── Elysia propagates a failure status rather than flattening it ────────────

{
  const router = buildRouter({ requireAuth: true });
  const app = new Elysia().all("/api/upload", ({ request }) =>
    router.handler(request)
  );
  const server = listen(app.fetch);

  const denied = await presign(server.url);
  const problem = (await denied.json()) as { code?: string };
  record(
    "Elysia — middleware rejection maps to 401",
    denied.status === 401 && problem.code === "UNAUTHORIZED",
    `status ${denied.status} ${JSON.stringify(problem).slice(0, 150)}`
  );

  server.stop();
}

// ─── A validation failure, to prove errors survive the runtime boundary ──────

{
  const router = buildRouter();
  const server = listen(router.handler);

  const tooBig = await fetch(`${server.url}/api/upload?route=imageUpload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: [{ name: "huge.jpg", size: 50 * 1024 * 1024, type: "image/jpeg" }],
    }),
  });

  // A batch presign reports per *file*, so one invalid file among valid ones
  // is a 200 with that entry marked failed — not a 4xx for the whole request.
  // Asserting a 4xx here would be asserting a protocol we do not have.
  const batch = (await tooBig.json()) as {
    success?: boolean;
    results?: Array<{ success?: boolean; error?: string }>;
  };
  const entry = batch.results?.[0];
  record(
    "Bun.serve — oversized file is rejected per-file, not per-request",
    tooBig.status === 200 &&
      entry?.success === false &&
      typeof entry.error === "string" &&
      entry.error.includes("exceeds maximum"),
    `status ${tooBig.status} ${JSON.stringify(batch).slice(0, 200)}`
  );

  server.stop();
}

// The harness reads this line; anything else on stdout is ignored.
console.log(`__RESULTS__${JSON.stringify(checks)}`);

process.exit(checks.every((c) => c.ok) ? 0 : 1);
