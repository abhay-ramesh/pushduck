import { defineProvider, type BaseProviderConfig } from "./define";

/**
 * Configuration for Google Cloud Storage with a service account.
 *
 * Not usable for uploads: pushduck signs every request with S3-style HMAC
 * keys, and a service-account key cannot produce that signature, so resolving
 * this config to a storage target throws.
 */
export interface GoogleCloudStorageConfig extends BaseProviderConfig {
  provider: "gcs";
  projectId: string;
  keyFilename?: string;
  credentials?: object;
}

export const gcs = defineProvider<GoogleCloudStorageConfig>({
  id: "gcs",
  name: "Google Cloud",
  fields: ["projectId", "bucket", "keyFilename", "region", "customDomain", "acl"],
  defaults: { region: "us-central1", acl: "private" },
  derive: (_config, input) => ({ credentials: input.credentials }),
  required: ["projectId"],
  check: (config) =>
    config.keyFilename || config.credentials
      ? []
      : ["Google Cloud credentials (keyFilename or credentials object) are required"],
  supportsAcl: true,
  addressing: () => {
    throw new Error(
      "Google Cloud Storage is not S3-compatible for authentication. Use Google Cloud Storage client libraries instead, or consider Google Cloud Storage S3 interoperability (limited compatibility)."
    );
  },
});
