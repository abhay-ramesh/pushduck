import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

/**
 * Express Adapter for Universal Handlers
 *
 * Converts Web Standard Request/Response handlers to Express middleware format.
 * Works with Express.js applications.
 */
export function toExpressHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  return async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const method = req.method as "GET" | "POST";

      if (!method || !(method in handlers)) {
        return res.status(405).json({ error: "Method not allowed" });
      }

      // Convert Express Request to Web Request
      const webRequest = convertExpressToWebRequest(req);

      // Call the universal handler
      const response = await handlers[method](webRequest);

      // Convert Web Response back to Express Response
      await convertWebResponseToExpress(response, res);
    } catch (error) {
      console.error("Express Handler Error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: errorMessage,
        });
      }
    }
  };
}

/**
 * Convert Express Request to Web Request
 */
function convertExpressToWebRequest(req: ExpressRequest): Request {
  // Build the full URL
  const protocol = req.protocol || "http";
  const host = req.get("host") || "localhost:3000";
  const url = `${protocol}://${host}${req.originalUrl || req.url}`;

  // Convert headers
  const headers = new Headers();
  Object.entries(req.headers).forEach(([key, value]) => {
    if (value) {
      // Handle array values (some headers can be arrays)
      const headerValue = Array.isArray(value) ? value.join(", ") : value;
      headers.set(key, headerValue);
    }
  });

  // Handle request body
  let body: string | undefined;
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    // Express body is already parsed by body-parser middleware
    body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  return new Request(url, {
    method: req.method || "GET",
    headers,
    body,
  });
}

/**
 * Convert Web Response to Express Response
 */
async function convertWebResponseToExpress(
  response: Response,
  res: ExpressResponse
): Promise<void> {
  // Set status code
  res.status(response.status);

  // Set headers
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  // Handle response body
  const contentType = response.headers.get("content-type");

  if (contentType && contentType.includes("application/json")) {
    // JSON response
    const data = await response.json();
    res.json(data);
  } else {
    // Text or other response
    const text = await response.text();
    res.send(text);
  }
}
