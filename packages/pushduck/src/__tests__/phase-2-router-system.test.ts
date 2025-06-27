import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";

// Mock NextRequest for testing
class MockNextRequest {
  constructor(
    public url: string = "http://localhost",
    public body?: any
  ) {}
  json = vi.fn().mockResolvedValue({});
  formData = vi.fn().mockResolvedValue({});
}

describe("Phase 2: Router System with Config-Aware Instances", () => {
  beforeEach(() => {
    // No global state to reset
  });

  afterEach(() => {
    // No global state to clean up
  });

  describe("Router Independence", () => {
    it("should create independent routers for different configurations", () => {
      // Create first configuration with router
      const { s3: s3Instance1 } = createUploadConfig()
        .provider("aws", {
          bucket: "router-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      // Create second configuration with router
      const { s3: s3Instance2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "router-bucket-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .build();

      // Create routers from different S3 instances
      const router1 = s3Instance1.createRouter({
        uploads: s3Instance1.file({ maxSize: "5MB" }),
      });

      const router2 = s3Instance2.createRouter({
        documents: s3Instance2.file({ maxSize: "10MB" }),
      });

      // Verify routers are independent objects
      expect(router1).not.toBe(router2);
      expect(router1.getRouteNames()).toEqual(["uploads"]);
      expect(router2.getRouteNames()).toEqual(["documents"]);
    });

    it("should handle different route schemas for different configurations", () => {
      const { s3: s3Instance1 } = createUploadConfig()
        .provider("aws", {
          bucket: "schema-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { s3: s3Instance2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "schema-bucket-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .build();

      // Create routers with different schemas
      const awsRouter = s3Instance1.createRouter({
        images: s3Instance1.image({ maxSize: "2MB" }),
        documents: s3Instance1.file({ maxSize: "5MB" }),
      });

      const r2Router = s3Instance2.createRouter({
        avatars: s3Instance2.image({ maxSize: "1MB" }),
        files: s3Instance2.file({ maxSize: "10MB" }),
        data: s3Instance2.object({
          userId: s3Instance2.file({ maxSize: "1KB" }),
          metadata: s3Instance2.file({ maxSize: "1KB" }),
        }),
      });

      // Verify route names are different
      expect(awsRouter.getRouteNames()).toEqual(["images", "documents"]);
      expect(r2Router.getRouteNames()).toEqual(["avatars", "files", "data"]);

      // Verify routes exist
      expect(awsRouter.getRoute("images")).toBeDefined();
      expect(awsRouter.getRoute("documents")).toBeDefined();
      expect(r2Router.getRoute("avatars")).toBeDefined();
      expect(r2Router.getRoute("files")).toBeDefined();
      expect(r2Router.getRoute("data")).toBeDefined();

      // Verify cross-router isolation (testing with correct route names)
      expect(awsRouter.getRoute("data")).toBeUndefined();
      expect(r2Router.getRoute("documents")).toBeUndefined();
    });
  });

  describe("Router Configuration Isolation", () => {
    it("should use different provider configurations for presigned URLs", async () => {
      // This test verifies that routers created from different configs
      // will use their respective provider configurations

      const { s3: s3Instance1, config: config1 } = createUploadConfig()
        .provider("aws", {
          bucket: "presigned-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { s3: s3Instance2, config: config2 } = createUploadConfig()
        .provider("aws", {
          bucket: "presigned-bucket-2",
          region: "us-west-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
        })
        .build();

      const router1 = s3Instance1.createRouter({
        uploads: s3Instance1.file(),
      });

      const router2 = s3Instance2.createRouter({
        uploads: s3Instance2.file(),
      });

      // Verify routers are independent
      expect(router1).not.toBe(router2);

      // Verify they have different configurations
      expect(config1.provider.bucket).toBe("presigned-bucket-1");
      expect(config2.provider.bucket).toBe("presigned-bucket-2");
      expect(config1.provider.region).toBe("us-east-1");
      expect(config2.provider.region).toBe("us-west-2");
    });

    it("should handle multiple routers from the same configuration", () => {
      const { s3 } = createUploadConfig()
        .provider("aws", {
          bucket: "shared-bucket",
          region: "us-east-1",
          accessKeyId: "key",
          secretAccessKey: "secret",
        })
        .build();

      // Create multiple routers from same S3 instance
      const router1 = s3.createRouter({
        images: s3.image(),
      });

      const router2 = s3.createRouter({
        documents: s3.file(),
      });

      // They should be different objects but with same underlying config
      expect(router1).not.toBe(router2);
      expect(router1.getRouteNames()).toEqual(["images"]);
      expect(router2.getRouteNames()).toEqual(["documents"]);
    });
  });

  describe("Router Error Handling", () => {
    it("should handle route not found errors independently", () => {
      const { s3: s3Instance1 } = createUploadConfig()
        .provider("aws", {
          bucket: "error-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { s3: s3Instance2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "error-bucket-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .build();

      const router1 = s3Instance1.createRouter({
        uploads: s3Instance1.file(),
      });

      const router2 = s3Instance2.createRouter({
        files: s3Instance2.file(),
      });

      // Verify routes exist in their respective routers
      expect(router1.getRoute("uploads")).toBeDefined();
      expect(router1.getRoute("nonexistent")).toBeUndefined();

      expect(router2.getRoute("files")).toBeDefined();
      expect(router2.getRoute("nonexistent")).toBeUndefined();
    });
  });

  describe("Router Middleware Independence", () => {
    it("should isolate middleware between different router configurations", () => {
      const { s3: s3Instance1 } = createUploadConfig()
        .provider("aws", {
          bucket: "middleware-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { s3: s3Instance2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "middleware-bucket-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .build();

      // Create routes with different middleware
      const routeWithMiddleware1 = s3Instance1
        .file()
        .middleware(({ metadata }) => ({ ...metadata, provider: "aws" }));

      const routeWithMiddleware2 = s3Instance2
        .file()
        .middleware(({ metadata }) => ({ ...metadata, provider: "r2" }));

      const router1 = s3Instance1.createRouter({
        uploads: routeWithMiddleware1,
      });

      const router2 = s3Instance2.createRouter({
        uploads: routeWithMiddleware2,
      });

      // Verify routers are independent
      expect(router1).not.toBe(router2);
      expect(router1.getRoute("uploads")).toBeDefined();
      expect(router2.getRoute("uploads")).toBeDefined();
      expect(router1.getRoute("uploads")).not.toBe(router2.getRoute("uploads"));
    });
  });

  describe("Router Hook Independence", () => {
    it("should handle lifecycle hooks independently per configuration", () => {
      const onUploadStart1 = vi.fn();
      const onUploadComplete1 = vi.fn();
      const onUploadStart2 = vi.fn();
      const onUploadComplete2 = vi.fn();

      const { s3: s3Instance1 } = createUploadConfig()
        .provider("aws", {
          bucket: "hooks-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { s3: s3Instance2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "hooks-bucket-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .build();

      // Create routes with different hooks
      const route1 = s3Instance1
        .file()
        .onUploadStart(onUploadStart1)
        .onUploadComplete(onUploadComplete1);

      const route2 = s3Instance2
        .file()
        .onUploadStart(onUploadStart2)
        .onUploadComplete(onUploadComplete2);

      const router1 = s3Instance1.createRouter({
        uploads: route1,
      });

      const router2 = s3Instance2.createRouter({
        uploads: route2,
      });

      // Verify routers and routes are independent
      expect(router1).not.toBe(router2);
      expect(router1.getRoute("uploads")).not.toBe(router2.getRoute("uploads"));

      // Hooks should be attached to their respective routes
      // (Can't directly test hooks without mocking internal router logic)
      expect(router1.getRoute("uploads")).toBeDefined();
      expect(router2.getRoute("uploads")).toBeDefined();
    });
  });

  describe("Router Path Configuration Independence", () => {
    it("should handle different path configurations per router", () => {
      const { s3: s3Instance1 } = createUploadConfig()
        .provider("aws", {
          bucket: "paths-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .paths({
          prefix: "aws-uploads/",
          generateKey: (file) => `aws-${Date.now()}-${file.name}`,
        })
        .build();

      const { s3: s3Instance2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "paths-bucket-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .paths({
          prefix: "r2-uploads/",
          generateKey: (file) => `r2-${Date.now()}-${file.name}`,
        })
        .build();

      const router1 = s3Instance1.createRouter({
        files: s3Instance1.file(),
      });

      const router2 = s3Instance2.createRouter({
        files: s3Instance2.file(),
      });

      // Verify routers are independent with their own path configs
      expect(router1).not.toBe(router2);
      // Path configuration will be tested in integration tests
      // since it requires actual file operations
    });
  });

  describe("Router Type Safety", () => {
    it("should maintain type safety across different configurations", () => {
      const { s3: s3Instance1 } = createUploadConfig()
        .provider("aws", {
          bucket: "types-bucket-1",
          region: "us-east-1",
          accessKeyId: "key1",
          secretAccessKey: "secret1",
        })
        .build();

      const { s3: s3Instance2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "types-bucket-2",
          accessKeyId: "key2",
          secretAccessKey: "secret2",
          region: "auto",
        })
        .build();

      // Create routers with different schema types
      const router1 = s3Instance1.createRouter({
        images: s3Instance1.image(),
        files: s3Instance1.file(),
      });

      const router2 = s3Instance2.createRouter({
        uploads: s3Instance2.file(),
        data: s3Instance2.object({
          metadata: s3Instance2.file(),
        }),
      });

      // Type assertions to verify TypeScript compilation
      const route1Images = router1.getRoute("images");
      const route1Files = router1.getRoute("files");
      const route2Uploads = router2.getRoute("uploads");
      const route2Data = router2.getRoute("data");

      expect(route1Images).toBeDefined();
      expect(route1Files).toBeDefined();
      expect(route2Uploads).toBeDefined();
      expect(route2Data).toBeDefined();

      // Verify route names
      expect(router1.getRouteNames()).toContain("images");
      expect(router1.getRouteNames()).toContain("files");
      expect(router2.getRouteNames()).toContain("uploads");
      expect(router2.getRouteNames()).toContain("data");
    });
  });
});
