import {
  awsSigningRegion,
  defineProvider,
  type BaseProviderConfig,
} from "./define";

/**
 * Configuration for any other S3-compatible service — Backblaze B2, Wasabi,
 * Google Cloud Storage through its XML API with HMAC keys, and so on.
 */
export interface S3CompatibleConfig extends BaseProviderConfig {
  provider: "s3-compatible";
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string; // Required for generic S3-compatible providers
  /** Session token for temporary credentials. */
  sessionToken?: string;
}

export const s3Compatible = defineProvider<S3CompatibleConfig>({
  id: "s3-compatible",
  name: "S3-compatible",
  fields: [
    "endpoint",
    "bucket",
    "accessKeyId",
    "secretAccessKey",
    "sessionToken",
    "region",
    "customDomain",
    "acl",
    "forcePathStyle",
  ],
  // Most S3-compatible services want the bucket in the path; virtual-hosted
  // ones (Backblaze B2, Wasabi) set forcePathStyle: false.
  defaults: { region: "us-east-1", acl: "private", forcePathStyle: true },
  required: ["endpoint", "accessKeyId", "secretAccessKey"],
  supportsAcl: true,
  addressing: (config) => ({
    endpoint: config.endpoint,
    region: awsSigningRegion(config.region || "us-east-1"),
    forcePathStyle: config.forcePathStyle !== false,
  }),
});
