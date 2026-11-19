/**
 * @fileoverview The bucket CORS rules pushduck's browser client needs.
 *
 * Browser uploads go straight to the bucket, so the bucket — not the app —
 * decides whether the browser may send them. A bucket without a rule for the
 * page's origin rejects the preflight and the upload fails with a bare network
 * error; one whose rule hides `ETag` lets single-file uploads through and
 * fails every multipart upload.
 *
 * This file is the one statement of what a rule must allow. It is derived
 * from what the client actually sends (`core/upload/transport.ts`,
 * `preparePresignHeaders` in `core/storage/client.ts`), and both the CLI's
 * `pushduck cors check|apply` and the rule `pushduck init` writes on bucket
 * creation read it — change the client's requests and this together.
 */

import type { StorageTarget } from "./define";

/**
 * One bucket CORS rule, in the S3 `CORSRule` shape.
 *
 * Header names compare case-insensitively; origins and methods exactly.
 */
export interface CorsRule {
  /** Rule identifier. pushduck's own rule uses {@link CORS_RULE_ID}. */
  id?: string;
  /** Origins, each `scheme://host[:port]`, `*`, or a pattern with one `*`. */
  allowedOrigins: string[];
  /** HTTP methods: `GET`, `PUT`, `HEAD`, `POST`, `DELETE`. */
  allowedMethods: string[];
  /** Request headers the browser may send; may contain `*` wildcards. */
  allowedHeaders: string[];
  /** Response headers the browser's JavaScript may read. */
  exposeHeaders: string[];
  /** How long the browser may cache a preflight answer. */
  maxAgeSeconds?: number;
}

/** One kind of request the browser makes directly to the bucket. */
export interface CorsRequirement {
  /** What the request is for, used in messages. */
  purpose: "upload" | "download";
  method: "PUT" | "GET";
  /**
   * Request headers that are not CORS-safelisted, lowercase. Each must be
   * allowed, or the preflight fails.
   */
  headers: string[];
  /** Response headers the client reads, lowercase. Each must be exposed. */
  exposes: string[];
}

/**
 * The browser requests a bucket must allow for this target.
 *
 * - **upload** — a `PUT` to a presigned URL: single-file uploads and every
 *   multipart part. It carries `Content-Type`, and `x-amz-acl` on providers
 *   that accept ACLs (the server signs it in, so the browser must send it).
 *   The multipart uploader reads each part's `ETag` to complete the upload.
 * - **download** — a `GET` to a presigned or public URL from `fetch`.
 *
 * Nothing else: creating, completing and aborting multipart uploads, deletes
 * and `HEAD` checks all run on the server, so `POST`, `DELETE` and `HEAD` are
 * not needed — and a presigned `GET` URL cannot be used for `HEAD` anyway, as
 * the method is part of the signature.
 */
export function corsRequirements(
  target: Pick<StorageTarget, "supportsAcl">
): CorsRequirement[] {
  return [
    {
      purpose: "upload",
      method: "PUT",
      headers: target.supportsAcl
        ? ["content-type", "x-amz-acl"]
        : ["content-type"],
      exposes: ["etag"],
    },
    { purpose: "download", method: "GET", headers: [], exposes: [] },
  ];
}

/** The `id` of the rule pushduck writes, so it can find and extend it. */
export const CORS_RULE_ID = "pushduck";

/** Preflight cache lifetime for the rule pushduck writes: one hour. */
export const CORS_MAX_AGE_SECONDS = 3600;

/**
 * The rule that satisfies {@link corsRequirements} for these origins.
 *
 * Headers are listed rather than `*`: the rule allows exactly what the client
 * sends, and `pushduck cors check` reports it when that changes.
 */
export function corsRule(
  origins: readonly string[],
  target: Pick<StorageTarget, "supportsAcl">
): CorsRule {
  const requirements = corsRequirements(target);
  const union = (pick: (r: CorsRequirement) => string[]) => [
    ...new Set(requirements.flatMap(pick)),
  ];

  return {
    id: CORS_RULE_ID,
    allowedOrigins: [...origins],
    allowedMethods: union((r) => [r.method]),
    allowedHeaders: union((r) => r.headers),
    // Written as S3's own docs spell it; header names compare case-insensitively.
    exposeHeaders: union((r) => r.exposes).map((h) => (h === "etag" ? "ETag" : h)),
    maxAgeSeconds: CORS_MAX_AGE_SECONDS,
  };
}

/**
 * How a provider's bucket CORS is managed.
 *
 * - `s3` — read and written with the S3 API's `GetBucketCors` and
 *   `PutBucketCors`. `permissionHint` explains when credentials that can
 *   upload still cannot change bucket configuration.
 * - `external` — not through the S3 API. `instructions` says how to apply
 *   the given rules with the provider's own tools.
 */
export type BucketCorsSupport =
  | { readonly api: "s3"; readonly permissionHint?: string }
  | {
      readonly api: "external";
      readonly instructions: (
        rules: readonly CorsRule[],
        bucket: string
      ) => string;
    };
