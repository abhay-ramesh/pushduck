import type { UploadConfig } from "../config/upload-config";
import { normalizeServerError } from "../errors/from-pushduck-error";
import {
  PROBLEM_JSON_MEDIA_TYPE,
  toProblemDetails,
  UploadError,
  type ProblemDetails,
} from "../errors";
import {
  PROTOCOL_VERSION,
  withTelemetryHeaders,
  type RequestIdentity,
} from "../protocol";
import type { S3Router, S3RouterDefinition } from "../router/router-v2";
import { logger } from "../utils/logger";

/**
 * Universal S3 Handler using Web Standard Request/Response
 *
 * This handler is framework-agnostic and can be adapted to any framework
 * that supports Web Standard APIs (Next.js, Express, Hono, Fastify, etc.)
 *
 * ## Error handling
 *
 * Failures are returned as RFC 9457 problem documents with the status their
 * code implies — a rejected auth middleware produces a `401`, an oversized file
 * a `413`, an unreachable bucket a `502`. Previously every failure was a `500`
 * with a bare string, which meant no client, proxy, or retry policy could tell
 * "you are not signed in" from "storage is down".
 *
 * Detail is redacted by status class: 4xx describes the caller's own request
 * and passes through; 5xx may describe our internals and is replaced with a
 * generic title unless `debug` is enabled.
 */
export function createUniversalHandler<TRoutes extends S3RouterDefinition>(
  router: S3Router<TRoutes>,
  uploadConfig: UploadConfig
): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
} {
  /**
   * Renders an error as a problem document, applying the app's formatter.
   *
   * Centralised so every failure path — validation, routing, middleware,
   * storage — produces an identically shaped body.
   */
  function fail(
    error: UploadError,
    request: Request,
    identity: RequestIdentity
  ): Response {
    const instance = new URL(request.url).pathname + new URL(request.url).search;

    const withInstance = error.instance
      ? error
      : new UploadError(error.code, error.message, {
          cause: error.cause,
          meta: error.meta,
          status: error.status,
          retryable: error.retryable,
          instance,
        });

    // Server-side failures are worth a log line; client mistakes are not, or a
    // scripted client could flood the logs.
    if (!withInstance.isClientError) {
      logger.error("Upload handler error", {
        code: withInstance.code,
        status: withInstance.status,
        message: withInstance.message,
        instance,
      });
    }

    const problem = toProblemDetails(withInstance, {
      debug: uploadConfig.debug,
    });

    const shaped = uploadConfig.errorFormatter
      ? applyFormatter(uploadConfig.errorFormatter, withInstance, problem, request)
      : problem;

    return withTelemetryHeaders(
      new Response(JSON.stringify(shaped), {
        status: shaped.status ?? withInstance.status,
        headers: { "Content-Type": PROBLEM_JSON_MEDIA_TYPE },
      }),
      identity,
      PROTOCOL_VERSION
    );
  }

  async function POST(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const identity: RequestIdentity = {
      route: url.searchParams.get("route") ?? undefined,
      action: url.searchParams.get("action") || "presign",
    };

    try {
      const routeName = identity.route;
      const action = identity.action;

      if (!routeName) {
        throw new UploadError(
          "BAD_REQUEST",
          "The `route` query parameter is required",
          { meta: { parameter: "route" } }
        );
      }

      if (!router.getRouteNames().includes(routeName)) {
        throw new UploadError("NOT_FOUND", `Route "${routeName}" not found`, {
          meta: {
            route: routeName,
            availableRoutes: router.getRouteNames(),
          },
        });
      }

      const body = await readJsonBody(request, uploadConfig);

      if (action === "presign") {
        /**
         * Extract files array and optional metadata from request body.
         *
         * @security
         * Client metadata is untrusted user input. The router's middleware
         * is responsible for validation and sanitization before use.
         */
        const { files, metadata } = body;
        if (!Array.isArray(files)) {
          throw new UploadError(
            "BAD_REQUEST",
            "`files` must be an array of file descriptors",
            { meta: { received: typeof files } }
          );
        }

        const results = await router.generatePresignedUrls(
          routeName,
          request,
          files,
          metadata
        );

        return json({ success: true, results }, 200, identity);
      }

      if (action === "complete") {
        const { completions } = body;
        if (!Array.isArray(completions)) {
          throw new UploadError(
            "BAD_REQUEST",
            "`completions` must be an array",
            { meta: { received: typeof completions } }
          );
        }

        const results = await router.handleUploadComplete(
          routeName,
          request,
          completions
        );

        return json({ success: true, results }, 200, identity);
      }

      throw new UploadError("BAD_REQUEST", `Unknown action: ${action}`, {
        meta: { action, supportedActions: ["presign", "complete"] },
      });
    } catch (error) {
      return fail(normalizeServerError(error), request, identity);
    }
  }

  async function GET(request: Request): Promise<Response> {
    const identity: RequestIdentity = { action: "introspect" };

    try {
      const routes = router.getRouteNames();

      return json(
        {
          success: true,
          // Advertised so a client, a conformance runner, or a synthetic check
          // can negotiate without parsing an upload response.
          protocolVersion: PROTOCOL_VERSION,
          routes: routes.map((name) => ({ name, type: "s3-upload" })),
        },
        200,
        identity
      );
    } catch (error) {
      return fail(normalizeServerError(error), request, identity);
    }
  }

  return { GET, POST };
}

/** Successful JSON response, carrying the identity headers. */
function json(
  payload: unknown,
  status = 200,
  identity: RequestIdentity = { action: "unknown" }
): Response {
  return withTelemetryHeaders(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
    identity,
    PROTOCOL_VERSION
  );
}

/**
 * Parses the request body, bounded in size.
 *
 * An unbounded `request.json()` lets a hostile client post an enormous metadata
 * blob and consume server memory. The limit is applied before parsing, using
 * `Content-Length` where present.
 */
async function readJsonBody(
  request: Request,
  config: UploadConfig
): Promise<Record<string, unknown>> {
  const limit = config.maxRequestBodyBytes ?? DEFAULT_BODY_LIMIT_BYTES;

  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) {
    throw new UploadError(
      "PAYLOAD_TOO_LARGE",
      "Request body exceeds the maximum size",
      { meta: { limit, actual: declared } }
    );
  }

  const text = await request.text();
  if (text.length > limit) {
    throw new UploadError(
      "PAYLOAD_TOO_LARGE",
      "Request body exceeds the maximum size",
      { meta: { limit, actual: text.length } }
    );
  }

  if (!text) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    throw new UploadError("BAD_REQUEST", "Request body is not valid JSON", {
      cause: error,
    });
  }
}

/** 100 KB is generous for file descriptors plus metadata, and cheap to hold. */
const DEFAULT_BODY_LIMIT_BYTES = 100 * 1024;

/**
 * Applies a user-supplied formatter, falling back if it throws.
 *
 * The formatter is app code. An exception while *reporting* an error must not
 * escalate into an unhandled rejection, so a throw here is logged and the
 * unformatted problem document is sent instead.
 */
function applyFormatter(
  formatter: NonNullable<UploadConfig["errorFormatter"]>,
  error: UploadError,
  problem: ProblemDetails,
  request: Request
): ProblemDetails {
  try {
    return formatter({ error, problem, request }) ?? problem;
  } catch (formatterError) {
    logger.error("errorFormatter threw; sending the unformatted problem", {
      formatterError,
    });
    return problem;
  }
}
