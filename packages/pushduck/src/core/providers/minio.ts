import type { CorsRule } from "./cors";
import {
  awsSigningRegion,
  defineProvider,
  type BaseProviderConfig,
} from "./define";

/**
 * Configuration for MinIO object storage.
 * Self-hosted S3-compatible storage for on-premises or private cloud deployments.
 *
 * @interface MinIOConfig
 * @extends BaseProviderConfig
 *
 * @example Local Development
 * ```typescript
 * const minioConfig: MinIOConfig = {
 *   provider: 'minio',
 *   endpoint: 'http://localhost:9000',
 *   bucket: 'uploads',
 *   accessKeyId: 'minioadmin',
 *   secretAccessKey: 'minioadmin',
 *   useSSL: false,
 * };
 * ```
 *
 * @example Production Setup
 * ```typescript
 * const minioProduction: MinIOConfig = {
 *   provider: 'minio',
 *   endpoint: 'https://minio.mycompany.com',
 *   bucket: 'production-uploads',
 *   accessKeyId: process.env.MINIO_ACCESS_KEY!,
 *   secretAccessKey: process.env.MINIO_SECRET_KEY!,
 *   useSSL: true,
 *   port: 9000,
 * };
 * ```
 */
export interface MinIOConfig extends BaseProviderConfig {
  provider: "minio";
  /** MinIO server endpoint URL */
  endpoint: string;
  /** MinIO access key */
  accessKeyId: string;
  /** MinIO secret key */
  secretAccessKey: string;
  /** Whether to use SSL/TLS */
  useSSL?: boolean;
  /** Custom port (default: 9000) */
  port?: number;
  /**
   * Session token for temporary credentials.
   *
   * Set when credentials come from STS rather than a static key pair. SigV4
   * signs it as `X-Amz-Security-Token`; without it the provider rejects the
   * signature.
   */
  sessionToken?: string;
}

/**
 * The URL requests go to.
 *
 * MinIO is often configured the way `mc alias` and the docker images present
 * it — `localhost:9000`, or a host plus `useSSL` and `port` — rather than as a
 * URL. A full URL is used as written; anything else is assembled from
 * `useSSL` (default `http`) and `port`.
 */
function minioEndpoint(config: MinIOConfig): string {
  const endpoint = config.endpoint.replace(/\/+$/, "");

  if (/^https?:\/\//.test(endpoint)) {
    return endpoint;
  }

  const port =
    config.port && !/:\d+$/.test(endpoint) ? `:${config.port}` : "";
  return `${config.useSSL ? "https" : "http"}://${endpoint}${port}`;
}

/**
 * How to allow the rules' origins on a MinIO server.
 *
 * MinIO's CORS is server-wide (`MINIO_API_CORS_ALLOW_ORIGIN`, default `*`),
 * allows any method and header, and exposes `ETag` — so only the origins
 * carry over.
 */
function minioCorsInstructions(rules: readonly CorsRule[]): string {
  const origins = [...new Set(rules.flatMap((rule) => rule.allowedOrigins))];

  return [
    "MinIO sets CORS for the whole server, not per bucket (it answers PutBucketCors with 501 NotImplemented).",
    "It allows every origin unless MINIO_API_CORS_ALLOW_ORIGIN is set. To allow only these, start the server with",
    "",
    `  MINIO_API_CORS_ALLOW_ORIGIN="${origins.join(",")}"`,
    "",
    "or, on a running server:",
    "",
    `  mc admin config set <alias> api cors_allow_origin="${origins.join(",")}"`,
  ].join("\n");
}

export const minio = defineProvider<MinIOConfig>({
  id: "minio",
  name: "MinIO",
  fields: [
    "endpoint",
    "bucket",
    "accessKeyId",
    "secretAccessKey",
    "sessionToken",
    "region",
    "customDomain",
    "acl",
  ],
  defaults: { endpoint: "localhost:9000", region: "us-east-1" },
  derive: (_config, input) => ({
    useSSL: input.useSSL ?? false,
    port: input.port ? Number(input.port) : undefined,
  }),
  required: ["endpoint", "accessKeyId", "secretAccessKey"],
  supportsAcl: false,
  // Open-source MinIO answers PutBucketCors with 501 NotImplemented and
  // GetBucketCors with NoSuchCORSConfiguration, whatever it allows: CORS is
  // one server-wide setting.
  cors: { api: "external", instructions: minioCorsInstructions },
  addressing: (config) => ({
    endpoint: minioEndpoint(config),
    region: awsSigningRegion(config.region || "us-east-1"),
    forcePathStyle: true, // MinIO requires path-style
  }),
});
