/**
 * @fileoverview Conformance against each framework's *own* published types.
 *
 * The runtime tests in `framework-mounting.test.ts` cover the frameworks whose
 * servers can actually be started in-process: Hono, h3, Express, Fastify,
 * Next.js. For the rest — SvelteKit, Astro, Remix/React Router, Cloudflare
 * Workers — a runtime test would mean booting a full dev server and build
 * pipeline per framework, which is neither fast nor reliable in CI.
 *
 * The previous tests for those frameworks hand-wrote the calling convention:
 *
 * ```ts
 * const GET = ({ request }: { request: Request }) => router.handlers.GET(request);
 * ```
 *
 * That asserts nothing about SvelteKit. It asserts what *we assumed* SvelteKit
 * passes. If SvelteKit changed its `RequestEvent`, the test would keep passing
 * while every user's app broke — the same self-consistent-but-wrong failure
 * mode as a signature that only its own unit tests approve of.
 *
 * These tests instead assign our handlers to the framework's own exported
 * handler type. If SvelteKit changes `RequestHandler`, or Astro changes
 * `APIRoute`, this stops compiling — which is exactly when we want to hear
 * about it.
 *
 * Checked by `tsc --noEmit` and by `vitest --typecheck`.
 */

import { describe, expectTypeOf, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";

// ========================================
// A representative router
// ========================================

const { s3 } = createUploadConfig()
  .provider("aws", {
    bucket: "b",
    region: "us-east-1",
    accessKeyId: "k",
    secretAccessKey: "s",
  })
  .build();

const uploadRouter = s3.createRouter({
  imageUpload: s3.image().maxFileSize("5MB"),
});

// ========================================
// SvelteKit
// ========================================

describe("SvelteKit", () => {
  it("handlers satisfy @sveltejs/kit's RequestHandler", async () => {
    type RequestHandler = import("@sveltejs/kit").RequestHandler;

    // How the docs tell a SvelteKit user to write `src/routes/api/upload/+server.ts`.
    const GET: RequestHandler = ({ request }) =>
      uploadRouter.handlers.GET(request);
    const POST: RequestHandler = ({ request }) =>
      uploadRouter.handlers.POST(request);

    expectTypeOf(GET).toMatchTypeOf<RequestHandler>();
    expectTypeOf(POST).toMatchTypeOf<RequestHandler>();
  });

  it("the single callable handler satisfies it too", async () => {
    type RequestHandler = import("@sveltejs/kit").RequestHandler;

    const fallback: RequestHandler = ({ request }) =>
      uploadRouter.handler(request);

    expectTypeOf(fallback).toMatchTypeOf<RequestHandler>();
  });
});

// ========================================
// Astro
// ========================================

describe("Astro", () => {
  it("handlers satisfy astro's APIRoute", () => {
    type APIRoute = import("astro").APIRoute;

    // `src/pages/api/upload.ts`
    const ALL: APIRoute = ({ request }) => uploadRouter.handler(request);
    const GET: APIRoute = ({ request }) => uploadRouter.handlers.GET(request);
    const POST: APIRoute = ({ request }) => uploadRouter.handlers.POST(request);

    expectTypeOf(ALL).toMatchTypeOf<APIRoute>();
    expectTypeOf(GET).toMatchTypeOf<APIRoute>();
    expectTypeOf(POST).toMatchTypeOf<APIRoute>();
  });
});

// ========================================
// Remix / React Router 7
// ========================================

describe("Remix / React Router", () => {
  it("handlers satisfy react-router's loader and action signatures", () => {
    type LoaderArgs = import("react-router").LoaderFunctionArgs;
    type ActionArgs = import("react-router").ActionFunctionArgs;

    const loader = ({ request }: LoaderArgs) => uploadRouter.handler(request);
    const action = ({ request }: ActionArgs) => uploadRouter.handler(request);

    expectTypeOf(loader).parameter(0).toMatchTypeOf<LoaderArgs>();
    expectTypeOf(action).parameter(0).toMatchTypeOf<ActionArgs>();
    expectTypeOf(loader).returns.resolves.toMatchTypeOf<Response>();
  });
});

// ========================================
// Cloudflare Workers
// ========================================

describe("Cloudflare Workers", () => {
  /**
   * Declared structurally rather than imported from `@cloudflare/workers-types`.
   *
   * That package ships a global `.d.ts` which *redefines* `Request` and
   * `Response`, so pulling it in would replace the DOM lib's versions across
   * this entire project and make every other type here mean something subtly
   * different. The Workers contract is small enough to state exactly.
   */
  interface WorkersExportedHandler {
    fetch(
      request: Request,
      env?: unknown,
      ctx?: unknown
    ): Response | Promise<Response>;
  }

  it("router.handler satisfies the module worker fetch contract", () => {
    // `export default { fetch: router.handler }` — the handler is detached from
    // the router here, which also pins down that it must not depend on `this`.
    const worker: WorkersExportedHandler = { fetch: uploadRouter.handler };

    expectTypeOf(worker.fetch).toBeFunction();
    expectTypeOf(uploadRouter.handler).toMatchTypeOf<
      WorkersExportedHandler["fetch"]
    >();
  });
});

// ========================================
// Next.js
// ========================================

describe("Next.js", () => {
  it("handlers accept a NextRequest", () => {
    type NextRequest = import("next/server").NextRequest;

    const GET = (req: NextRequest) => uploadRouter.handlers.GET(req);
    const POST = (req: NextRequest) => uploadRouter.handlers.POST(req);

    // NextRequest extends Request, which is why no adapter is required.
    expectTypeOf<NextRequest>().toMatchTypeOf<Request>();
    expectTypeOf(GET).returns.resolves.toMatchTypeOf<Response>();
    expectTypeOf(POST).returns.resolves.toMatchTypeOf<Response>();
  });
});

// ========================================
// The property the whole design rests on
// ========================================

describe("the universal contract", () => {
  it("router.handler is exactly (Request) => Promise<Response>", () => {
    // Every framework above reduces to this. Anything that can produce a Web
    // Request and consume a Web Response can mount pushduck, which is why the
    // adapter count stays at two rather than growing with the ecosystem.
    expectTypeOf(uploadRouter.handler).toEqualTypeOf<
      (request: Request) => Promise<Response>
    >();
  });

  it("handlers is a per-method map of the same signature", () => {
    expectTypeOf(uploadRouter.handlers.GET).toEqualTypeOf<
      (request: Request) => Promise<Response>
    >();
    expectTypeOf(uploadRouter.handlers.POST).toEqualTypeOf<
      (request: Request) => Promise<Response>
    >();
  });
});
