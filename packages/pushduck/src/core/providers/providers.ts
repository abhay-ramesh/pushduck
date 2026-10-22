/**
 * @fileoverview Cloud Storage Providers
 *
 * Each provider turns the options a user passes into a complete, validated
 * provider config. Supported: AWS S3, Cloudflare R2, DigitalOcean Spaces,
 * MinIO, Neon Object Storage, and any other S3-compatible service through
 * `s3Compatible`.
 *
 * Nothing here reads environment variables. Pass every value explicitly —
 * usually from `process.env` in your own config — so the source of each
 * setting is visible at the call site.
 *
 * @example AWS S3
 * ```typescript
 * import { createProvider } from 'pushduck/server';
 *
 * const s3Config = createProvider('aws', {
 *   bucket: 'my-uploads',
 *   region: 'us-east-1',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 * });
 * ```
 *
 * @example Cloudflare R2
 * ```typescript
 * const r2Config = createProvider('cloudflareR2', {
 *   bucket: 'my-r2-bucket',
 *   accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
 *   accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
 * });
 * ```
 *
 * @example MinIO (self-hosted)
 * ```typescript
 * const minioConfig = createProvider('minio', {
 *   endpoint: 'http://localhost:9000',
 *   bucket: 'uploads',
 *   accessKeyId: 'minioadmin',
 *   secretAccessKey: 'minioadmin',
 *   useSSL: false,
 * });
 * ```
 *
 * @example Neon Object Storage
 * ```typescript
 * const neonConfig = createProvider('neonStorage', {
 *   endpoint: process.env.AWS_ENDPOINT_URL_S3!,
 *   bucket: 'user-uploads',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *   // region is read from the endpoint hostname
 * });
 * ```
 */

import { logger } from "../utils/logger";
import { aws } from "./aws";
import { cloudflareR2 } from "./cloudflare-r2";
import {
  checkProviderConfig,
  type ProviderDefinition,
  type StorageTarget,
} from "./define";
import { digitalOceanSpaces } from "./digitalocean-spaces";
import { minio } from "./minio";
import { neonStorage } from "./neon-storage";
import { s3Compatible } from "./s3-compatible";

export type { AWSProviderConfig } from "./aws";
export type { CloudflareR2Config } from "./cloudflare-r2";
export type {
  BaseProviderConfig,
  ProviderDefinition,
  S3AclValue,
  StorageTarget,
} from "./define";
export type { DigitalOceanSpacesConfig } from "./digitalocean-spaces";
export type { MinIOConfig } from "./minio";
export { getNeonStorageRegion, type NeonStorageConfig } from "./neon-storage";
export type { S3CompatibleConfig } from "./s3-compatible";

// ========================================
// Registry
// ========================================

/**
 * Every supported provider, keyed by the name passed to `.provider()`.
 *
 * To add a provider, write its definition (see `define.ts` and any sibling
 * file) and list it here. The config types, `createProvider`, validation, the
 * storage client and the health check all follow from this object.
 */
export const PROVIDERS = {
  aws,
  cloudflareR2,
  digitalOceanSpaces,
  minio,
  neonStorage,
  s3Compatible,
} as const;

type ConfigOf<D> = D extends ProviderDefinition<infer C> ? C : never;

/** A provider name accepted by `createProvider` and `.provider()`. */
export type ProviderType = keyof typeof PROVIDERS;

/** A resolved provider config, discriminated by `provider`. */
export type ProviderConfig = ConfigOf<(typeof PROVIDERS)[ProviderType]>;

/**
 * The options each provider accepts, as passed to
 * `createUploadConfig().provider(type, options)`.
 */
export type ProviderConfigMap = {
  [K in ProviderType]: Partial<
    Omit<ConfigOf<(typeof PROVIDERS)[K]>, "provider">
  >;
};

type AnyDefinition = ProviderDefinition<ProviderConfig>;

const BY_ID = new Map<string, AnyDefinition>(
  Object.values(PROVIDERS).map((definition) => [
    definition.id,
    definition as unknown as AnyDefinition,
  ])
);

/**
 * The definition behind a resolved config, looked up by its `provider` id.
 *
 * @internal
 */
export function providerDefinition(
  config: Pick<ProviderConfig, "provider">
): AnyDefinition | undefined {
  return BY_ID.get(config.provider);
}

// ========================================
// Creating a provider config
// ========================================

/**
 * Creates a validated provider configuration from explicit options.
 *
 * Options a provider can derive are filled in — R2's endpoint from its
 * account ID, Spaces' endpoint from its region, Neon's region from its
 * endpoint. Nothing is read from the environment.
 *
 * @template T - The provider type
 * @param type - The provider type identifier
 * @param config - The provider's options
 * @returns Complete provider configuration
 *
 * @example AWS S3
 * ```typescript
 * const s3Config = createProvider('aws', {
 *   bucket: 'my-uploads',
 *   region: 'us-east-1',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 * });
 * ```
 *
 * @example DigitalOcean Spaces
 * ```typescript
 * const spacesConfig = createProvider('digitalOceanSpaces', {
 *   bucket: 'my-space',
 *   region: 'nyc3', // endpoint becomes https://nyc3.digitaloceanspaces.com
 *   accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY!,
 * });
 * ```
 *
 * @throws {Error} When the type is unknown or an option is missing or invalid
 */
