import { defineProvider, type BaseProviderConfig } from "./define";

/**
 * Configuration for Amazon Web Services S3.
 * The most widely used object storage service with global availability.
 *
 * @interface AWSProviderConfig
 * @extends BaseProviderConfig
 *
 * @example Basic Configuration
 * ```typescript
 * const awsConfig: AWSProviderConfig = {
 *   provider: 'aws',
 *   bucket: 'my-app-uploads',
 *   region: 'us-east-1',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 * };
 * ```
 *
 * @example With Custom Domain
 * ```typescript
 * const awsWithCDN: AWSProviderConfig = {
 *   provider: 'aws',
 *   bucket: 'my-uploads',
 *   region: 'us-east-1',
 *   accessKeyId: 'AKIA...',
 *   secretAccessKey: 'secret...',
 *   customDomain: 'cdn.myapp.com',
 *   acl: 'public-read',
 * };
 * ```
 */
export interface AWSProviderConfig extends BaseProviderConfig {
  provider: "aws";
  /** AWS Access Key ID */
  accessKeyId: string;
  /** AWS Secret Access Key */
  secretAccessKey: string;
  /** AWS region (required) */
  region: string;
  /** AWS Session Token for temporary credentials */
  sessionToken?: string;
}

export const aws = defineProvider<AWSProviderConfig>({
  id: "aws",
  name: "AWS",
  fields: [
    "region",
    "bucket",
    "accessKeyId",
    "secretAccessKey",
    "sessionToken",
    "acl",
    "customDomain",
    "forcePathStyle",
  ],
  defaults: { region: "us-east-1", acl: "private" },
  required: ["accessKeyId", "secretAccessKey", "region"],
  supportsAcl: true,
  // No endpoint: the hostname is built from the region.
  addressing: (config) => ({
    region: config.region,
    forcePathStyle: config.forcePathStyle,
  }),
});
