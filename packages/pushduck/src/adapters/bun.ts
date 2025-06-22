/**
 * Bun Adapter for Universal Handlers
 *
 * Converts Web Standard Request/Response handlers to Bun.serve format.
 * Works with Bun runtime applications.
 */
export function toBunHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const method = request.method as "GET" | "POST";

      if (!method || !(method in handlers)) {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Bun uses standard Web Request/Response directly
      return await handlers[method](request);
    } catch (error) {
      console.error("Bun Handler Error:", error);
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
