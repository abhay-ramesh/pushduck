/**
 * Regression tests for #168 — presigned download URLs.
 *
 * Uses real aws4fetch signing (no mock) so the assertions are about the
 * actual SigV4 canonical request, not a stub's idea of one. The clock is
 * frozen because X-Amz-Date has second granularity and one test compares
 * two signatures produced by separate calls.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { createS3RouterWithConfig } from "../core/router/router-v2";
import {
  generatePresignedDownloadUrl,
  resetS3Client,
} from "../core/storage/client";

const baseProvider = {
  bucket: "test-bucket",
  region: "us-east-1",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

describe("presigned download URLs (#168)", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  beforeEach(() => {
    resetS3Client();
  });

  it("signs against the S3 API host, not a configured custom domain", async () => {
    const { config } = createUploadConfig()
      .provider("aws", { ...baseProvider, customDomain: "https://cdn.example.com" })
      .build();

    const url = new URL(await generatePresignedDownloadUrl(config, "uploads/a.jpg", 900));

    // host is part of the SigV4 canonical request and cannot be swapped after
    // signing, so the URL host must be the host the signature was computed for.
    expect(url.host).toBe("test-bucket.s3.us-east-1.amazonaws.com");
    expect(url.host).not.toBe("cdn.example.com");
  });

  it("produces a credential scope that names the s3 service", async () => {
    const { config } = createUploadConfig()
      .provider("aws", { ...baseProvider, customDomain: "https://cdn.example.com" })
      .build();

    const url = new URL(await generatePresignedDownloadUrl(config, "uploads/a.jpg", 900));
    const credential = decodeURIComponent(url.searchParams.get("X-Amz-Credential")!);

    // Signing against a CDN host left this as ".../us-east-1//aws4_request",
    // because aws4fetch infers the service from the hostname.
    expect(credential).toContain("/us-east-1/s3/aws4_request");
    expect(credential).not.toContain("//aws4_request");
  });

  it("is unaffected by whether a custom domain is configured", async () => {
    const { config: withDomain } = createUploadConfig()
      .provider("aws", { ...baseProvider, customDomain: "https://cdn.example.com" })
      .build();
    const a = new URL(await generatePresignedDownloadUrl(withDomain, "uploads/a.jpg", 900));

    resetS3Client();
    const { config: plain } = createUploadConfig().provider("aws", baseProvider).build();
    const b = new URL(await generatePresignedDownloadUrl(plain, "uploads/a.jpg", 900));

    expect(a.searchParams.get("X-Amz-SignedHeaders")).toContain("host");
    // Same key, credentials and expiry: the signature must not depend on a
    // custom domain that plays no part in the request being signed.
    expect(a.searchParams.get("X-Amz-Signature")).toBe(
      b.searchParams.get("X-Amz-Signature")
    );
  });

  it("presigns R2 against the R2 API host, never the custom domain", async () => {
    const { config } = createUploadConfig()
      .provider("cloudflareR2", {
        ...baseProvider,
        accountId: "abc123",
        region: "auto",
        customDomain: "https://files.example.com",
      })
      .build();

    const url = new URL(await generatePresignedDownloadUrl(config, "uploads/a.jpg", 900));

    // Cloudflare: "Presigned URLs work with the S3 API domain and cannot be
    // used with custom domains."
    expect(url.host).not.toBe("files.example.com");
    expect(url.host).toContain("r2.cloudflarestorage.com");
  });

  it("still works when no custom domain is configured", async () => {
    const { config } = createUploadConfig().provider("aws", baseProvider).build();

    const url = new URL(await generatePresignedDownloadUrl(config, "uploads/a.jpg", 900));

    expect(url.host).toBe("test-bucket.s3.us-east-1.amazonaws.com");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });

  it("honours the route's .expiresIn() on the completion path", async () => {
    const { s3, config } = createUploadConfig().provider("aws", baseProvider).build();

    const router = createS3RouterWithConfig(
      {
        shortLived: s3
          .image()
          .maxFileSize("1MB")
          .expiresIn(60)
          .middleware(async () => ({})),
      },
      config
    );

    const [result] = await router.handleUploadComplete(
      "shortLived",
      new Request("http://localhost"),
      [
        {
          key: "uploads/a.jpg",
          file: { name: "a.jpg", size: 1024, type: "image/jpeg" },
          metadata: {},
        } as never,
      ]
    );

    expect(result.success).toBe(true);
    expect(new URL(result.presignedUrl!).searchParams.get("X-Amz-Expires")).toBe("60");
  });

  it("falls back to one hour when the route sets no expiry", async () => {
    const { s3, config } = createUploadConfig().provider("aws", baseProvider).build();

    const router = createS3RouterWithConfig(
      { plain: s3.image().maxFileSize("1MB").middleware(async () => ({})) },
      config
    );

    const [result] = await router.handleUploadComplete(
      "plain",
      new Request("http://localhost"),
      [
        {
          key: "uploads/b.jpg",
          file: { name: "b.jpg", size: 1024, type: "image/jpeg" },
          metadata: {},
        } as never,
      ]
    );

    expect(new URL(result.presignedUrl!).searchParams.get("X-Amz-Expires")).toBe("3600");
  });
});
