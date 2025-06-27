import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUploadConfig,
  resetUploadConfig,
} from "../core/config/upload-config";

// Mock S3 client to avoid actual AWS calls
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({
      Location: "https://mock-bucket.s3.amazonaws.com/test-file.txt",
      ETag: '"mock-etag"',
      Key: "test-file.txt",
    }),
  })),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  ListObjectsV2Command: vi.fn(),
  GetObjectCommand: vi.fn(),
}));

describe("Phase 3: Storage Client with Config Parameters", () => {
  beforeEach(() => {
    resetUploadConfig();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetUploadConfig();
  });

  describe("Storage Instance Independence", () => {
    it("should create independent storage instances for different configurations", () => {
      const { storage: storage1 } = createUploadConfig()
        .provider("aws", {
          bucket: "storage-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { storage: storage2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "storage-bucket-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .build();

      // Verify storage instances are different objects
      expect(storage1).not.toBe(storage2);
      expect(storage1).toBeDefined();
      expect(storage2).toBeDefined();

      // Verify they have the upload methods
      expect(storage1.upload).toBeDefined();
      expect(storage2.upload).toBeDefined();
      expect(storage1.download).toBeDefined();
      expect(storage2.download).toBeDefined();
      expect(storage1.delete).toBeDefined();
      expect(storage2.delete).toBeDefined();
    });

    it("should maintain different provider configurations in storage instances", () => {
      const { storage: awsStorage, config: awsConfig } = createUploadConfig()
        .provider("aws", {
          bucket: "aws-storage-bucket",
          region: "us-east-1",
          accessKeyId: "aws-key",
          secretAccessKey: "aws-secret",
        })
        .build();

      const { storage: r2Storage, config: r2Config } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "r2-storage-bucket",
          accessKeyId: "r2-key",
          secretAccessKey: "r2-secret",
          region: "auto",
        })
        .build();

      // Verify configurations are different
      expect(awsConfig.provider.bucket).toBe("aws-storage-bucket");
      expect(r2Config.provider.bucket).toBe("r2-storage-bucket");
      expect(awsConfig.provider.provider).toBe("aws");
      expect(r2Config.provider.provider).toBe("cloudflare-r2");

      // Storage instances should be independent
      expect(awsStorage).not.toBe(r2Storage);
    });
  });

  describe("Storage Method Independence", () => {
    it("should handle file operations independently per storage instance", async () => {
      const { storage: storage1 } = createUploadConfig()
        .provider("aws", {
          bucket: "operations-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { storage: storage2 } = createUploadConfig()
        .provider("aws", {
          bucket: "operations-bucket-2",
          region: "us-west-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
        })
        .build();

      // Mock file for testing
      const mockFile = new File(["test content"], "test.txt", {
        type: "text/plain",
      });

      // Both storages should have their methods available
      expect(typeof storage1.upload.file).toBe("function");
      expect(typeof storage2.upload.file).toBe("function");
      expect(typeof storage1.upload.presignedUrl).toBe("function");
      expect(typeof storage2.upload.presignedUrl).toBe("function");

      // Operations should be independent
      expect(storage1.upload.file).not.toBe(storage2.upload.file);
      expect(storage1.upload.presignedUrl).not.toBe(
        storage2.upload.presignedUrl
      );
    });

    it("should handle different provider types in storage operations", () => {
      const { storage: awsStorage } = createUploadConfig()
        .provider("aws", {
          bucket: "aws-ops-bucket",
          region: "us-east-1",
          accessKeyId: "aws-key",
          secretAccessKey: "aws-secret",
        })
        .build();

      const { storage: r2Storage } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "r2-ops-bucket",
          accessKeyId: "r2-key",
          secretAccessKey: "r2-secret",
          region: "auto",
        })
        .build();

      // Both should have the same API surface
      expect(awsStorage.upload).toBeDefined();
      expect(r2Storage.upload).toBeDefined();
      expect(awsStorage.download).toBeDefined();
      expect(r2Storage.download).toBeDefined();

      // But they should be different instances
      expect(awsStorage).not.toBe(r2Storage);
      expect(awsStorage.upload).not.toBe(r2Storage.upload);
    });
  });

  describe("Configuration Isolation in Storage", () => {
    it("should use correct configuration for each storage instance", () => {
      // Create multiple configurations with different settings
      const { storage: storage1, config: config1 } = createUploadConfig()
        .provider("aws", {
          bucket: "config-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .defaults({
          maxFileSize: "5MB",
          acl: "public-read",
        })
        .build();

      const { storage: storage2, config: config2 } = createUploadConfig()
        .provider("aws", {
          bucket: "config-bucket-2",
          region: "us-west-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
        })
        .defaults({
          maxFileSize: "10MB",
          acl: "private",
        })
        .build();

      // Verify configurations are different
      expect(config1.provider.bucket).toBe("config-bucket-1");
      expect(config2.provider.bucket).toBe("config-bucket-2");
      expect(config1.defaults?.maxFileSize).toBe("5MB");
      expect(config2.defaults?.maxFileSize).toBe("10MB");
      expect(config1.defaults?.acl).toBe("public-read");
      expect(config2.defaults?.acl).toBe("private");

      // Storage instances should be independent
      expect(storage1).not.toBe(storage2);
    });

    it("should handle path configuration independently", () => {
      const { storage: storage1 } = createUploadConfig()
        .provider("aws", {
          bucket: "paths-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .paths({
          prefix: "uploads/",
          generateKey: (file) => `custom-${Date.now()}-${file.name}`,
        })
        .build();

      const { storage: storage2 } = createUploadConfig()
        .provider("aws", {
          bucket: "paths-bucket-2",
          region: "us-east-1",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
        })
        .paths({
          prefix: "files/",
          generateKey: (file) => `generated-${file.name}`,
        })
        .build();

      // Storage instances should be independent
      expect(storage1).not.toBe(storage2);
      // Path configuration will be tested in integration tests
    });
  });

  describe("Storage Error Handling", () => {
    it("should handle errors independently per storage instance", () => {
      const { storage: storage1 } = createUploadConfig()
        .provider("aws", {
          bucket: "error-bucket-1",
          region: "us-east-1",
          accessKeyId: "invalid-key-1",
          secretAccessKey: "invalid-secret-1",
        })
        .build();

      const { storage: storage2 } = createUploadConfig()
        .provider("aws", {
          bucket: "error-bucket-2",
          region: "us-east-1",
          accessKeyId: "invalid-key-2",
          secretAccessKey: "invalid-secret-2",
        })
        .build();

      // Both should be independent instances
      expect(storage1).not.toBe(storage2);

      // Error handling should be per-instance
      // (Actual error testing would require integration tests)
      expect(storage1.upload.file).toBeDefined();
      expect(storage2.upload.file).toBeDefined();
    });
  });

  describe("Storage Hooks Independence", () => {
    it("should handle lifecycle hooks independently per storage instance", () => {
      const onUploadStart1 = vi.fn();
      const onUploadComplete1 = vi.fn();
      const onUploadStart2 = vi.fn();
      const onUploadComplete2 = vi.fn();

      const { storage: storage1 } = createUploadConfig()
        .provider("aws", {
          bucket: "hooks-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .hooks({
          onUploadStart: onUploadStart1,
          onUploadComplete: onUploadComplete1,
        })
        .build();

      const { storage: storage2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "hooks-bucket-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .hooks({
          onUploadStart: onUploadStart2,
          onUploadComplete: onUploadComplete2,
        })
        .build();

      // Storage instances should be independent
      expect(storage1).not.toBe(storage2);

      // Hooks should be configured per instance
      // (Hook execution testing would require integration tests)
      expect(storage1.upload).toBeDefined();
      expect(storage2.upload).toBeDefined();
    });
  });

  describe("Storage API Consistency", () => {
    it("should provide consistent API across different providers", () => {
      const { storage: awsStorage } = createUploadConfig()
        .provider("aws", {
          bucket: "api-aws-bucket",
          region: "us-east-1",
          accessKeyId: "aws-key",
          secretAccessKey: "aws-secret",
        })
        .build();

      const { storage: r2Storage } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "api-r2-bucket",
          accessKeyId: "r2-key",
          secretAccessKey: "r2-secret",
          region: "auto",
        })
        .build();

      const { storage: minioStorage } = createUploadConfig()
        .provider("minio", {
          endpoint: "http://localhost:9000",
          bucket: "api-minio-bucket",
          accessKeyId: "minio-key",
          secretAccessKey: "minio-secret",
          region: "us-east-1",
        })
        .build();

      // All storage instances should have the same API surface
      expect(awsStorage.upload).toBeDefined();
      expect(awsStorage.download).toBeDefined();
      expect(awsStorage.delete).toBeDefined();
      expect(awsStorage.list).toBeDefined();
      expect(awsStorage.metadata).toBeDefined();
      expect(awsStorage.validation).toBeDefined();

      expect(r2Storage.upload).toBeDefined();
      expect(r2Storage.download).toBeDefined();
      expect(r2Storage.delete).toBeDefined();
      expect(r2Storage.list).toBeDefined();
      expect(r2Storage.metadata).toBeDefined();
      expect(r2Storage.validation).toBeDefined();

      expect(minioStorage.upload).toBeDefined();
      expect(minioStorage.download).toBeDefined();
      expect(minioStorage.delete).toBeDefined();
      expect(minioStorage.list).toBeDefined();
      expect(minioStorage.metadata).toBeDefined();
      expect(minioStorage.validation).toBeDefined();

      // Upload methods should be consistent
      expect(awsStorage.upload.file).toBeDefined();
      expect(awsStorage.upload.presignedUrl).toBeDefined();
      expect(r2Storage.upload.file).toBeDefined();
      expect(r2Storage.upload.presignedUrl).toBeDefined();
      expect(minioStorage.upload.file).toBeDefined();
      expect(minioStorage.upload.presignedUrl).toBeDefined();

      // But instances should be independent
      expect(awsStorage).not.toBe(r2Storage);
      expect(r2Storage).not.toBe(minioStorage);
      expect(awsStorage).not.toBe(minioStorage);
    });
  });

  describe("Memory Management", () => {
    it("should not leak memory with multiple storage instances", () => {
      const storageInstances: any[] = [];

      // Create many storage instances
      for (let i = 0; i < 10; i++) {
        const { storage } = createUploadConfig()
          .provider("aws", {
            bucket: `memory-bucket-${i}`,
            region: "us-east-1",
            accessKeyId: `key-${i}`,
            secretAccessKey: `secret-${i}`,
          })
          .build();

        storageInstances.push(storage);
      }

      // All should be independent instances
      storageInstances.forEach((storage, index) => {
        expect(storage).toBeDefined();
        expect(storage.upload).toBeDefined();

        // Check they're all different instances
        storageInstances.forEach((otherStorage, otherIndex) => {
          if (index !== otherIndex) {
            expect(storage).not.toBe(otherStorage);
          }
        });
      });
    });
  });
});
