import {
  awsSigningRegion,
  defineProvider,
  type BaseProviderConfig,
} from "./define";

/**
 * Configuration for Google Cloud Storage.
 *
 * pushduck talks to GCS through its S3-compatible XML API, signed with an
 * **HMAC key** — an access ID beginning `GOOG` and a secret, created under
 * Cloud Storage → Settings → Interoperability. A service-account JSON key
 * cannot produce that signature, so it is not accepted here.
 *
 * @interface GoogleCloudStorageConfig
 * @extends BaseProviderConfig
 *
 * @example
 * ```typescript
 * const gcsConfig: GoogleCloudStorageConfig = {
 *   provider: 'gcs',
 *   bucket: 'my-app-uploads',
 *   accessKeyId: process.env.GCS_ACCESS_KEY_ID!,       // GOOG…
 *   secretAccessKey: process.env.GCS_SECRET_ACCESS_KEY!,
 * };
 * ```
 */
export interface GoogleCloudStorageConfig extends BaseProviderConfig {
  provider: "gcs";
  /** HMAC access ID (`GOOG…`). */
  accessKeyId: string;
  /** HMAC secret. */
  secretAccessKey: string;
  /** XML API endpoint. Defaults to `https://storage.googleapis.com`. */
  endpoint?: string;
  /**
   * Signing region. Defaults to `"auto"`, which GCS accepts for every bucket
   * location; a bucket's own location (e.g. `us-central1`) also works.
   */
  region?: string;
}

export const gcs = defineProvider<GoogleCloudStorageConfig>({
  id: "gcs",
  name: "Google Cloud Storage",
  fields: [
    "bucket",
    "accessKeyId",
    "secretAccessKey",
    "endpoint",
    "region",
    "customDomain",
    "forcePathStyle",
    "acl",
  ],
  defaults: {
    endpoint: "https://storage.googleapis.com",
    region: "auto",
    forcePathStyle: true,
  },
  derive: (config) => ({
    endpoint: (config.endpoint || "https://storage.googleapis.com").replace(
      /\/+$/,
      ""
    ),
  }),
  required: [],
  // One message for both a missing key and a config written for the old
  // service-account provider (whose projectId/keyFilename are reported as
  // ignored options): either way, what is needed is an HMAC key.
  check: (config) =>
    config.accessKeyId && config.secretAccessKey
      ? []
      : [
          "Google Cloud Storage needs an HMAC key (accessKeyId GOOG…, secretAccessKey), not a service-account key — create one under Cloud Storage → Settings → Interoperability",
        ],
  // Buckets with uniform bucket-level access — the default for new buckets —
  // reject x-amz-acl outright ("Cannot insert legacy ACL"). Access is granted
  // with IAM on the bucket instead.
  supportsAcl: false,
  addressing: (config) => ({
    endpoint: config.endpoint,
    region: awsSigningRegion(config.region || "auto"),
    forcePathStyle: config.forcePathStyle !== false,
  }),
});
