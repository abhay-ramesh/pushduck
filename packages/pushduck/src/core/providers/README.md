# Storage providers

Every provider pushduck supports speaks the S3 API, so each one resolves to the
same `StorageTarget` (`define.ts`): credentials, a bucket, the endpoint requests
go to, the region they are signed with, whether the bucket goes in the path,
and whether per-object ACLs may be sent. The storage client only ever reads
that target.

A provider is the knowledge needed to get from the options a user writes to
that target. It lives in one `defineProvider` call per file:

| File | Provider |
| --- | --- |
| `aws.ts` | AWS S3 |
| `cloudflare-r2.ts` | Cloudflare R2 |
| `digitalocean-spaces.ts` | DigitalOcean Spaces |
| `minio.ts` | MinIO |
| `neon-storage.ts` | Neon Object Storage |
| `s3-compatible.ts` | Anything else with an S3 API |

`providers.ts` lists them in `PROVIDERS` and derives everything else from that
object: `ProviderType`, `ProviderConfig`, `ProviderConfigMap`,
`createProvider`, `validateProviderConfig` and `toStorageTarget`.

## Adding a provider

First check whether `s3Compatible` already covers it — a dedicated provider is
worth adding when it can derive something the user would otherwise get wrong
(an endpoint from an account ID, a region from an endpoint) or when it differs
in addressing or ACL support.

1. **Write the definition.** Copy the closest sibling file. Declare the config
   interface (it is public API — document every option), then:
   - `id` — the `provider` value stored on resolved configs, e.g. `"neon-storage"`.
   - `name` — used in messages: `"<name> Access Key ID is required"`.
   - `fields` — every option the provider accepts. Anything else a user passes
     is reported and dropped.
   - `defaults` — values for omitted fields.
   - `derive` — options computed from others (optional).
   - `required` — options that must be non-empty after defaults and derivation.
   - `check` — anything beyond presence, such as "endpoint must be https"
     (optional).
   - `supportsAcl` — `false` if the service rejects `x-amz-acl`.
   - `addressing` — the endpoint, signing region and path style. Use
     `awsSigningRegion()` unless the service signs with a non-AWS region the
     way R2 signs with `"auto"`.
2. **Register it** in `PROVIDERS` in `providers.ts`, and export its config type
   from there and from `src/server.ts`.
3. **Pin its target** with a case in `src/__tests__/storage-target.test.ts`,
   and test whatever it derives or checks.
4. **Document it**: a page under `docs/content/docs/providers/`, an entry in
   that folder's `meta.json`, and a line in the providers index.

Nothing outside this folder branches on a provider's name. If a change seems to
need that, the difference belongs in the definition instead.
