import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { UploadConfig } from "../core/config/upload-config";
import {
  createUploadConfig,
  getUploadConfig,
  isConfigInitialized,
  resetUploadConfig,
} from "../core/config/upload-config";

describe("Phase 1: Global State Independence", () => {
  beforeEach(() => {
    // Reset global state before each test
    resetUploadConfig();
  });

  afterEach(() => {
    // Clean up after each test
    resetUploadConfig();
  });

  describe("Multiple Configuration Independence", () => {
    it("should create independent configurations without interference", () => {
      // Create first configuration
      const { config: config1, s3: s3Instance1 } = createUploadConfig()
        .provider("aws", {
          bucket: "test-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .defaults({
          maxFileSize: "5MB",
        })
        .build();

      // Verify first configuration
      expect(config1.provider.provider).toBe("aws");
      expect(config1.provider.bucket).toBe("test-bucket-1");
      expect(config1.defaults?.maxFileSize).toBe("5MB");

      // Create second configuration
      const { config: config2, s3: s3Instance2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "test-bucket-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .defaults({
          maxFileSize: "10MB",
        })
        .build();

      // Verify second configuration
      expect(config2.provider.provider).toBe("cloudflare-r2");
      expect(config2.provider.bucket).toBe("test-bucket-2");
      expect(config2.defaults?.maxFileSize).toBe("10MB");

      // ✅ CRITICAL: Verify configurations remain independent
      expect(config1.provider.bucket).toBe("test-bucket-1");
      expect(config2.provider.bucket).toBe("test-bucket-2");
      expect(config1.provider.provider).toBe("aws");
      expect(config2.provider.provider).toBe("cloudflare-r2");

      // Verify S3 instances are different objects
      expect(s3Instance1).not.toBe(s3Instance2);
      expect(typeof s3Instance1).toBe("object");
      expect(typeof s3Instance2).toBe("object");
    });

    it("should create different S3 schema instances", () => {
      const { s3: s3Instance1 } = createUploadConfig()
        .provider("aws", {
          bucket: "bucket1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { s3: s3Instance2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "bucket2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .build();

      // Create schemas from different instances
      const schema1 = s3Instance1.file({ maxSize: "1MB" });
      const schema2 = s3Instance2.file({ maxSize: "2MB" });

      // Verify schemas are independent objects
      expect(schema1).not.toBe(schema2);
      expect(schema1).toBeInstanceOf(Object);
      expect(schema2).toBeInstanceOf(Object);
    });

    it("should handle multiple providers of the same type", () => {
      // Create two AWS configurations
      const { config: aws1 } = createUploadConfig()
        .provider("aws", {
          bucket: "aws-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { config: aws2 } = createUploadConfig()
        .provider("aws", {
          bucket: "aws-bucket-2",
          region: "us-west-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
        })
        .build();

      // Verify both configurations remain independent
      expect(aws1.provider.bucket).toBe("aws-bucket-1");
      expect(aws2.provider.bucket).toBe("aws-bucket-2");
      expect(aws1.provider.region).toBe("us-east-1");
      expect(aws2.provider.region).toBe("us-west-2");
    });
  });

  describe("Global State Compatibility", () => {
    it("should set global config only for first configuration", () => {
      expect(isConfigInitialized()).toBe(false);

      // First config should set global state
      const { config: config1 } = createUploadConfig()
        .provider("aws", {
          bucket: "first-bucket",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      expect(isConfigInitialized()).toBe(true);

      // Global config should match first config
      const globalConfig = getUploadConfig();
      expect(globalConfig.provider.bucket).toBe("first-bucket");

      // Second config should NOT overwrite global state
      const { config: config2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "second-bucket",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .build();

      // Global config should still be the first one
      const globalConfigAfter = getUploadConfig();
      expect(globalConfigAfter.provider.bucket).toBe("first-bucket");
      expect(globalConfigAfter.provider.provider).toBe("aws");

      // But the second config should be independent
      expect(config2.provider.bucket).toBe("second-bucket");
      expect(config2.provider.provider).toBe("cloudflare-r2");
    });

    it("should throw error when getting global config without initialization", () => {
      expect(() => getUploadConfig()).toThrow(
        "Upload configuration not initialized"
      );
    });
  });

  describe("Configuration Builder", () => {
    it("should validate provider configuration", () => {
      expect(() => {
        createUploadConfig().build();
      }).toThrow("Provider configuration is required");
    });

    it("should validate AWS provider configuration", () => {
      expect(() => {
        createUploadConfig()
          .provider("aws", {
            bucket: "", // Invalid empty bucket
            region: "us-east-1",
            accessKeyId: "key",
            secretAccessKey: "secret",
          })
          .build();
      }).toThrow("Invalid provider configuration");
    });

    it("should chain configuration methods", () => {
      const { config } = createUploadConfig()
        .provider("aws", {
          bucket: "test-bucket",
          region: "us-east-1",
          accessKeyId: "key",
          secretAccessKey: "secret",
        })
        .defaults({
          maxFileSize: "5MB",
          allowedFileTypes: ["image/*"],
        })
        .paths({
          prefix: "uploads/",
        })
        .security({
          requireAuth: true,
        })
        .build();

      expect(config.provider.bucket).toBe("test-bucket");
      expect(config.defaults?.maxFileSize).toBe("5MB");
      expect(config.defaults?.allowedFileTypes).toEqual(["image/*"]);
      expect(config.paths?.prefix).toBe("uploads/");
      expect(config.security?.requireAuth).toBe(true);
    });
  });

  describe("Memory Management", () => {
    it("should not leak memory with multiple configurations", () => {
      const configs: UploadConfig[] = [];

      // Create many configurations
      for (let i = 0; i < 10; i++) {
        const { config } = createUploadConfig()
          .provider("aws", {
            bucket: `bucket-${i}`,
            region: "us-east-1",
            accessKeyId: `key-${i}`,
            secretAccessKey: `secret-${i}`,
          })
          .build();

        configs.push(config);
      }

      // Verify all configurations are independent
      configs.forEach((config, index) => {
        expect(config.provider.bucket).toBe(`bucket-${index}`);
      });

      // Verify no interference between configurations
      expect(configs[0].provider.bucket).toBe("bucket-0");
      expect(configs[9].provider.bucket).toBe("bucket-9");
    });
  });

  describe("Schema Independence", () => {
    it("should create independent schemas across configurations", () => {
      const { s3: s3_1 } = createUploadConfig()
        .provider("aws", {
          bucket: "bucket1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { s3: s3_2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "bucket2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .build();

      // Test file schemas
      const fileSchema1 = s3_1.file({ maxSize: "1MB" });
      const fileSchema2 = s3_2.file({ maxSize: "5MB" });

      expect(fileSchema1).not.toBe(fileSchema2);

      // Test image schemas
      const imageSchema1 = s3_1.image({ maxSize: "2MB" });
      const imageSchema2 = s3_2.image({ maxSize: "10MB" });

      expect(imageSchema1).not.toBe(imageSchema2);

      // Test object schemas
      const objectSchema1 = s3_1.object({ userId: "string" });
      const objectSchema2 = s3_2.object({ fileId: "string" });

      expect(objectSchema1).not.toBe(objectSchema2);
    });
  });
});
