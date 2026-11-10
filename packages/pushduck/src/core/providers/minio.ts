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
  defaults: { endpoint: "localhost:9000", region: "us-east-1", acl: "private" },
  derive: (_config, input) => ({
    useSSL: input.useSSL ?? false,
    port: input.port ? Number(input.port) : undefined,
  }),
  required: ["endpoint", "accessKeyId", "secretAccessKey"],
  supportsAcl: false,
  addressing: (config) => ({
    endpoint: minioEndpoint(config),
    region: awsSigningRegion(config.region || "us-east-1"),
    forcePathStyle: true, // MinIO requires path-style
  }),
});
