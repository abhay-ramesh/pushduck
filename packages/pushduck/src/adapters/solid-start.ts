/**
 * SolidJS Start Adapter for Universal Handlers
 *
 * Converts Web Standard Request/Response handlers to SolidJS Start format.
 * Works with SolidJS Start applications.
 */
export function toSolidStartHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  return {
    GET: async (event: { request: Request }) => {
      try {
        return await handlers.GET(event.request);
      } catch (error) {
        console.error("SolidJS Start GET Handler Error:", error);
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

    POST: async (event: { request: Request }) => {
      try {
        return await handlers.POST(event.request);
      } catch (error) {
        console.error("SolidJS Start POST Handler Error:", error);
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
