import type { NextRequest } from "next/server";
import type { UniversalHandler } from "../core/handler/universal-handler";

/**
 * Next.js Adapter for Universal Handlers
 *
 * Converts Web Standard Request/Response handlers to Next.js compatible format.
 * Works with both App Router and Pages Router.
 */
export function toNextJsHandler(handler: UniversalHandler) {
  return {
    GET: async (req: NextRequest) => {
      // NextRequest extends Request, so it's compatible
      const response = await handler.GET(req);
      return response; // Response is compatible with NextResponse
    },
    POST: async (req: NextRequest) => {
      // NextRequest extends Request, so it's compatible
      const response = await handler.POST(req);
      return response; // Response is compatible with NextResponse
    },
  };
}
