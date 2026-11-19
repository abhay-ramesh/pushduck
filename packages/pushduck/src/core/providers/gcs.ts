import type { CorsRule } from "./cors";
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

/**
 * The rules as GCS CORS JSON, and the gcloud command that applies them.
 *
 * GCS has one `responseHeader` list for both directions: it is matched
 * against the preflight's requested headers and returned as the exposed
 * headers, so it carries both.
 */
function gcloudCorsInstructions(
  rules: readonly CorsRule[],
  bucket: string
): string {
  const json = rules.map((rule) => ({
    origin: rule.allowedOrigins,
    method: rule.allowedMethods,
    responseHeader: [
      ...new Set([...rule.allowedHeaders, ...rule.exposeHeaders]),
    ],
    maxAgeSeconds: rule.maxAgeSeconds,
  }));

  return [
    "Google Cloud Storage bucket CORS is set with gcloud, not the S3 API. Save this as cors.json:",
    "",
    JSON.stringify(json, null, 2),
    "",
    "then run:",
    "",
    `  gcloud storage buckets update gs://${bucket} --cors-file=cors.json`,
    "",
    "This replaces the bucket's CORS configuration. To keep rules you already have, merge them in first:",
    "",
    `  gcloud storage buckets describe gs://${bucket} --format="default(cors_config)"`,
  ].join("\n");
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
  // GCS keeps bucket CORS in its own JSON format, set with gcloud or the JSON
  // API; its XML API takes a different document than S3's PutBucketCors.
  // https://cloud.google.com/storage/docs/using-cors
  cors: { api: "external", instructions: gcloudCorsInstructions },
  addressing: (config) => ({
    endpoint: config.endpoint,
    region: awsSigningRegion(config.region || "auto"),
    forcePathStyle: config.forcePathStyle !== false,
  }),
});
