/**
 * @fileoverview The wire protocol: version, operations, and request identity.
 *
 * pushduck's real product is a three-call HTTP contract, not the TypeScript
 * that happens to implement it:
 *
 * 1. `POST {endpoint}?route=R&action=presign`   → presigned URLs
 * 2. `PUT  <presignedUrl>`                      → bytes, direct to storage
 * 3. `POST {endpoint}?route=R&action=complete`  → post-processing hooks
 *
 * Any language can implement that. Naming it here — rather than leaving it as
 * an accident of `universal-handler.ts` — is what lets the Go and Python ports
 * be a *supported configuration* instead of reverse engineering, and what a
 * conformance suite tests against.
 *
 * @see docs/content/docs/protocol.mdx for the normative specification.
 */

/**
 * Version of the wire protocol this build speaks.
 *
 * Reported by the introspection endpoint and on every response via
 * `X-Pushduck-Protocol`, so a client or synthetic check can detect a mismatch
 * without parsing a body.
 *
 * **Bump this only for a breaking change to the contract** — a new required
 * field, a changed URL shape, a removed operation. Additive changes (a new
 * optional field, a new `action`) do not bump it: a client that ignores an
 * unknown field keeps working, which is the whole point of versioning
 * separately from the package.
 *
 * Version 1 is the query-parameter form documented above. If the URL shape
 * ever moves to path segments, that is version 2, and servers are expected to
 * accept version 1 indefinitely so no deployment order can break.
 */
export const PROTOCOL_VERSION = 1;

export {
  HEADER_ACTION,
  HEADER_PROTOCOL,
  HEADER_ROUTE,
  withTelemetryHeaders,
} from "./telemetry";
export type { RequestIdentity, UploadAction } from "./telemetry";
