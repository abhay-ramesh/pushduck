import type { NextRequest } from "next/server";

/**
 * Next.js Adapter for Universal Handlers
 *
 * Converts Web Standard Request/Response handlers to Next.js compatible format.
 * Works with both App Router and Pages Router.
 */
export function toNextJsHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  return {
    GET: async (req: NextRequest) => {
      // NextRequest extends Request, so it's compatible
      const response = await handlers.GET(req);
      return response; // Response is compatible with NextResponse
    },
    POST: async (req: NextRequest) => {
      // NextRequest extends Request, so it's compatible
      const response = await handlers.POST(req);
      return response; // Response is compatible with NextResponse
    },
  };
}
