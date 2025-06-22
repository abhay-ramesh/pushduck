import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Next.js Pages Router Adapter for Universal Handlers
 *
 * Converts Web Standard Request/Response handlers to Pages Router format.
 * Uses the traditional req/res pattern with NextApiRequest/NextApiResponse.
 */
export function toNextJsPagesHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      const method = req.method as "GET" | "POST";

      if (!method || !(method in handlers)) {
        return res.status(405).json({ error: "Method not allowed" });
      }

      // Convert NextApiRequest to Web Request
      const webRequest = convertNextApiRequestToWebRequest(req);

      // Call the universal handler
      const response = await handlers[method](webRequest);

      // Convert Web Response back to NextApiResponse
      await convertWebResponseToNextApiResponse(response, res);
    } catch (error) {
      console.error("Pages Router Handler Error:", error);
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
 * Convert NextApiRequest to Web Request
 */
function convertNextApiRequestToWebRequest(req: NextApiRequest): Request {
  // Build the full URL
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || "localhost:3000";
  const url = `${protocol}://${host}${req.url}`;

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
    // For Pages Router, body is already parsed by Next.js
    body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  return new Request(url, {
    method: req.method || "GET",
    headers,
    body,
  });
}

/**
 * Convert Web Response to NextApiResponse
 */
async function convertWebResponseToNextApiResponse(
  response: Response,
  res: NextApiResponse
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
