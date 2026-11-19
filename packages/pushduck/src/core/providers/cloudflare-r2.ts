import { defineProvider, type BaseProviderConfig } from "./define";

/**
 * The jurisdictions an R2 bucket can be restricted to, as Cloudflare lists
 * them: https://developers.cloudflare.com/r2/reference/data-location/#available-jurisdictions
 */
export const R2_JURISDICTIONS = ["eu", "fedramp", "us"] as const;

/** A data-residency jurisdiction for an R2 bucket. */
export type R2Jurisdiction = (typeof R2_JURISDICTIONS)[number];

/**
 * Configuration for Cloudflare R2 object storage.
 * S3-compatible storage with zero egress fees and global distribution.
 *
 * @interface CloudflareR2Config
 * @extends BaseProviderConfig
 *
 * @example Basic Configuration
 * ```typescript
 * const r2Config: CloudflareR2Config = {
 *   provider: 'cloudflare-r2',
 *   bucket: 'my-r2-bucket',
 *   accountId: 'your-cloudflare-account-id',
 *   accessKeyId: 'your-r2-access-key',
 *   secretAccessKey: 'your-r2-secret-key',
 * };
 * ```
 *
 * @example Bucket in the EU jurisdiction
 * ```typescript
 * const euConfig: CloudflareR2Config = {
 *   provider: 'cloudflare-r2',
 *   bucket: 'eu-uploads',
 *   accountId: 'abc123',
 *   accessKeyId: 'key123',
 *   secretAccessKey: 'secret123',
 *   jurisdiction: 'eu', // requests go to https://abc123.eu.r2.cloudflarestorage.com
 * };
 * ```
 *
 * @example With Custom Domain
 * ```typescript
 * const r2WithDomain: CloudflareR2Config = {
 *   provider: 'cloudflare-r2',
 *   bucket: 'assets',
 *   accountId: 'abc123',
 *   accessKeyId: 'key123',
 *   secretAccessKey: 'secret123',
 *   customDomain: 'https://assets.myapp.com',
 * };
 * ```
 */
export interface CloudflareR2Config extends BaseProviderConfig {
  provider: "cloudflare-r2";
  /** Cloudflare Account ID */
  accountId: string;
  /** R2 Access Key ID */
  accessKeyId: string;
  /** R2 Secret Access Key */
  secretAccessKey: string;
  /** Region (typically 'auto' for R2) */
  region?: "auto";
  /**
   * The jurisdiction the bucket was created in, if any.
   *
   * A bucket created with a jurisdictional restriction is only reachable
   * through that jurisdiction's endpoint,
   * `https://<accountId>.<jurisdiction>.r2.cloudflarestorage.com`; the
   * default endpoint answers 403 for it. Set this to the jurisdiction shown
   * on the bucket in the Cloudflare dashboard and the endpoint is derived
   * from it. Leave it out for buckets without one.
   *
   * @see https://developers.cloudflare.com/r2/reference/data-location/#jurisdictional-restrictions
   */
  jurisdiction?: R2Jurisdiction;
  /**
   * API endpoint. Derived from `accountId` and `jurisdiction` when omitted;
   * set it only to send requests somewhere else, such as a proxy.
   */
  endpoint?: string;
  /**
   * Session token for temporary credentials.
   *
   * Set when credentials come from STS rather than a static key pair. SigV4
   * signs it as `X-Amz-Security-Token`; without it the provider rejects the
   * signature.
   */
  sessionToken?: string;
}

export const cloudflareR2 = defineProvider<CloudflareR2Config>({
  id: "cloudflare-r2",
  name: "Cloudflare R2",
  fields: [
    "accountId",
    "bucket",
    "accessKeyId",
    "secretAccessKey",
    "sessionToken",
    "jurisdiction",
    "endpoint",
    "customDomain",
    "acl",
  ],
  defaults: { acl: "private" },
  derive: (config) => ({
    endpoint:
      config.endpoint ||
      (config.accountId
        ? `https://${config.accountId}.${config.jurisdiction ? `${config.jurisdiction}.` : ""}r2.cloudflarestorage.com`
        : ""),
  }),
  required: ["accountId", "accessKeyId", "secretAccessKey"],
  check: (config) =>
    // "" is how an omitted option is stored. Anything else is checked against
    // Cloudflare's list before it reaches a hostname: a typo, or "EU" from an
    // environment variable, would otherwise surface as a DNS failure on the
    // first upload rather than here.
    config.jurisdiction &&
    !(R2_JURISDICTIONS as readonly string[]).includes(config.jurisdiction)
      ? [
          `Cloudflare R2 jurisdiction must be one of ${R2_JURISDICTIONS.map((j) => `"${j}"`).join(", ")}, got ${JSON.stringify(config.jurisdiction)}`,
        ]
      : [],
  supportsAcl: false,
  addressing: (config) => ({
    endpoint: config.endpoint,
    // R2 signs with the literal region "auto".
    region: config.region || "auto",
    forcePathStyle: true,
  }),
});
