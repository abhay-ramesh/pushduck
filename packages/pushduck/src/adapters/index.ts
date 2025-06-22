/**
 * Framework Adapters for Universal Handlers
 *
 * These adapters convert Web Standard Request/Response handlers
 * to framework-specific formats.
 */

// Next.js adapters
export { toNextJsHandler } from "./nextjs";
export { toNextJsPagesHandler } from "./nextjs-pages";

// Express adapter
export { toExpressHandler } from "./express";

// Hono adapters
export { toHonoHandler, toHonoRouteHandler } from "./hono";

// Fastify adapters
export { toFastifyHandler, toFastifyRouteHandler } from "./fastify";

// Elysia adapters
export { toElysiaHandler, toElysiaRouteHandler } from "./elysia";

// Modern React/JS frameworks
export { toSolidStartHandler } from "./solid-start";
export { toTanStackStartHandler } from "./tanstack-start";

// Runtime adapters
export { toBunHandler } from "./bun";
