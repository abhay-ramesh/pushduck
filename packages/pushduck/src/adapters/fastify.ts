import type { FastifyReply, FastifyRequest } from "fastify";
import type { UniversalHandler } from "../core/handler/universal-handler";

/**
 * Fastify Adapter for Universal Handlers
 *
 * Converts Web Standard Request/Response handlers to Fastify handler format.
 * Works with Fastify applications.
 */
export function toFastifyHandler(handler: UniversalHandler) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const method = request.method as "GET" | "POST";

      if (!method || (method !== "GET" && method !== "POST")) {
        return reply.status(405).send({ error: "Method not allowed" });
      }

      // Convert Fastify Request to Web Request
      const webRequest = convertFastifyToWebRequest(request);

      // Call the universal handler - auto-detects method
      const response = await handler(webRequest);

      // Convert Web Response back to Fastify Reply
      await convertWebResponseToFastify(response, reply);
    } catch (error) {
      console.error("Fastify Handler Error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";

      if (!reply.sent) {
        reply.status(500).send({
          success: false,
          error: errorMessage,
        });
      }
    }
  };
}

/**
 * Convert Fastify Request to Web Request
 */
function convertFastifyToWebRequest(request: FastifyRequest): Request {
  // Build the full URL
  const protocol = request.protocol || "http";
  const host = request.headers.host || "localhost:3000";
  const url = `${protocol}://${host}${request.url}`;

  // Convert headers
  const headers = new Headers();
  Object.entries(request.headers).forEach(([key, value]) => {
    if (value) {
      // Handle array values (some headers can be arrays)
      const headerValue = Array.isArray(value) ? value.join(", ") : value;
      headers.set(key, headerValue);
    }
  });

  // Handle request body
  let body: string | undefined;
  if (
    request.method === "POST" ||
    request.method === "PUT" ||
    request.method === "PATCH"
  ) {
    // Fastify body is already parsed
    body =
      typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body);
  }

  return new Request(url, {
    method: request.method || "GET",
    headers,
    body,
  });
}

/**
 * Convert Web Response to Fastify Reply
 */
async function convertWebResponseToFastify(
  response: Response,
  reply: FastifyReply
): Promise<void> {
  // Set status code
  reply.status(response.status);

  // Set headers
  response.headers.forEach((value, key) => {
    reply.header(key, value);
  });

  // Handle response body
  const contentType = response.headers.get("content-type");

  if (contentType && contentType.includes("application/json")) {
    // JSON response
    const data = await response.json();
    reply.send(data);
  } else {
    // Text or other response
    const text = await response.text();
    reply.send(text);
  }
}

/**
 * Alternative Fastify adapter that returns route options
 * for use with Fastify's route registration
 */
export function toFastifyRouteHandler(handler: UniversalHandler) {
  const fastifyHandler = toFastifyHandler(handler);

  return {
    method: ["GET", "POST"] as const,
    handler: fastifyHandler,
  };
}
