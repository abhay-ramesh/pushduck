import type { Context } from "hono";

/**
 * Hono Adapter for Universal Handlers
 *
 * Converts Web Standard Request/Response handlers to Hono handler format.
 * Works with Hono applications.
 */
export function toHonoHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  return async (c: Context) => {
    try {
      const method = c.req.method as "GET" | "POST";

      if (!method || !(method in handlers)) {
        return c.json({ error: "Method not allowed" }, 405);
      }

      // Hono's c.req.raw is already a Web Standard Request
      const response = await handlers[method](c.req.raw);

      // Hono accepts standard Response objects directly
      return response;
    } catch (error) {
      console.error("Hono Handler Error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";

      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        500
      );
    }
  };
}

/**
 * Alternative Hono adapter that returns a route handler object
 * for use with Hono's routing methods
 */
export function toHonoRouteHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  const honoHandler = toHonoHandler(handlers);

  return {
    GET: honoHandler,
    POST: honoHandler,
  };
}
