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
        const { files } = body;
        if (!Array.isArray(files)) {
          return new Response(
            JSON.stringify({ error: "Files array is required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        // Create a NextRequest-compatible object for router methods
        const routerRequest = createRouterRequest(request);

        const results = await router.generatePresignedUrls(
          routeName,
          routerRequest,
          files
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

        // Create a NextRequest-compatible object for router methods
        const routerRequest = createRouterRequest(request);

        const results = await router.handleUploadComplete(
          routeName,
          routerRequest,
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
          details: process.env.NODE_ENV === "development" ? error : undefined,
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

/**
 * Helper function to create a NextRequest-compatible object from Web Request
 * This bridges the gap between Web Request and the current router expectations
 */
function createRouterRequest(request: Request): any {
  // For most cases, we can pass the request as-is since NextRequest extends Request
  // But we need to ensure it has the NextRequest interface shape

  // If it's already a NextRequest (like in Next.js), use it directly
  if (request.constructor.name === "NextRequest") {
    return request;
  }

  // Create a NextRequest-like object that satisfies the router interface
  const nextRequestLike = Object.create(request);

  // Add any NextRequest-specific properties if needed
  // For now, the base Request should be sufficient for most operations

  return nextRequestLike;
}
