/**
 * @fileoverview Setting `acl` on a provider without per-object ACLs says so.
 *
 * R2, MinIO, Neon and GCS reject `x-amz-acl`, so pushduck never sends it to
 * them. That was silent: apps set `acl: "public-read"` on R2 expecting public
 * files, got private ones, and found out from broken image links. Access on
 * these providers is a bucket setting (public access, a bucket policy, IAM),
 * and the warning says that once, when the config is built.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import {
  PROVIDERS as REGISTRY,
  type ProviderConfigMap,
} from "../core/providers/providers";

const KEYS = { accessKeyId: "key", secretAccessKey: "secret", bucket: "b" };

const WITHOUT_ACLS = {
  cloudflareR2: ["Cloudflare R2", { ...KEYS, accountId: "acct" }],
  minio: ["MinIO", { ...KEYS, endpoint: "http://localhost:9000" }],
  neonStorage: [
    "Neon Object Storage",
    { ...KEYS, endpoint: "https://br-a.storage.c-1.us-east-2.aws.neon.tech" },
  ],
  gcs: ["Google Cloud Storage", KEYS],
} as const;

type Unsupported = keyof typeof WITHOUT_ACLS;
const PROVIDERS = Object.keys(WITHOUT_ACLS) as Unsupported[];

function aclWarnings(warn: ReturnType<typeof vi.spyOn>): string[] {
  return warn.mock.calls
    .map((call: unknown[]) => String(call[0]))
    .filter((message: string) => message.includes("acl"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("acl on a provider without per-object ACLs", () => {
  it.each(PROVIDERS)("%s: warns once when acl is a provider option", (type) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const [name, options] = WITHOUT_ACLS[type];

    createUploadConfig()
      .provider(type, { ...options, acl: "public-read" } as ProviderConfigMap[Unsupported])
      .build();

    const warnings = aclWarnings(warn);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`${name} does not support per-object ACLs`);
    expect(warnings[0]).toContain('acl: "public-read"');
  });

  it("warns once when acl comes from .defaults()", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createUploadConfig()
      .provider("cloudflareR2", WITHOUT_ACLS.cloudflareR2[1])
      .defaults({ acl: "public-read" })
      .build();

    expect(aclWarnings(warn)).toHaveLength(1);
  });

  it("warns once when both set it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createUploadConfig()
      .provider("cloudflareR2", { ...WITHOUT_ACLS.cloudflareR2[1], acl: "private" })
      .defaults({ acl: "public-read" })
      .build();

    const warnings = aclWarnings(warn);
    expect(warnings).toHaveLength(1);
    // .defaults() wins over the provider option, as it does for AWS.
    expect(warnings[0]).toContain('acl: "public-read"');
  });

  it("says what to do instead", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createUploadConfig()
      .provider("cloudflareR2", { ...WITHOUT_ACLS.cloudflareR2[1], acl: "public-read" })
      .build();

    expect(aclWarnings(warn)[0]).toMatch(/bucket/i);
    expect(aclWarnings(warn)[0]).toMatch(/remove acl/i);
  });

  it.each(PROVIDERS)("%s: is silent when the caller sets no acl", (type) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createUploadConfig()
      .provider(type, WITHOUT_ACLS[type][1] as ProviderConfigMap[Unsupported])
      .build();

    expect(aclWarnings(warn)).toEqual([]);
  });

  it("no provider without ACLs declares a default acl, which would trip the warning", () => {
    const offenders = Object.values(REGISTRY)
      .filter((definition) => !definition.supportsAcl)
      .filter((definition) => (definition.defaults as { acl?: string } | undefined)?.acl)
      .map((definition) => definition.id);
    expect(offenders).toEqual([]);
  });

  it("is silent on providers that send the ACL", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createUploadConfig()
      .provider("aws", { ...KEYS, acl: "public-read" })
      .defaults({ acl: "public-read" })
      .build();

    expect(aclWarnings(warn)).toEqual([]);
  });
});
