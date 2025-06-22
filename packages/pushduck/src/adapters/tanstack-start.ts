/**
 * TanStack Start Adapter for Universal Handlers
 *
 * Converts Web Standard Request/Response handlers to TanStack Start format.
 * Works with TanStack Start applications.
 */
export function toTanStackStartHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  return {
    GET: async ({ request }: { request: Request }) => {
      try {
        return await handlers.GET(request);
      } catch (error) {
        console.error("TanStack Start GET Handler Error:", error);
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
    },

    POST: async ({ request }: { request: Request }) => {
      try {
        return await handlers.POST(request);
      } catch (error) {
        console.error("TanStack Start POST Handler Error:", error);
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
    },
  };
}
