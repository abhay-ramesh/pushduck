/**
 * @fileoverview Neon Object Storage provider.
 *
 * Neon differs from the other S3-compatible providers in three ways that each
 * produce a request the server rejects, rather than a config error:
 *
 * 1. **Path-style only.** A virtual-hosted URL (`bucket.br-....neon.tech`) does
 *    not resolve, so the provider must never honour `forcePathStyle: false`.
 * 2. **The region is in the endpoint.** Signing with any other region fails
 *    with `SignatureDoesNotMatch`, so the region is read from the hostname
 *    instead of defaulting to `us-east-1` like the generic provider.
 * 3. **No ACL writes.** Access is set per bucket (`private` / `public_read`);
 *    `x-amz-acl` is an S3 ACL write, which Neon answers with 501.
 *
 * Signing is real aws4fetch, not a stub, so these assert the URL a client
 * would actually be handed. The live round-trip is in neon-integration.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import {
  createProvider,
  getNeonStorageRegion,
  validateProviderConfig,
} from "../core/providers/providers";
import {
  generatePresignedDownloadUrl,
  generatePresignedUploadUrl,
  getFileUrl,
  resetS3Client,
} from "../core/storage/client";

const ENDPOINT =
  "https://br-cool-darkness-a1b2c3d4.storage.c-6.us-east-2.aws.neon.tech";

const NEON_BASE = {
  endpoint: ENDPOINT,
  bucket: "user-uploads",
  accessKeyId: "nak_live_0123456789abcdef0123456789abcdef",
  secretAccessKey: "nsk_live_0123456789abcdef0123456789abcdef",
};

function buildConfig(overrides: Record<string, unknown> = {}) {
  return createUploadConfig()
    .provider("neonStorage", { ...NEON_BASE, ...overrides } as never)
    .build().config;
}

beforeEach(() => {
  resetS3Client();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Neon region resolution", () => {
  it.each([
    [ENDPOINT, "us-east-2"],
    ["https://br-a.storage.c-2.us-east-1.aws.neon.tech", "us-east-1"],
    ["https://br-a.storage.c-1.eu-central-1.aws.neon.tech/", "eu-central-1"],
    ["https://br-a.storage.c-3.ap-southeast-1.aws.neon.tech", "ap-southeast-1"],
  ])("reads the region from %s", (endpoint, region) => {
    expect(getNeonStorageRegion(endpoint)).toBe(region);
  });

  it("returns nothing for an endpoint that is not a Neon branch endpoint", () => {
    expect(getNeonStorageRegion("https://storage.example.com")).toBeUndefined();
    expect(getNeonStorageRegion("not a url")).toBeUndefined();
  });

  it("fills the region from the endpoint when it is omitted", () => {
    const provider = createProvider("neonStorage", NEON_BASE);

    expect(provider.region).toBe("us-east-2");
  });

  it("keeps an explicit region", () => {
    // `neon env pull` writes AWS_REGION too, and a proxy in front of the
    // endpoint can hide the region from the hostname.
    const provider = createProvider("neonStorage", {
      ...NEON_BASE,
      endpoint: "https://storage-proxy.example.com",
      region: "eu-central-1",
    });

    expect(provider.region).toBe("eu-central-1");
  });

  it("accepts an explicit region that agrees with the endpoint", () => {
    const provider = createProvider("neonStorage", {
      ...NEON_BASE,
      region: "us-east-2",
    });

    expect(provider.region).toBe("us-east-2");
  });

  it("rejects an explicit region that contradicts the endpoint", () => {
    // AWS_REGION left over from another project, or a branch moved between
    // regions: every request would fail with SignatureDoesNotMatch, which
    // names the signature rather than the region.
    expect(() =>
      createProvider("neonStorage", { ...NEON_BASE, region: "eu-central-1" }),
    ).toThrow(
      /region "eu-central-1" does not match the endpoint's region "us-east-2"/,
    );
  });

  it("signs with the region from the endpoint, not us-east-1", async () => {
    const url = new URL(
      (await generatePresignedUploadUrl(buildConfig(), { key: "a.png" })).url,
    );

    expect(url.searchParams.get("X-Amz-Credential")).toContain(
      "/us-east-2/s3/aws4_request",
    );
  });
});

describe("Neon validation", () => {
  it("accepts a complete config", () => {
    expect(() => createProvider("neonStorage", NEON_BASE)).not.toThrow();
  });

  it("requires an endpoint", () => {
    expect(() =>
      createProvider("neonStorage", { ...NEON_BASE, endpoint: undefined }),
    ).toThrow(/Neon Object Storage endpoint is required/);
  });

  it("requires https", () => {
    expect(() =>
      createProvider("neonStorage", {
        ...NEON_BASE,
        endpoint: "http://br-a.storage.c-6.us-east-2.aws.neon.tech",
      }),
    ).toThrow(/must be an https:\/\/ URL/);
  });

  it("requires a region when the endpoint does not carry one", () => {
    expect(() =>
      createProvider("neonStorage", {
        ...NEON_BASE,
        endpoint: "https://storage-proxy.example.com",
      }),
    ).toThrow(/region is required/);
  });

  it("requires both halves of the credential", () => {
    const { errors } = validateProviderConfig({
      provider: "neon-storage",
      endpoint: ENDPOINT,
      region: "us-east-2",
      bucket: "user-uploads",
      accessKeyId: "",
      secretAccessKey: "",
    });

    expect(errors).toEqual([
      "Neon Object Storage Access Key ID is required",
      "Neon Object Storage Secret Access Key is required",
    ]);
  });

  it("reports options Neon does not use instead of dropping them silently", () => {
    // Neon credentials are long-lived, so there is no session token, and
    // path-style is not optional.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createProvider("neonStorage", {
      ...NEON_BASE,
      forcePathStyle: false,
    });

    const message = warn.mock.calls.map((call) => String(call[0])).join(" ");
    expect(message).toContain("forcePathStyle");
  });

  it("says nothing for a correct config", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createProvider("neonStorage", { ...NEON_BASE, region: "us-east-2" });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Neon URLs", () => {
  it("addresses uploads path-style on the branch endpoint", async () => {
    const url = new URL(
      (
        await generatePresignedUploadUrl(buildConfig(), {
          key: "avatars/me.png",
        })
      ).url,
    );

    expect(url.origin).toBe(ENDPOINT);
    expect(url.pathname).toBe("/user-uploads/avatars/me.png");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });

  it("addresses downloads path-style on the branch endpoint", async () => {
    const url = new URL(
      await generatePresignedDownloadUrl(buildConfig(), "avatars/me.png", 60),
    );

    expect(url.origin).toBe(ENDPOINT);
    expect(url.pathname).toBe("/user-uploads/avatars/me.png");
  });

  it("does not double the slash when the endpoint has a trailing one", async () => {
    const url = new URL(
      (
        await generatePresignedUploadUrl(
          buildConfig({ endpoint: `${ENDPOINT}/` }),
          {
            key: "a.png",
          },
        )
      ).url,
    );

    expect(url.pathname).toBe("/user-uploads/a.png");
  });

  it("serves public URLs from the bucket path, or the custom domain", () => {
    expect(getFileUrl(buildConfig(), "a.png")).toBe(
      `${ENDPOINT}/user-uploads/a.png`,
    );
    expect(
      getFileUrl(
        buildConfig({ customDomain: "https://cdn.example.com" }),
        "a.png",
      ),
    ).toBe("https://cdn.example.com/a.png");
  });

  it("never signs x-amz-acl, even when an ACL is configured", async () => {
    const result = await generatePresignedUploadUrl(
      buildConfig({ acl: "public-read" }),
      { key: "a.png", contentType: "image/png" },
    );
    const url = new URL(result.url);

    expect(url.searchParams.get("X-Amz-SignedHeaders")).not.toContain(
      "x-amz-acl",
    );
    expect(result.requiredHeaders).toEqual({ "Content-Type": "image/png" });
  });
});
