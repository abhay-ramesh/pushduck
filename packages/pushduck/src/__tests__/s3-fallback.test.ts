import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import {
  generatePresignedDownloadUrl,
  generatePresignedUploadUrl,
  getFileUrl,
} from "../core/storage/client";

describe("S3 Fallback Behavior", () => {
  it("should use S3 URLs for public URLs when no custom domain is configured", () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        // No customDomain configured
      })
      .build();

    const testCases = [
      "uploads/image.jpg",
      "uploads/user-123/profile/avatar.png",
      "uploads/documents/report.pdf",
      "uploads/videos/presentation.mp4",
    ];

    testCases.forEach((key) => {
      const fileUrl = getFileUrl(config, key);
      expect(fileUrl).toBe(
        `https://test-bucket.s3.us-east-1.amazonaws.com/${key}`
      );
    });
  });

  it("should use S3 URLs for presigned upload URLs when no custom domain is configured", async () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        // No customDomain configured
      })
      .build();

    const result = await generatePresignedUploadUrl(config, {
      key: "uploads/test-image.jpg",
      contentType: "image/jpeg",
    });

    // The presigned URL should use S3 endpoint, not custom domain
    expect(result.url).toContain(
      "https://test-bucket.s3.us-east-1.amazonaws.com/uploads/test-image.jpg"
    );
  });

  it("should use S3 URLs for presigned download URLs when no custom domain is configured", async () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        // No customDomain configured
      })
      .build();

    const presignedUrl = await generatePresignedDownloadUrl(
      config,
      "uploads/test-image.jpg",
      3600
    );

    // The presigned URL should use S3 endpoint, not custom domain
    expect(presignedUrl).toContain(
      "https://test-bucket.s3.us-east-1.amazonaws.com/uploads/test-image.jpg"
    );
  });

  it("should handle different AWS regions correctly", () => {
    const regions = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"];

    regions.forEach((region) => {
      const { config } = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
          region,
          bucket: "test-bucket",
          // No customDomain configured
        })
        .build();

      const fileUrl = getFileUrl(config, "uploads/test.jpg");
      expect(fileUrl).toBe(
        `https://test-bucket.s3.${region}.amazonaws.com/uploads/test.jpg`
      );
    });
  });

  it("should handle different bucket names correctly", () => {
    const buckets = [
      "my-uploads",
      "user-files",
      "media-storage",
      "documents-2024",
    ];

    buckets.forEach((bucket) => {
      const { config } = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
          region: "us-east-1",
          bucket,
          // No customDomain configured
        })
        .build();

      const fileUrl = getFileUrl(config, "uploads/test.jpg");
      expect(fileUrl).toBe(
        `https://${bucket}.s3.us-east-1.amazonaws.com/uploads/test.jpg`
      );
    });
  });

  it("should handle path-style URLs when forcePathStyle is true", () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        forcePathStyle: true, // Force path-style URLs
        // No customDomain configured
      })
      .build();

    const fileUrl = getFileUrl(config, "uploads/test.jpg");
    expect(fileUrl).toBe(
      "https://s3.us-east-1.amazonaws.com/test-bucket/uploads/test.jpg"
    );
  });

  it("should handle virtual-hosted-style URLs by default", () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        // No customDomain configured, forcePathStyle defaults to false
      })
      .build();

    const fileUrl = getFileUrl(config, "uploads/test.jpg");
    expect(fileUrl).toBe(
      "https://test-bucket.s3.us-east-1.amazonaws.com/uploads/test.jpg"
    );
  });

  it("should handle complex nested paths correctly", () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        // No customDomain configured
      })
      .build();

    const complexPaths = [
      "uploads/2024/01/15/user-123/profile/avatar.jpg",
      "media/videos/2024/spring/promotional/campaign.mp4",
      "documents/legal/contracts/2024/Q1/agreement.pdf",
      "backups/daily/2024-01-15/database.sql",
    ];

    complexPaths.forEach((path) => {
      const fileUrl = getFileUrl(config, path);
      expect(fileUrl).toBe(
        `https://test-bucket.s3.us-east-1.amazonaws.com/${path}`
      );
    });
  });
});
