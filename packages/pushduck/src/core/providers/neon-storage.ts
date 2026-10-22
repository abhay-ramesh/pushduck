import {
  awsSigningRegion,
  defineProvider,
  type BaseProviderConfig,
} from "./define";

/**
 * Configuration for Neon Object Storage.
 * S3-compatible storage built into a Neon project. Buckets belong to a branch
 * and branch with the database, so every branch has its own endpoint and its
 * own copy-on-write view of each bucket.
 *
 * @interface NeonStorageConfig
 * @extends BaseProviderConfig
 *
 * @example Basic Configuration
 * ```typescript
 * const neonConfig: NeonStorageConfig = {
 *   provider: 'neon-storage',
 *   endpoint: 'https://br-cool-darkness-a1b2c3d4.storage.c-6.us-east-2.aws.neon.tech',
 *   bucket: 'user-uploads',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!, // nak_live_...
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!, // nsk_live_...
 * };
 * ```
 */
export interface NeonStorageConfig extends BaseProviderConfig {
  provider: "neon-storage";
  /**
   * The branch storage endpoint, exposed as `AWS_ENDPOINT_URL_S3` by
   * `neon env pull` and inside Neon Functions.
   */
  endpoint: string;
  /** The Neon credential `token_id` (`nak_live_...`) */
  accessKeyId: string;
  /** The Neon credential `s3_secret_access_key` (`nsk_live_...`) */
  secretAccessKey: string;
  /**
   * Signing region. Read from the endpoint hostname when omitted — a
   * `...us-east-2.aws.neon.tech` endpoint signs as `us-east-2`.
   */
  region: string;
}

/**
 * Reads the signing region out of a Neon branch storage endpoint.
 *
 * Branch endpoints carry their region in the hostname
 * (`br-....storage.c-6.us-east-2.aws.neon.tech`), so asking for it separately
 * only creates a way to get it wrong: a mismatched region fails every request
 * with `SignatureDoesNotMatch`, which names the signature rather than the
 * region.
 *
 * @internal
 */
export function getNeonStorageRegion(endpoint: string): string | undefined {
  try {
    const { hostname } = new URL(endpoint);
    return /\.([a-z]{2}-[a-z]+-\d+)\.aws\.neon\.tech$/.exec(hostname)?.[1];
  } catch {
    return undefined;
  }
}

export const neonStorage = defineProvider<NeonStorageConfig>({
  id: "neon-storage",
  name: "Neon Object Storage",
  fields: [
    "endpoint",
    "bucket",
    "accessKeyId",
    "secretAccessKey",
    "region",
    "customDomain",
    "acl",
  ],
  defaults: { acl: "private" },
  derive: (config) => ({
    endpoint: config.endpoint.replace(/\/+$/, ""),
    region: config.region || getNeonStorageRegion(config.endpoint) || "",
  }),
  required: ["endpoint", "accessKeyId", "secretAccessKey"],
  check: (config) => {
    const errors: string[] = [];
    const endpointRegion = getNeonStorageRegion(config.endpoint);

    if (config.endpoint && !/^https:\/\//.test(config.endpoint)) {
      errors.push("Neon Object Storage endpoint must be an https:// URL");
    }

    if (!config.region) {
      errors.push(
        "Neon Object Storage region is required when it cannot be read from the endpoint"
      );
    } else if (endpointRegion && config.region !== endpointRegion) {
      // Signing with any other region fails every request with
      // SignatureDoesNotMatch, which does not mention the region.
      errors.push(
        `Neon Object Storage region "${config.region}" does not match the endpoint's region "${endpointRegion}" — remove region to use the endpoint's`
      );
    }

    return errors;
  },
  supportsAcl: false,
  addressing: (config) => ({
    endpoint: config.endpoint,
    region: awsSigningRegion(config.region),
    forcePathStyle: true, // Neon only supports path-style addressing
  }),
});
