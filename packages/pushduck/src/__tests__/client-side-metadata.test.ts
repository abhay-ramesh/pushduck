/**
 * @fileoverview Tests for client-side metadata support
 *
 * This test suite verifies that metadata flows correctly from client to server:
 * 1. Client sends metadata with upload request
 * 2. Handler extracts metadata from request body
 * 3. Router receives and passes metadata to middleware
 * 4. Middleware can enrich/validate metadata
 * 5. Metadata is available in lifecycle hooks
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";

describe("Client-Side Metadata Support", () => {
  let mockConfig: any;
  let mockRouter: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a test configuration
    const { s3, config } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build();

    mockConfig = config;

    // Create router with middleware that uses metadata
    mockRouter = s3.createRouter({
      testUpload: s3
        .file()
        .maxFileSize("10MB")
        .middleware(async ({ metadata }) => {
          return {
            ...metadata,
            serverProcessed: true,
            timestamp: new Date().toISOString(),
          };
        }),
    });
  });

  describe("Router generatePresignedUrls", () => {
    it("should accept optional metadata parameter", async () => {
      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];

      // Mock Request
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      // Should work without metadata
      await expect(
        mockRouter.generatePresignedUrls("testUpload", mockRequest, files)
      ).resolves.toBeDefined();

      // Should work with metadata
      await expect(
        mockRouter.generatePresignedUrls("testUpload", mockRequest, files, {
          albumId: "123",
          tags: ["test"],
        })
      ).resolves.toBeDefined();
    });

    it("should pass client metadata to middleware chain", async () => {
      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];

      const clientMetadata = {
        albumId: "album-123",
        tags: ["vacation", "beach"],
        visibility: "private",
      };

      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      const results = await mockRouter.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files,
        clientMetadata
      );

      // Verify metadata was processed
      expect(results[0].metadata).toBeDefined();
      expect(results[0].metadata.albumId).toBe("album-123");
      expect(results[0].metadata.tags).toEqual(["vacation", "beach"]);
      expect(results[0].metadata.serverProcessed).toBe(true);
      expect(results[0].metadata.timestamp).toBeDefined();
    });

    it("should use empty object when metadata is undefined", async () => {
      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];

      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      const results = await mockRouter.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files
        // No metadata parameter
      );

      expect(results[0].metadata).toBeDefined();
      expect(results[0].metadata.serverProcessed).toBe(true);
    });

    it("should allow middleware to override client metadata", async () => {
      const { s3, config } = createUploadConfig()
        .provider("aws", {
          bucket: "test-bucket",
          region: "us-east-1",
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
        })
        .build();

      const secureRouter = s3.createRouter({
        secureUpload: s3.file().middleware(async ({ metadata }) => {
          // Server should override client-provided userId
          return {
            albumId: metadata?.albumId, // Keep client data
            userId: "server-authenticated-user", // Override with server auth
            role: "user", // Server determines this
            timestamp: Date.now(),
          };
        }),
      });

      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      // Client tries to spoof userId
      const maliciousMetadata = {
        albumId: "album-123",
        userId: "admin", // Client trying to impersonate
        role: "admin", // Client trying to elevate privileges
      };

      const results = await secureRouter.generatePresignedUrls(
        "secureUpload",
        mockRequest,
        files,
        maliciousMetadata
      );

      // Verify server overrode malicious metadata
      expect(results[0].metadata.userId).toBe("server-authenticated-user");
      expect(results[0].metadata.role).toBe("user");
      expect(results[0].metadata.albumId).toBe("album-123"); // Safe client data kept
    });
  });

  describe("Metadata in Lifecycle Hooks", () => {
    it("should pass metadata to onUploadStart hook", async () => {
      const onUploadStartSpy = vi.fn();

      const { s3 } = createUploadConfig()
        .provider("aws", {
          bucket: "test-bucket",
          region: "us-east-1",
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
        })
        .build();

      const routerWithHooks = s3.createRouter({
        testUpload: s3
          .file()
          .middleware(async ({ metadata }) => ({
            ...metadata,
            processed: true,
          }))
          .onUploadStart(onUploadStartSpy),
      });

      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      const clientMetadata = { albumId: "123", tags: ["test"] };

      await routerWithHooks.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files,
        clientMetadata
      );

      expect(onUploadStartSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          file: expect.any(Object),
          metadata: expect.objectContaining({
            albumId: "123",
            tags: ["test"],
            processed: true,
          }),
        })
      );
    });

    it("should pass metadata through multiple middleware", async () => {
      const { s3 } = createUploadConfig()
        .provider("aws", {
          bucket: "test-bucket",
          region: "us-east-1",
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
        })
        .build();

      const routerWithMultipleMiddleware = s3.createRouter({
        testUpload: s3
          .file()
          .middleware(async ({ metadata }) => ({
            ...metadata,
            step1: "completed",
          }))
          .middleware(async ({ metadata }) => ({
            ...metadata,
            step2: "completed",
          }))
          .middleware(async ({ metadata }) => ({
            ...metadata,
            step3: "completed",
          })),
      });

      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      const results = await routerWithMultipleMiddleware.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files,
        { original: "client-data" }
      );

      expect(results[0].metadata).toEqual({
        original: "client-data",
        step1: "completed",
        step2: "completed",
        step3: "completed",
      });
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle null metadata gracefully", async () => {
      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      const results = await mockRouter.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files,
        null
      );

      expect(results[0].metadata).toBeDefined();
    });

    it("should handle empty metadata object", async () => {
      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      const results = await mockRouter.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files,
        {}
      );

      expect(results[0].metadata).toBeDefined();
      expect(results[0].metadata.serverProcessed).toBe(true);
    });

    it("should handle complex nested metadata", async () => {
      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      const complexMetadata = {
        user: {
          id: "user-123",
          preferences: {
            theme: "dark",
            notifications: true,
          },
        },
        upload: {
          context: {
            workspace: "ws-456",
            project: "proj-789",
          },
          settings: {
            visibility: "private",
            tags: ["important", "urgent"],
          },
        },
      };

      const results = await mockRouter.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files,
        complexMetadata
      );

      expect(results[0].metadata.user).toBeDefined();
      expect(results[0].metadata.user.id).toBe("user-123");
      expect(results[0].metadata.upload.context.workspace).toBe("ws-456");
    });

    it("should handle array metadata values", async () => {
      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      const metadataWithArrays = {
        tags: ["tag1", "tag2", "tag3"],
        permissions: ["read", "write"],
        collaborators: [
          { id: "user1", role: "editor" },
          { id: "user2", role: "viewer" },
        ],
      };

      const results = await mockRouter.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files,
        metadataWithArrays
      );

      expect(results[0].metadata.tags).toEqual(["tag1", "tag2", "tag3"]);
      expect(results[0].metadata.collaborators).toHaveLength(2);
    });
  });

  describe("Type Safety", () => {
    it("should work with typed metadata interfaces", async () => {
      interface UploadMetadata {
        albumId: string;
        tags: string[];
        visibility: "public" | "private";
      }

      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      const typedMetadata: UploadMetadata = {
        albumId: "album-123",
        tags: ["vacation"],
        visibility: "private",
      };

      const results = await mockRouter.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files,
        typedMetadata
      );

      expect(results[0].metadata.albumId).toBe("album-123");
      expect(results[0].metadata.visibility).toBe("private");
    });
  });

  describe("Real-World Scenarios", () => {
    it("should support multi-tenant upload scenario", async () => {
      const files = [{ name: "doc.pdf", size: 50000, type: "application/pdf" }];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      const multiTenantMetadata = {
        workspaceId: "workspace-abc",
        projectId: "project-xyz",
        teamId: "team-123",
        folder: "/documents/reports",
      };

      const results = await mockRouter.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files,
        multiTenantMetadata
      );

      expect(results[0].metadata.workspaceId).toBe("workspace-abc");
      expect(results[0].metadata.projectId).toBe("project-xyz");
    });

    it("should support e-commerce product image upload", async () => {
      const files = [{ name: "product.jpg", size: 200000, type: "image/jpeg" }];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      const productMetadata = {
        productId: "prod-12345",
        variantId: "var-67890",
        imageType: "gallery",
        sortOrder: 2,
        altText: "Product showcase image",
      };

      const results = await mockRouter.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files,
        productMetadata
      );

      expect(results[0].metadata.productId).toBe("prod-12345");
      expect(results[0].metadata.imageType).toBe("gallery");
      expect(results[0].metadata.sortOrder).toBe(2);
    });

    it("should support CMS content upload with categorization", async () => {
      const files = [
        { name: "article-hero.jpg", size: 150000, type: "image/jpeg" },
      ];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      const cmsMetadata = {
        contentType: "article",
        category: "technology",
        tags: ["ai", "machine-learning", "featured"],
        author: "john-doe",
        publishDate: "2025-01-15",
        featured: true,
      };

      const results = await mockRouter.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files,
        cmsMetadata
      );

      expect(results[0].metadata.category).toBe("technology");
      expect(results[0].metadata.tags).toContain("ai");
      expect(results[0].metadata.featured).toBe(true);
    });
  });

  describe("Backward Compatibility", () => {
    it("should work without metadata parameter (existing code)", async () => {
      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      // Old code that doesn't pass metadata
      const results = await mockRouter.generatePresignedUrls(
        "testUpload",
        mockRequest,
        files
      );

      expect(results).toBeDefined();
      expect(results[0].success).toBe(true);
    });

    it("should not break routes without middleware", async () => {
      const { s3 } = createUploadConfig()
        .provider("aws", {
          bucket: "test-bucket",
          region: "us-east-1",
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
        })
        .build();

      const simpleRouter = s3.createRouter({
        simpleUpload: s3.file().maxFileSize("5MB"),
      });

      const files = [{ name: "test.txt", size: 1000, type: "text/plain" }];
      const mockRequest = {
        headers: new Map(),
        method: "POST",
        url: "http://localhost:3000/api/upload",
      } as any;

      // Should work with metadata even though route has no middleware
      const results = await simpleRouter.generatePresignedUrls(
        "simpleUpload",
        mockRequest,
        files,
        { someData: "test" }
      );

      expect(results).toBeDefined();
      expect(results[0].success).toBe(true);
    });
  });
});
