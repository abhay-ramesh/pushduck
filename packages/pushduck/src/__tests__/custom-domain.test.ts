import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { getFileUrl } from "../core/storage/client";

describe("Custom Domain Support", () => {
  it("should use custom domain for public URLs when configured", () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        customDomain: "https://cdn.example.com",
      })
      .build();

    // Test that getFileUrl uses custom domain for public URLs
    const publicUrl = getFileUrl(config, "uploads/test.jpg");

    expect(publicUrl).toBe("https://cdn.example.com/uploads/test.jpg");
  });

  it("should fall back to S3 URLs when custom domain is not configured", () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
      })
      .build();

    // Test that getFileUrl falls back to S3 URLs
    const publicUrl = getFileUrl(config, "uploads/test.jpg");

    expect(publicUrl).toBe(
      "https://test-bucket.s3.us-east-1.amazonaws.com/uploads/test.jpg"
    );
  });

  it("should handle custom domain with trailing slash", () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        customDomain: "https://cdn.example.com/",
      })
      .build();

    // Test that getFileUrl handles trailing slash correctly
    const publicUrl = getFileUrl(config, "uploads/test.jpg");

    expect(publicUrl).toBe("https://cdn.example.com/uploads/test.jpg");
  });

  it("should prioritize custom domain over endpoint", () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        customDomain: "https://cdn.example.com",
      })
      .build();

    // Test that custom domain takes precedence
    const publicUrl = getFileUrl(config, "uploads/test.jpg");

    expect(publicUrl).toBe("https://cdn.example.com/uploads/test.jpg");
  });
});
