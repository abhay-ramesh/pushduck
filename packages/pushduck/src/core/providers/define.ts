/**
 * @fileoverview What a storage provider is.
 *
 * Every provider pushduck supports speaks the S3 API, so every provider ends
 * in the same place: a {@link StorageTarget} — credentials, a bucket, where
 * requests go and how they are signed. A provider is only the knowledge needed
 * to get there from the options a user writes: which options it accepts, what
 * it can derive (R2's endpoint from an account ID, Neon's region from its
 * endpoint), what it requires, and the few ways it differs (path-style
 * addressing, ACL support, signing region).
 *
 * That knowledge lives in one {@link ProviderDefinition} per provider. Nothing
 * outside `core/providers` branches on a provider's name: the client, the
 * router, validation and the health check read the definition or the target.
 * Adding a provider is one definition file and one line in the registry.
 */

/**
 * Valid S3 ACL values for controlling object access.
 * Providers that do not support per-object ACLs ignore it — see
 * {@link ProviderDefinition.supportsAcl}.
 */
export type S3AclValue =
  | "private"
  | "public-read"
  | "public-read-write"
  | "authenticated-read"
  | "bucket-owner-read"
  | "bucket-owner-full-control"
  | "log-delivery-write"
  | (string & {});

/**
 * Options shared by every provider.
 *
 * @interface BaseProviderConfig
 */
export interface BaseProviderConfig {
  /** Provider identifier string */
  provider: string;
  /** Geographic region for the storage service */
  region?: string;
  /** Name of the storage bucket/container */
  bucket: string;
  /**
   * S3 ACL for uploaded objects.
   * Ignored by providers without per-object ACLs (Cloudflare R2, MinIO, Neon
   * Object Storage).
   */
  acl?: S3AclValue;
  /**
   * Where public files are served from, e.g. `'https://cdn.example.com'`.
   * Public URLs are `<customDomain>/<key>`.
   *
   * A bare host (`'cdn.example.com'`) gets `https://`; an explicit `http://`
   * is kept. Trailing slashes are removed, and a path prefix
   * (`'https://cdn.example.com/media'`) is allowed. A query string, fragment
   * or credentials are rejected: the key is appended to the value as text.
   *
   * Used only for public URLs. Presigned URLs are always signed against the
   * provider's API endpoint.
   */
  customDomain?: string;
  /** Force path-style URLs instead of virtual-hosted style */
  forcePathStyle?: boolean;
}

/**
 * Where requests go and how they are signed — the one shape every provider
 * resolves to, and the only one the storage client reads.
 *
 * @internal
 */
export interface StorageTarget {
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Session token for temporary credentials.
   *
   * Present whenever credentials come from STS rather than a static IAM user:
   * an ECS task role, a Lambda execution role, EKS IRSA, or an OIDC
   * `AssumeRole`. SigV4 requires it to travel with the request, so dropping it
   * makes every such deployment fail with a 403 that names the signature
   * rather than the missing token.
   */
  sessionToken?: string;
  /**
   * Region used in the SigV4 credential scope. Also builds the AWS hostname
   * when there is no `endpoint`.
   */
  region: string;
  bucket: string;
  /** API endpoint. Absent for AWS S3, whose hostname is built from the region. */
  endpoint?: string;
  /** Bucket in the path (`endpoint/bucket/key`) rather than the hostname. */
  forcePathStyle?: boolean;
  /** Whether `x-amz-acl` may be sent. Providers without ACLs reject it. */
  supportsAcl: boolean;
  /** Default ACL for uploaded objects. */
  acl?: string;
  /** Custom domain for public URLs. */
  customDomain?: string;
}

/**
 * The parts of a {@link StorageTarget} a provider decides; the rest
 * (credentials, bucket, ACL, custom domain) carry over unchanged.
 */
export type ProviderAddressing = Pick<
  StorageTarget,
  "endpoint" | "region" | "forcePathStyle"
>;

/**
 * Everything pushduck knows about one provider.
 *
 * @template TConfig The provider's resolved config type.
 */
