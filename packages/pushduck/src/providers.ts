/**
 * @fileoverview `pushduck/providers` — the provider registry, for tooling.
 *
 * What each storage provider accepts, requires and derives, and where its
 * requests go: the same definitions the server uses, without the server. Built
 * for code that sets pushduck up rather than runs it — the CLI resolves its
 * bucket checks through this, so `pushduck init` and the server can never
 * disagree about an endpoint, a signing region or path-style addressing.
 *
 * Free of any framework and of the router and storage client, so importing it
 * pulls in only the provider definitions.
 *
 * @example
 * ```typescript
 * import { createProvider, toStorageTarget } from "pushduck/providers";
 *
 * const target = toStorageTarget(
 *   createProvider("neonStorage", { endpoint, bucket, accessKeyId, secretAccessKey })
 * );
 * // target.endpoint, target.region (read from the endpoint), target.forcePathStyle
 * ```
 */

export {
  createProvider,
  PROVIDERS,
  toStorageTarget,
  validateProviderConfig,
} from "./core/providers/providers";

export type {
  AWSProviderConfig,
  BaseProviderConfig,
  CloudflareR2Config,
  DigitalOceanSpacesConfig,
  GoogleCloudStorageConfig,
  MinIOConfig,
  NeonStorageConfig,
  ProviderConfig,
  ProviderConfigMap,
  ProviderDefinition,
  ProviderType,
  S3AclValue,
  S3CompatibleConfig,
  StorageTarget,
} from "./core/providers/providers";
