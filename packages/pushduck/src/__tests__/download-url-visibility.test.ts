/**
 * Tests for download URL generation with visibility config
 *
 * Covers:
 * - Private bucket (default): presigned GET signed against S3 API endpoint
 * - Private bucket + custom domain: presigned GET still against S3 API, not CDN
 * - Public bucket + no custom domain: plain S3 URL, no signing
 * - Public bucket + custom domain: custom domain URL, no signing
 * - R2 private: presigned GET against R2 API endpoint
 * - R2 public + custom domain: custom domain URL, no signing
 * - storage.download.presignedUrl(): always presigns regardless of visibility
 */

import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import {
  generateDownloadUrl,
  generatePresignedDownloadUrl,
} from "../core/storage/client";

// ─── Helpers ────────────────────────────────────────────────────────────────

type AWSOverrides = {
  visibility?: "public" | "private";
  customDomain?: string;
};

function makeAWS(overrides: AWSOverrides = {}) {
  return createUploadConfig()
    .provider("aws", {
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      region: "us-east-1",
      bucket: "test-bucket",
      ...overrides,
    })
    .build().config;
}

/** Private R2 bucket — customDomain is optional */
function makeR2Private(customDomain?: string) {
  return createUploadConfig()
    .provider("cloudflareR2", {
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      accountId: "abc123",
      bucket: "test-bucket",
      customDomain,
    })
    .build().config;
}

/** Public R2 bucket — customDomain is required */
function makeR2Public(customDomain: string) {
  return createUploadConfig()
    .provider("cloudflareR2", {
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      accountId: "abc123",
      bucket: "test-bucket",
      visibility: "public",
      customDomain,
    })
    .build().config;
}

const KEY = "uploads/photo.jpg";
const S3_URL = `https://test-bucket.s3.us-east-1.amazonaws.com/${KEY}`;
const R2_API_URL = `https://abc123.r2.cloudflarestorage.com/test-bucket/${KEY}`;
// customDomain must include the protocol — buildPublicUrl uses the value as-is
const CUSTOM_DOMAIN = "https://cdn.example.com";
const CDN_URL = `${CUSTOM_DOMAIN}/${KEY}`;

// ─── generateDownloadUrl — private (default) ────────────────────────────────

describe("generateDownloadUrl — private bucket (default)", () => {
  it("returns a presigned URL signed against the S3 API endpoint", async () => {
    const config = makeAWS();
    const url = await generateDownloadUrl(config, KEY);
    expect(url).toContain(S3_URL);
    expect(url).toContain("X-Amz-Signature");
    expect(url).toContain("X-Amz-Expires=3600");
  });

  it("respects custom expiresIn", async () => {
    const config = makeAWS();
    const url = await generateDownloadUrl(config, KEY, 300);
    expect(url).toContain("X-Amz-Expires=300");
  });

  it("signs against S3 API endpoint even when customDomain is set", async () => {
    const config = makeAWS({ customDomain: CUSTOM_DOMAIN });
    const url = await generateDownloadUrl(config, KEY);
    // Must use the S3 API endpoint for signing, NOT the custom domain
    expect(url).toContain("s3.us-east-1.amazonaws.com");
    expect(url).not.toContain("cdn.example.com");
    expect(url).toContain("X-Amz-Signature");
  });

  it("explicit visibility: 'private' behaves the same as default", async () => {
    const config = makeAWS({ visibility: "private" });
    const url = await generateDownloadUrl(config, KEY);
    expect(url).toContain(S3_URL);
    expect(url).toContain("X-Amz-Signature");
  });
});

// ─── generateDownloadUrl — public bucket ────────────────────────────────────