export function createProvider<T extends ProviderType>(
  type: T,
  config: ProviderConfigMap[T] = {} as ProviderConfigMap[T]
): ProviderConfig {
  if (!Object.hasOwn(PROVIDERS, type)) {
    throw new Error(`Unknown provider type: ${type}`);
  }

  const definition = PROVIDERS[type] as unknown as AnyDefinition;
  const input = config as Record<string, unknown>;
  const defaults = (definition.defaults ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = { provider: definition.id };

  // ?? rather than || so that false, 0 and "" are preserved.
  for (const key of definition.fields) {
    result[key] = input[key] ?? defaults[key] ?? "";
  }

  // One object throughout: derive and validation see the same config.
  const resolved = result as unknown as ProviderConfig;

  if (definition.derive) {
    Object.assign(
      resolved,
      definition.derive(resolved, input as Partial<ProviderConfig>)
    );
  }

  /**
   * Report anything the caller supplied that did not survive.
   *
   * Only listed fields are copied, and everything else is discarded — which is
   * how `sessionToken` came to be declared, documented and then lost before
   * signing. Copying arbitrary keys into a provider config would defeat
   * validation, so unknown keys are still dropped; what matters is that it is
   * not silent: a typo, an option from a newer version, or a key copied from a
   * sibling provider says so instead of being ignored.
   *
   * Compared against the *final* result rather than `fields`, so options a
   * provider derives for itself — MinIO's `useSSL` and `port` — do not
   * produce a warning nobody should act on.
   */
  const dropped = Object.keys(input).filter(
    (key) => input[key] !== undefined && !(key in result)
  );

  if (dropped.length > 0) {
    logger.warn(
      `Ignored unrecognised ${definition.id} provider option${dropped.length > 1 ? "s" : ""}: ${dropped.join(", ")}`,
      { provider: definition.id, ignored: dropped }
    );
  }

  const validation = validateProviderConfig(resolved);
  if (!validation.valid) {
    throw new Error(
      `Provider validation failed: ${validation.errors.join(", ")}`
    );
  }

  return resolved;
}

// ========================================
// Validation
// ========================================

/**
 * Validates a provider configuration and returns every problem found.
 *
 * `createProvider` runs this before returning, so it matters for configs
 * assembled by hand or changed afterwards.
 *
 * @param config - The provider configuration to validate
 * @returns Validation result with success status and error details
 *
 * @example
 * ```typescript
 * const { valid, errors } = validateProviderConfig(config);
 * if (!valid) {
 *   throw new Error(`Provider configuration invalid: ${errors.join(', ')}`);
 * }
 * ```
 */
export function validateProviderConfig(config: ProviderConfig): {
  valid: boolean;
  errors: string[];
} {
  const definition = providerDefinition(config);

  const errors = definition
    ? checkProviderConfig(definition, config)
    : [`Unknown provider: ${config.provider}`];

  return { valid: errors.length === 0, errors };
}

// ========================================
// Addressing
// ========================================

/**
 * Resolves a provider config to where its requests go and how they are
 * signed — the one shape the storage client works with.
 *
 * @internal
 * @throws {Error} For a config whose `provider` is not registered
 */
export function toStorageTarget(config: ProviderConfig): StorageTarget {
  const definition = providerDefinition(config);

  if (!definition) {
    throw new Error(
      `Unsupported provider: ${config.provider}. ` +
        `Supported providers: ${[...BY_ID.keys()].join(", ")}. ` +
        `For other services, use "s3-compatible" with a custom endpoint.`
    );
  }

  return {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    // An empty string is treated as absent: a shell that exported
    // AWS_SESSION_TOKEN and later cleared it leaves "", and signing a blank
    // token fails where sending none succeeds.
    sessionToken:
      (config as { sessionToken?: string }).sessionToken || undefined,
    bucket: config.bucket,
    acl: config.acl,
    customDomain: config.customDomain,
    supportsAcl: definition.supportsAcl,
    ...definition.addressing(config),
  };
}

/**
 * The API endpoint requests for this config are sent to.
 *
 * @deprecated Will be removed in the next minor release. It only ever
 * reported the endpoint — use your config's `endpoint`, or
 * `https://s3.<region>.amazonaws.com` for AWS.
 */
export function getProviderEndpoint(config: ProviderConfig): string {
  const target = toStorageTarget(config);
  return target.endpoint ?? `https://s3.${target.region}.amazonaws.com`;
}
