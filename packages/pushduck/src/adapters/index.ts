/**
 * Framework Adapters for Universal Handlers
 *
 * These adapters convert Web Standard Request/Response handlers
 * to framework-specific formats for frameworks that don't use Web Standards.
 *
 * Many modern frameworks (Hono, Elysia, Bun, TanStack Start, SolidJS Start)
 * use Web Standards directly and don't need adapters - just use uploadRouter.handlers directly!
 */

// Next.js adapters
export { toNextJsHandler } from "./nextjs";
export { toNextJsPagesHandler } from "./nextjs-pages";

// Legacy framework adapters (needed for non-Web Standard APIs)
export { toExpressHandler } from "./express";
export { toFastifyHandler, toFastifyRouteHandler } from "./fastify";
