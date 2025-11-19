import type { UploadConfig } from "../config/upload-config";
import type { S3Router, S3RouterDefinition } from "../router/router-v2";

/**
 * Universal S3 Handler using Web Standard Request/Response
 *
 * This handler is framework-agnostic and can be adapted to any framework
 * that supports Web Standard APIs (Next.js, Express, Hono, Fastify, etc.)
 */
export function createUniversalHandler<TRoutes extends S3RouterDefinition>(
  router: S3Router<TRoutes>,
  uploadConfig: UploadConfig
): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
} {
  // Use the provided upload configuration

  async function POST(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const routeName = url.searchParams.get("route");
      const action = url.searchParams.get("action") || "presign";

      if (!routeName) {
        return new Response(
          JSON.stringify({ error: "Route parameter is required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      if (!router.getRouteNames().includes(routeName)) {
        return new Response(
          JSON.stringify({ error: `Route "${routeName}" not found` }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const body = await request.json();

      if (action === "presign") {
        /**
         * Extract files array and optional metadata from request body.
         *
         * @remarks
         * The metadata parameter contains client-provided contextual information
         * that will be passed through to the router's middleware chain.
         *
         * @security
         * Client metadata is untrusted user input. The router's middleware
         * is responsible for validation and sanitization before use.
         */
        const { files, metadata } = body;
        if (!Array.isArray(files)) {
          return new Response(
            JSON.stringify({ error: "Files array is required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        /**
         * Generate presigned URLs with client metadata.
         *
         * The metadata is passed to the router where it becomes available in:
         * - Middleware functions (for enrichment/validation)
         * - Lifecycle hooks (onUploadStart, onUploadComplete)
         * - Path generation functions (for dynamic file paths)
         */
        const results = await router.generatePresignedUrls(
          routeName,
          request,
          files,
          metadata
        );

        // Format response to match client expectations
        return new Response(
          JSON.stringify({
            success: true,
            results,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      } else if (action === "complete") {
        const { completions } = body;
        if (!Array.isArray(completions)) {
          return new Response(
            JSON.stringify({ error: "Completions array is required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const results = await router.handleUploadComplete(
          routeName,
          request,
          completions
        );

        // Format response to match client expectations
        return new Response(
          JSON.stringify({
            success: true,
            results,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      console.error("S3 Handler Error:", err);

      return new Response(
        JSON.stringify({
          success: false,
          error: err.message,
          details: uploadConfig.debug ? error : undefined,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  async function GET(request: Request): Promise<Response> {
    // Return route information for debugging/introspection
    const routes = router.getRouteNames();

    return new Response(
      JSON.stringify({
        success: true,
        routes: routes.map((name) => ({ name, type: "s3-upload" })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return { GET, POST };
}