describe("generateDownloadUrl — public bucket", () => {
  it("returns plain S3 URL with no signing when no custom domain", async () => {
    const config = makeAWS({ visibility: "public" });
    const url = await generateDownloadUrl(config, KEY);
    expect(url).toBe(S3_URL);
    expect(url).not.toContain("X-Amz-Signature");
    expect(url).not.toContain("X-Amz-Expires");
  });

  it("returns custom domain URL with no signing when customDomain is set", async () => {
    const config = makeAWS({ visibility: "public", customDomain: CUSTOM_DOMAIN });
    const url = await generateDownloadUrl(config, KEY);
    expect(url).toBe(CDN_URL);
    expect(url).not.toContain("X-Amz-Signature");
    expect(url).not.toContain("amazonaws.com");
  });

  it("strips trailing slash from custom domain", async () => {
    const config = makeAWS({ visibility: "public", customDomain: CUSTOM_DOMAIN + "/" });
    const url = await generateDownloadUrl(config, KEY);
    expect(url).toBe(CDN_URL);
  });
});

// ─── generateDownloadUrl — R2 ───────────────────────────────────────────────

describe("generateDownloadUrl — Cloudflare R2", () => {
  it("private (default): presigned GET against R2 API endpoint", async () => {
    const config = makeR2Private();
    const url = await generateDownloadUrl(config, KEY);
    expect(url).toContain(R2_API_URL);
    expect(url).toContain("X-Amz-Signature");
  });

  it("private + custom domain: still signs against R2 API, not custom domain", async () => {
    const config = makeR2Private(CUSTOM_DOMAIN);
    const url = await generateDownloadUrl(config, KEY);
    // R2 presigned URLs must use the API endpoint, not custom domain
    expect(url).toContain("r2.cloudflarestorage.com");
    expect(url).not.toContain("cdn.example.com");
    expect(url).toContain("X-Amz-Signature");
  });

  it("public + custom domain: returns custom domain URL with no signing", async () => {
    const config = makeR2Public(CUSTOM_DOMAIN);
    const url = await generateDownloadUrl(config, KEY);
    expect(url).toBe(CDN_URL);
    expect(url).not.toContain("X-Amz-Signature");
    expect(url).not.toContain("r2.cloudflarestorage.com");
  });
});

// ─── generatePresignedDownloadUrl — always presigns ─────────────────────────

describe("generatePresignedDownloadUrl — always presigns (ignores visibility)", () => {
  it("presigns for private bucket", async () => {
    const config = makeAWS({ visibility: "private" });
    const url = await generatePresignedDownloadUrl(config, KEY);
    expect(url).toContain("X-Amz-Signature");
    expect(url).toContain(S3_URL);
  });

  it("presigns even when visibility is 'public'", async () => {
    const config = makeAWS({ visibility: "public", customDomain: CUSTOM_DOMAIN });
    const url = await generatePresignedDownloadUrl(config, KEY);
    // Ignores visibility — always presigns against S3 API endpoint
    expect(url).toContain("X-Amz-Signature");
    expect(url).toContain("s3.us-east-1.amazonaws.com");
    expect(url).not.toContain("cdn.example.com");
  });

  it("respects custom expiresIn", async () => {
    const config = makeAWS();
    const url = await generatePresignedDownloadUrl(config, KEY, 900);
    expect(url).toContain("X-Amz-Expires=900");
  });

  it("defaults to 3600s expiry", async () => {
    const config = makeAWS();
    const url = await generatePresignedDownloadUrl(config, KEY);
    expect(url).toContain("X-Amz-Expires=3600");
  });
});

// ─── R2 TypeScript discriminated union ───────────────────────────────────────

describe("R2 visibility: 'public' TypeScript constraint", () => {
  it("R2 private without customDomain is valid", () => {
    expect(() => makeR2Private()).not.toThrow();
  });

  it("R2 public with customDomain is valid", () => {
    expect(() => makeR2Public(CUSTOM_DOMAIN)).not.toThrow();
  });

  it("R2 public without customDomain throws at runtime", () => {
    expect(() =>
      createUploadConfig()
        // @ts-expect-error: visibility: 'public' without customDomain is a type error
        .provider("cloudflareR2", { accessKeyId: "k", secretAccessKey: "s", accountId: "id", bucket: "b", visibility: "public" })
        .build()
    ).toThrow("R2 requires customDomain when visibility is 'public'");
  });
});
