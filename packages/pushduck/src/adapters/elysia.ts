import type { Context } from "elysia";

/**
 * Elysia Adapter for Universal Handlers
 *
 * Converts Web Standard Request/Response handlers to Elysia handler format.
 * Works with Elysia applications.
 */
export function toElysiaHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  return async (context: Context) => {
    try {
      const method = context.request.method as "GET" | "POST";

      if (!method || !(method in handlers)) {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Elysia's context.request is already a Web Standard Request
      const response = await handlers[method](context.request);

      // Elysia accepts standard Response objects directly
      return response;
    } catch (error) {
      console.error("Elysia Handler Error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  };
}

/**
 * Alternative Elysia adapter that returns route handler methods
 * for use with Elysia's routing methods
 */
export function toElysiaRouteHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  const elysiaHandler = toElysiaHandler(handlers);

  return {
    GET: elysiaHandler,
    POST: elysiaHandler,
  };
}
