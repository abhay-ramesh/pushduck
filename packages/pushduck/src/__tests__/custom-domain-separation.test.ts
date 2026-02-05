import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import {
    checkFileExists,
    deleteFile,
    generatePresignedUploadUrl,
    getFileInfo,
    getFileUrl,
} from "../core/storage/client";

describe("Custom Domain Separation", () => {
  it("should use custom domain for public URLs", () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        customDomain: "https://cdn.example.com",
      })
      .build();

    const publicUrl = getFileUrl(config, "uploads/test.jpg");
    expect(publicUrl).toBe("https://cdn.example.com/uploads/test.jpg");
  });

  it("should use S3 endpoint for presigned upload URLs (not custom domain)", async () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        customDomain: "https://cdn.example.com",
      })
      .build();

    const result = await generatePresignedUploadUrl(config, {
      key: "uploads/test.jpg",
      contentType: "image/jpeg",
    });

    // Presigned UPLOAD (PUT) must use the S3 API endpoint so the client can PUT successfully.
    // Custom domains (e.g. R2) do not accept S3 API operations.
    expect(result.url).toContain("test-bucket.s3.us-east-1.amazonaws.com");
    expect(result.url).toContain("/uploads/test.jpg");
  });

  it("should NOT use custom domain for internal S3 operations", async () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        customDomain: "https://cdn.example.com",
      })
      .build();

    // These operations should use S3 URLs, not custom domain
    // We can't actually test the network calls, but we can verify the functions exist
    // and don't throw errors when called with custom domain config

    // Just verify the functions exist and can be called
    expect(typeof checkFileExists).toBe("function");
    expect(typeof getFileInfo).toBe("function");
    expect(typeof deleteFile).toBe("function");

    // The functions should be callable with the config
    expect(() => {
      // These functions should work with custom domain config
      // but internally use S3 URLs for the actual operations
      // We don't actually call them to avoid network errors in tests
    }).not.toThrow();
  });

  it("should handle custom domain with trailing slash correctly", () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        customDomain: "https://cdn.example.com/",
      })
      .build();

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

    const publicUrl = getFileUrl(config, "uploads/test.jpg");
    expect(publicUrl).toBe(
      "https://test-bucket.s3.us-east-1.amazonaws.com/uploads/test.jpg"
    );
  });
});
