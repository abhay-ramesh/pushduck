import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";

describe("Legacy Functionality Tests", () => {
  beforeEach(() => {
    // No global state to reset
  });

  afterEach(() => {
    // No global state to clean up
  });

  describe("Framework-Agnostic Handlers", () => {
    it("should create universal handlers with proper API", () => {
      const { s3 } = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
          region: "us-east-1",
          bucket: "test-bucket",
        })
        .build();

      const testRouter = s3.createRouter({
        imageUpload: s3.image().max("5MB"),
        documentUpload: s3.file().max("10MB"),
      });

      // Verify router creation
      expect(testRouter).toBeDefined();
      expect(testRouter.getRouteNames()).toEqual([
        "imageUpload",
        "documentUpload",
      ]);

      // Verify handlers property exists
      const handlers = testRouter.handlers;
      expect(handlers).toBeDefined();
      expect(typeof handlers.GET).toBe("function");
      expect(typeof handlers.POST).toBe("function");
    });

    it("should handle GET requests properly", async () => {
      const { s3 } = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
          region: "us-east-1",
          bucket: "test-bucket",
        })
        .build();

      const testRouter = s3.createRouter({
        imageUpload: s3.image().max("5MB"),
        documentUpload: s3.file().max("10MB"),
      });

      const handlers = testRouter.handlers;
      const mockGetRequest = new Request(
        "http://localhost:3000/api/upload?route=imageUpload",
        { method: "GET" }
      );

      const response = await handlers.GET(mockGetRequest);
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.routes).toBeDefined();
      expect(Array.isArray(data.routes)).toBe(true);
      expect(data.routes.length).toBeGreaterThan(0);
      expect(data.routes.map((r: any) => r.name)).toContain("imageUpload");
      expect(data.routes.map((r: any) => r.name)).toContain("documentUpload");
    });
  });

  describe("Response Format Compatibility", () => {
    it("should return correct presign response format", async () => {
      const { s3 } = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
          region: "us-east-1",
          bucket: "test-bucket",
        })
        .build();

      const testRouter = s3.createRouter({
        imageUpload: s3.image().max("5MB"),
      });

      const handlers = testRouter.handlers;
      const presignRequest = new Request(
        "http://localhost:3000/api/upload?route=imageUpload&action=presign",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: [
              {
                name: "test.png",
                size: 1024,
                type: "image/png",
              },
            ],
          }),
        }
      );

      const response = await handlers.POST(presignRequest);
      const data = await response.json();

      // Verify response structure
      expect(data).toHaveProperty("success");
      expect(data.success).toBe(true);
      expect(data).toHaveProperty("results");
      expect(Array.isArray(data.results)).toBe(true);

      if (data.results && data.results.length > 0) {
        const firstResult = data.results[0];

        expect(firstResult).toHaveProperty("success");
        expect(firstResult).toHaveProperty("file");

        if (firstResult.success) {
          // Success case - should have presignedUrl, key, and metadata
          expect(firstResult).toHaveProperty("presignedUrl");
          expect(firstResult).toHaveProperty("key");
          expect(firstResult).toHaveProperty("metadata");
        } else {
          // Error case - should have error message
          expect(firstResult).toHaveProperty("error");
        }
      }
    });

    it("should return correct completion response format", async () => {
      const { s3 } = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
          region: "us-east-1",
          bucket: "test-bucket",
        })
        .build();

      const testRouter = s3.createRouter({
        imageUpload: s3.image().max("5MB"),
      });

      const handlers = testRouter.handlers;
      const completionRequest = new Request(
        "http://localhost:3000/api/upload?route=imageUpload&action=complete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completions: [
              {
                key: "test-key",
                file: { name: "test.png", size: 1024, type: "image/png" },
                metadata: { userId: "test-user" },
              },
            ],
          }),
        }
      );

      const response = await handlers.POST(completionRequest);
      const data = await response.json();

      // Verify response structure
      expect(data).toHaveProperty("success");
      expect(data.success).toBe(true);
      expect(data).toHaveProperty("results");
      expect(Array.isArray(data.results)).toBe(true);
    });

    it("should return correct GET response format", async () => {
      const { s3 } = createUploadConfig()
        .provider("aws", {
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
          region: "us-east-1",
          bucket: "test-bucket",
        })
        .build();

      const testRouter = s3.createRouter({
        imageUpload: s3.image().max("5MB"),
      });

      const handlers = testRouter.handlers;
      const getRequest = new Request("http://localhost:3000/api/upload", {
        method: "GET",
      });

      const response = await handlers.GET(getRequest);
      const data = await response.json();

      // Verify response structure
      expect(data).toHaveProperty("success");
      expect(data.success).toBe(true);
      expect(data).toHaveProperty("routes");
      expect(Array.isArray(data.routes)).toBe(true);
    });
  });

  describe("Multiple Configuration Independence", () => {
    it("should maintain independent configurations", () => {
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

      // Verify configurations are independent
      expect(config1.provider.provider).toBe("aws");
      expect(config2.provider.provider).toBe("cloudflare-r2");
      expect(config1.provider.bucket).toBe("test-bucket-1");
      expect(config2.provider.bucket).toBe("test-bucket-2");
      expect(config1.defaults?.maxFileSize).toBe("5MB");
      expect(config2.defaults?.maxFileSize).toBe("10MB");

      // Verify S3 instances are different
      expect(s3Instance1).not.toBe(s3Instance2);
      expect(typeof s3Instance1).toBe("object");
      expect(typeof s3Instance2).toBe("object");
    });

    it("should create independent schemas", () => {
      const { s3: s3Instance1 } = createUploadConfig()
        .provider("aws", {
          bucket: "test-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { s3: s3Instance2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "test-bucket-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .build();

      const schema1 = s3Instance1.file({ maxSize: "1MB" });
      const schema2 = s3Instance2.file({ maxSize: "2MB" });

      expect(schema1).toBeDefined();
      expect(schema2).toBeDefined();
      expect(schema1).not.toBe(schema2);
    });

    it("should create independent routers", () => {
      const { s3: s3Instance1 } = createUploadConfig()
        .provider("aws", {
          bucket: "test-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { s3: s3Instance2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "test-bucket-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .build();

      const router1 = s3Instance1.createRouter({
        uploads: s3Instance1.file({ maxSize: "5MB" }),
      });

      const router2 = s3Instance2.createRouter({
        documents: s3Instance2.file({ maxSize: "10MB" }),
      });

      expect(router1).not.toBe(router2);
      expect(router1.getRouteNames()).toEqual(["uploads"]);
      expect(router2.getRouteNames()).toEqual(["documents"]);
    });
  });
});
