/**
 * @fileoverview Request identity, exposed as headers.
 *
 * The route and action currently live only in the query string, which every
 * layer of infrastructure is entitled to treat as droppable metadata:
 *
 * - CloudFront selects cache behaviours by `PathPattern` only, and its managed
 *   cache policies drop query strings before the origin sees them
 * - API Gateway keys routes and throttles on resource path
 * - OpenTelemetry, Datadog, Sentry and New Relic all aggregate by
 *   method + route template and strip the query by default
 *
 * So today every presign, every complete, and every future part-signature is
 * one indistinguishable line — `POST /api/upload` — in every dashboard and
 * every rate-limit rule.
 *
 * Headers fix that without touching the URL. Header matching is supported by
 * the same set of systems that support path matching — AWS WAF `SingleHeader`,
 * Cloudflare `http.request.headers`, CloudFront origin request policies, nginx
 * `$http_*`, Envoy — so the operational win lands without a breaking wire
 * change.
 *
 * Deliberately not an OpenTelemetry integration. Taking a dependency on
 * `@opentelemetry/api` would tie the library to one vendor's evolving API, the
 * same trap the error design avoids. Emitting the values as headers and as
 * structured log context lets any tracer, logger, or proxy consume them, and
 * the consumer attaches them to a span in three lines of their own code.
 *
 * @example Attaching to a span, in the consumer's code
 * ```typescript
 * const response = await uploadRouter.handler(request);
 * span.setAttribute("pushduck.route", response.headers.get("x-pushduck-route"));
 * span.setAttribute("pushduck.action", response.headers.get("x-pushduck-action"));
 * ```
 *
 * @example Rate-limiting presign separately from complete (nginx)
 * ```nginx
 * limit_req_zone $http_x_pushduck_action zone=upload:10m rate=30r/m;
 * ```
 */

/** Route this request targeted, echoed on every response. */
export const HEADER_ROUTE = "X-Pushduck-Route";

/** Operation performed: `presign`, `complete`, or `introspect`. */
export const HEADER_ACTION = "X-Pushduck-Action";

/**
 * Wire protocol version this server speaks.
 *
 * Lets a client, proxy, or synthetic check detect a version mismatch without
 * parsing a body, and gives CDN logs a field to correlate on after a deploy.
 */
export const HEADER_PROTOCOL = "X-Pushduck-Protocol";

/**
 * The operations the protocol defines.
 *
 * `introspect` is the `GET` that lists routes; it takes no route name.
 */
export type UploadAction = "presign" | "complete" | "introspect";

/** Identity of a single protocol request. */
export interface RequestIdentity {
  /** Route name, absent for introspection and for malformed requests. */
  route?: string;
  /** Operation, as far as it could be determined. */
  action: UploadAction | string;
}

/**
 * Adds identity headers to a response.
 *
 * Applied to successes *and* failures: a rate limiter or dashboard that can
 * only see successful requests is of limited use, and the failure case is
 * usually the one being investigated.
 *
 * @param response - Response to annotate
 * @param identity - Route and action for this request
 * @param protocolVersion - Value for {@link HEADER_PROTOCOL}
 * @returns A response carrying the headers. The original is returned mutated
 *   where its headers are writable, and cloned otherwise — some runtimes
 *   return immutable headers for certain constructions.
 */
export function withTelemetryHeaders(
  response: Response,
  identity: RequestIdentity,
  protocolVersion: number
): Response {
  const apply = (headers: Headers) => {
    if (identity.route) headers.set(HEADER_ROUTE, identity.route);
    headers.set(HEADER_ACTION, String(identity.action));
    headers.set(HEADER_PROTOCOL, String(protocolVersion));
  };

  try {
    apply(response.headers);
    return response;
  } catch {
    // Immutable headers (a cached or redirect response): rebuild instead.
    const headers = new Headers(response.headers);
    apply(headers);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
