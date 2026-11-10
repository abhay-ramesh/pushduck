import { defineProvider, type BaseProviderConfig } from "./define";

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
 * @example With Custom Domain
 * ```typescript
 * const r2WithDomain: CloudflareR2Config = {
 *   provider: 'cloudflare-r2',
 *   bucket: 'assets',
 *   accountId: 'abc123',
 *   accessKeyId: 'key123',
 *   secretAccessKey: 'secret123',
 *   customDomain: 'assets.myapp.com',
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
  /** Custom endpoint (auto-generated from accountId if not provided) */
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
    "endpoint",
    "customDomain",
    "acl",
  ],
  defaults: { acl: "private" },
  derive: (config) => ({
    endpoint:
      config.endpoint ||
      (config.accountId
        ? `https://${config.accountId}.r2.cloudflarestorage.com`
        : ""),
  }),
  required: ["accountId", "accessKeyId", "secretAccessKey"],
  supportsAcl: false,
  addressing: (config) => ({
    endpoint: config.endpoint,
    // R2 signs with the literal region "auto".
    region: config.region || "auto",
    forcePathStyle: true,
  }),
});