export interface ProviderDefinition<TConfig extends BaseProviderConfig> {
  /** The `provider` value on resolved configs, e.g. `"cloudflare-r2"`. */
  readonly id: TConfig["provider"];
  /** Human-readable name, used in messages. */
  readonly name: string;
  /**
   * Options the provider accepts. Anything else a caller passes is reported
   * and dropped.
   */
  readonly fields: readonly (keyof TConfig & string)[];
  /** Values used for fields the caller leaves out. */
  readonly defaults?: Partial<TConfig>;
  /**
   * Fills in options derived from others, after defaults are applied.
   * Receives the caller's raw input as well, for options the provider keeps
   * that are not in {@link fields}.
   */
  readonly derive?: (
    resolved: TConfig,
    input: Partial<TConfig>
  ) => Partial<TConfig>;
  /** Options that must be non-empty once defaults and derivation are done. */
  readonly required: readonly (keyof TConfig & string)[];
  /** Checks beyond presence. Returns one message per problem. */
  readonly check?: (config: TConfig) => string[];
  /** Whether the provider accepts per-object ACLs (`x-amz-acl`). */
  readonly supportsAcl: boolean;
  /** Where requests for this config go and how they are signed. */
  readonly addressing: (config: TConfig) => ProviderAddressing;
}

/**
 * Declares a provider. An identity function: it exists so a definition is
 * checked against its config type where it is written.
 */
export function defineProvider<TConfig extends BaseProviderConfig>(
  definition: ProviderDefinition<TConfig>
): ProviderDefinition<TConfig> {
  return definition;
}

/**
 * The region to sign with for an S3-compatible service that expects a
 * standard AWS region. `"auto"` is R2's convention; elsewhere it means "no
 * particular region", which signs as `us-east-1`.
 */
export function awsSigningRegion(region: string): string {
  return region === "auto" ? "us-east-1" : region;
}

/**
 * Puts a `customDomain` in the one form public URLs are built from:
 * a scheme, and no trailing slash, so `${customDomain}/${key}` is an absolute
 * URL. `createProvider` applies it to every provider; {@link checkCustomDomain}
 * then rejects what it cannot fix.
 *
 * Without a scheme, `cdn.example.com/key` is a *relative* URL — a browser
 * resolves it against the current page — so a bare host gets `https://`.
 * An explicit `http://` is kept for local and development servers.
 *
 * @internal
 */
export function normalizeCustomDomain(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
}

/**
 * Problems with a `customDomain` that would break `${customDomain}/${key}`.
 *
 * A path prefix is fine — a CDN behaviour such as `/media` mapped onto the
 * bucket. A query string or fragment is not: the key would land inside it.
 *
 * Configs from `createProvider` are already normalised; a config object
 * written by hand is not, so the normal form is required here rather than
 * re-applied wherever a URL is built.
 */
function checkCustomDomain(value: string): string[] {
  const normalized = normalizeCustomDomain(value);
  if (normalized !== value) {
    return [
      `customDomain must include the scheme and no trailing slash: use ${JSON.stringify(normalized)} instead of ${JSON.stringify(value)}`,
    ];
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return [`customDomain ${JSON.stringify(value)} is not a valid URL`];
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return [
      `customDomain must use http:// or https://, got ${JSON.stringify(value)}`,
    ];
  }
  if (url.username || url.password) {
    return [`customDomain must not contain credentials`];
  }
  if (url.search || url.hash || /[?#]/.test(value)) {
    return [
      `customDomain must not have a query string or fragment, got ${JSON.stringify(value)} — public URLs are <customDomain>/<key>`,
    ];
  }
  return [];
}

/** How each option is named in a "required" message. */
const FIELD_LABELS: Record<string, string> = {
  accessKeyId: "Access Key ID",
  secretAccessKey: "Secret Access Key",
  accountId: "Account ID",
  projectId: "Project ID",
  endpoint: "endpoint",
  region: "region",
};

/**
 * Validates a resolved config against its provider definition.
 *
 * @internal
 */
export function checkProviderConfig<TConfig extends BaseProviderConfig>(
  definition: ProviderDefinition<TConfig>,
  config: TConfig
): string[] {
  const errors: string[] = [];

  if (!config.bucket) {
    errors.push("Bucket name is required");
  }

  // "" is how an omitted option is stored. Anything else that is not a
  // boolean is most often `process.env.X` passed through unconverted: the
  // string "false" is truthy, so it would select path-style on one provider
  // and its opposite on another.
  const { forcePathStyle } = config as { forcePathStyle?: unknown };
  if (
    forcePathStyle !== undefined &&
    forcePathStyle !== "" &&
    typeof forcePathStyle !== "boolean"
  ) {
    errors.push(
      `forcePathStyle must be true or false, got ${JSON.stringify(forcePathStyle)} — convert environment strings, e.g. process.env.S3_FORCE_PATH_STYLE === "true"`
    );
  }

  if (config.customDomain) {
    errors.push(...checkCustomDomain(config.customDomain));
  }

  for (const field of definition.required) {
    if (!config[field]) {
      errors.push(
        `${definition.name} ${FIELD_LABELS[field] ?? field} is required`
      );
    }
  }

  return [...errors, ...(definition.check?.(config) ?? [])];
}
