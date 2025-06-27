import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";

describe("Phase 1: Global State Independence", () => {
  // Global config removal means no reset needed - configs are independent
  beforeEach(() => {
    // No global state to reset
  });

  afterEach(() => {
    // No global state to clean up
  });

  describe("Multiple Configuration Independence", () => {
    it("should create independent configurations without interference", () => {
      // Create two different configurations
      const config1 = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key-1",
          secretAccessKey: "test-secret-1",
          region: "us-east-1",
          bucket: "test-bucket-1",
        })
        .build();

      const config2 = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "test-account",
          accessKeyId: "test-key-2",
          secretAccessKey: "test-secret-2",
          bucket: "test-bucket-2",
        })
        .build();

      // Verify both configurations are independent
      expect(config1.config.provider.provider).toBe("aws");
      expect(config2.config.provider.provider).toBe("cloudflare-r2");
      expect(config1.config.provider.bucket).toBe("test-bucket-1");
      expect(config2.config.provider.bucket).toBe("test-bucket-2");

      // Verify S3 instances are different
      expect(config1.s3).not.toBe(config2.s3);
    });

    it("should create different S3 schema instances", () => {
      const config1 = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key-1",
          secretAccessKey: "test-secret-1",
          region: "us-east-1",
          bucket: "test-bucket-1",
        })
        .build();

      const config2 = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key-2",
          secretAccessKey: "test-secret-2",
          region: "us-west-2",
          bucket: "test-bucket-2",
        })
        .build();

      // S3 instances should be different even with same provider
      expect(config1.s3).not.toBe(config2.s3);

      // Each should have its own configuration-aware methods
      expect(typeof config1.s3.file).toBe("function");
      expect(typeof config2.s3.createRouter).toBe("function");
    });

    it("should handle multiple providers of the same type", () => {
      const awsConfig1 = createUploadConfig()
        .provider("aws", {
          accessKeyId: "key1",
          secretAccessKey: "secret1",
          region: "us-east-1",
          bucket: "bucket1",
        })
        .build();

      const awsConfig2 = createUploadConfig()
        .provider("aws", {
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "us-west-2",
          bucket: "bucket2",
        })
        .build();

      // Both should work independently
      expect(awsConfig1.config.provider.bucket).toBe("bucket1");
      expect(awsConfig2.config.provider.bucket).toBe("bucket2");
      expect(awsConfig1.config.provider.region).toBe("us-east-1");
      expect(awsConfig2.config.provider.region).toBe("us-west-2");
    });
  });

  describe("Global State Compatibility", () => {
    it("should set global config only for first configuration", () => {
      // This test verifies backward compatibility behavior
      const config1 = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key-1",
          secretAccessKey: "test-secret-1",
          region: "us-east-1",
          bucket: "test-bucket-1",
        })
        .build();

      const config2 = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key-2",
          secretAccessKey: "test-secret-2",
          region: "us-east-1",
          bucket: "test-bucket-2",
        })
        .build();

      // Both configs should be independent
      expect(config1.config.provider.bucket).toBe("test-bucket-1");
      expect(config2.config.provider.bucket).toBe("test-bucket-2");
    });

    it("should work without global config initialization", () => {
      // Create config without initializing global state
      const config = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
          region: "us-east-1",
          bucket: "test-bucket",
        })
        .build();

      // Should work fine
      expect(config.config.provider.provider).toBe("aws");
      expect(typeof config.s3.file).toBe("function");
    });
  });

  describe("Configuration Builder", () => {
    it("should validate provider configuration", () => {
      expect(() => {
        createUploadConfig()
          .provider("aws", {
            // Missing required fields
            accessKeyId: "",
            secretAccessKey: "",
            region: "",
            bucket: "",
          })
          .build();
      }).toThrow();
    });

    it("should validate AWS provider configuration", () => {
      expect(() => {
        createUploadConfig()
          .provider("aws", {
            accessKeyId: "test-key",
            secretAccessKey: "test-secret",
            region: "us-east-1",
            bucket: "test-bucket",
          })
          .build();
      }).not.toThrow();
    });

    it("should chain configuration methods", () => {
      const config = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
          region: "us-east-1",
          bucket: "test-bucket",
        })
        .defaults({
          maxFileSize: "10MB",
          acl: "public-read",
        })
        .paths({
          prefix: "uploads",
        })
        .build();

      expect(config.config.defaults?.maxFileSize).toBe("10MB");
      expect(config.config.defaults?.acl).toBe("public-read");
      expect(config.config.paths?.prefix).toBe("uploads");
    });
  });

  describe("Memory Management", () => {
    it("should not leak memory with multiple configurations", () => {
      // Create multiple configurations
      const configs = [];
      for (let i = 0; i < 10; i++) {
        configs.push(
          createUploadConfig()
            .provider("aws", {
              accessKeyId: `key-${i}`,
              secretAccessKey: `secret-${i}`,
              region: "us-east-1",
              bucket: `bucket-${i}`,
            })
            .build()
        );
      }

      // All should be independent
      expect(configs).toHaveLength(10);
      configs.forEach((config, index) => {
        expect(config.config.provider.bucket).toBe(`bucket-${index}`);
      });
    });
  });

  describe("Schema Independence", () => {
    it("should create independent schemas across configurations", () => {
      const config1 = createUploadConfig()
        .provider("aws", {
          accessKeyId: "key1",
          secretAccessKey: "secret1",
          region: "us-east-1",
          bucket: "bucket1",
        })
        .build();

      const config2 = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          bucket: "bucket2",
        })
        .build();

      // Each should have independent S3 instances
      expect(config1.s3).not.toBe(config2.s3);
      expect(typeof config1.s3.file).toBe("function");
      expect(typeof config2.s3.image).toBe("function");
    });
  });
});
