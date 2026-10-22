import {
  awsSigningRegion,
  defineProvider,
  type BaseProviderConfig,
} from "./define";

/**
 * Configuration for DigitalOcean Spaces object storage.
 * S3-compatible storage service integrated with DigitalOcean's ecosystem.
 *
 * @interface DigitalOceanSpacesConfig
 * @extends BaseProviderConfig
 *
 * @example Basic Configuration
 * ```typescript
 * const spacesConfig: DigitalOceanSpacesConfig = {
 *   provider: 'digitalocean-spaces',
 *   bucket: 'my-space',
 *   region: 'nyc3',
 *   accessKeyId: 'your-spaces-key',
 *   secretAccessKey: 'your-spaces-secret',
 * };
 * ```
 *
 * @example Available Regions
 * ```typescript
 * const regions = ['nyc3', 'ams3', 'sgp1', 'sfo3', 'fra1'];
 * const spacesConfig: DigitalOceanSpacesConfig = {
 *   provider: 'digitalocean-spaces',
 *   bucket: 'global-assets',
 *   region: 'fra1', // Frankfurt
 *   accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY!,
 * };
 * ```
 */
export interface DigitalOceanSpacesConfig extends BaseProviderConfig {
  provider: "digitalocean-spaces";
  /** Spaces Access Key ID */
  accessKeyId: string;
  /** Spaces Secret Access Key */
  secretAccessKey: string;
  /** DigitalOcean region */
  region: string;
  /** Custom endpoint (auto-generated from region if not provided) */
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

export const digitalOceanSpaces = defineProvider<DigitalOceanSpacesConfig>({
  id: "digitalocean-spaces",
  name: "DigitalOcean Spaces",
  fields: [
    "region",
    "bucket",
    "accessKeyId",
    "secretAccessKey",
    "sessionToken",
    "endpoint",
    "customDomain",
    "acl",
  ],
  defaults: { region: "nyc3", acl: "private" },
  derive: (config) => ({
    endpoint:
      config.endpoint || `https://${config.region}.digitaloceanspaces.com`,
  }),
  required: ["accessKeyId", "secretAccessKey", "region"],
  supportsAcl: true,
  addressing: (config) => ({
    endpoint: config.endpoint,
    region: awsSigningRegion(config.region || "us-east-1"),
    forcePathStyle: false, // Spaces uses virtual-hosted style
  }),
});
