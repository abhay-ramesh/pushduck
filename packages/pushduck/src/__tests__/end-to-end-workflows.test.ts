import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";

describe("Integration Tests: End-to-End Multi-Configuration", () => {
  beforeEach(() => {
    // No global state to reset
  });

  afterEach(() => {
    // No global state to clean up
  });

  describe("Complete Multi-Provider Workflow", () => {
    it("should handle complete workflow with multiple providers simultaneously", () => {
      // Scenario: E-commerce app with multiple storage needs

      // 1. User uploads (AWS S3)
      const {
        config: userConfig,
        s3: userS3,
        storage: userStorage,
      } = createUploadConfig()
        .provider("aws", {
          bucket: "ecommerce-user-uploads",
          region: "us-east-1",
          accessKeyId: "user-key",
          secretAccessKey: "user-secret",
        })
        .defaults({
          maxFileSize: "5MB",
          allowedFileTypes: ["image/*"],
        })
        .paths({
          prefix: "user-content/",
        })
        .build();

      // 2. Product images (Cloudflare R2)
      const {
        config: productConfig,
        s3: productS3,
        storage: productStorage,
      } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "ecommerce-products",
          accessKeyId: "product-key",
          secretAccessKey: "product-secret",
          region: "auto",
        })
        .defaults({
          maxFileSize: "10MB",
          allowedFileTypes: ["image/*", "video/*"],
        })
        .paths({
          prefix: "products/",
        })
        .build();

      // 3. Documents (Minio/Self-hosted)
      const {
        config: docConfig,
        s3: docS3,
        storage: docStorage,
      } = createUploadConfig()
        .provider("minio", {
          endpoint: "http://localhost:9000",
          bucket: "ecommerce-documents",
          accessKeyId: "doc-key",
          secretAccessKey: "doc-secret",
          region: "us-east-1",
        })
        .defaults({
          maxFileSize: "50MB",
          allowedFileTypes: ["application/pdf", "text/*"],
        })
        .paths({
          prefix: "documents/",
        })
        .build();

      // Verify all configurations are independent
      expect(userConfig.provider.bucket).toBe("ecommerce-user-uploads");
      expect(productConfig.provider.bucket).toBe("ecommerce-products");
      expect(docConfig.provider.bucket).toBe("ecommerce-documents");

      expect(userConfig.provider.provider).toBe("aws");
      expect(productConfig.provider.provider).toBe("cloudflare-r2");
      expect(docConfig.provider.provider).toBe("minio");

      // Verify S3 instances are independent
      expect(userS3).not.toBe(productS3);
      expect(productS3).not.toBe(docS3);
      expect(userS3).not.toBe(docS3);

      // Verify storage instances are independent
      expect(userStorage).not.toBe(productStorage);
      expect(productStorage).not.toBe(docStorage);
      expect(userStorage).not.toBe(docStorage);

      // Create routers for each use case
      const userRouter = userS3.createRouter({
        avatars: userS3.image({ maxSize: "2MB" }),
        photos: userS3.image({ maxSize: "5MB" }),
      });

      const productRouter = productS3.createRouter({
        images: productS3.image({ maxSize: "8MB" }),
        videos: productS3.file({ maxSize: "50MB" }),
      });

      const docRouter = docS3.createRouter({
        invoices: docS3.file({ maxSize: "10MB" }),
        manuals: docS3.file({ maxSize: "50MB" }),
      });

      // Verify routers are independent
      expect(userRouter.getRouteNames()).toEqual(["avatars", "photos"]);
      expect(productRouter.getRouteNames()).toEqual(["images", "videos"]);
      expect(docRouter.getRouteNames()).toEqual(["invoices", "manuals"]);

      // Verify no cross-contamination
      expect(userRouter).not.toBe(productRouter);
      expect(productRouter).not.toBe(docRouter);
      expect(userRouter).not.toBe(docRouter);
    });

    it("should handle same provider with different configurations", () => {
      // Scenario: Multi-tenant app with AWS regions

      // US customers
      const { config: usConfig, s3: usS3 } = createUploadConfig()
        .provider("aws", {
          bucket: "app-us-customers",
          region: "us-east-1",
          accessKeyId: "us-key",
          secretAccessKey: "us-secret",
        })
        .defaults({
          maxFileSize: "10MB",
        })
        .paths({
          prefix: "us/",
        })
        .build();

      // EU customers (GDPR compliance)
      const { config: euConfig, s3: euS3 } = createUploadConfig()
        .provider("aws", {
          bucket: "app-eu-customers",
          region: "eu-west-1",
          accessKeyId: "eu-key",
          secretAccessKey: "eu-secret",
        })
        .defaults({
          maxFileSize: "5MB", // Different limits for EU
        })
        .paths({
          prefix: "eu/",
        })
        .security({
          requireAuth: true, // GDPR requirement
        })
        .build();

      // Asia-Pacific customers
      const { config: apacConfig, s3: apacS3 } = createUploadConfig()
        .provider("aws", {
          bucket: "app-apac-customers",
          region: "ap-southeast-1",
          accessKeyId: "apac-key",
          secretAccessKey: "apac-secret",
        })
        .defaults({
          maxFileSize: "15MB",
        })
        .paths({
          prefix: "apac/",
        })
        .build();

      // Verify all are AWS but with different configurations
      expect(usConfig.provider.provider).toBe("aws");
      expect(euConfig.provider.provider).toBe("aws");
      expect(apacConfig.provider.provider).toBe("aws");

      // But different regions and settings
      expect(usConfig.provider.region).toBe("us-east-1");
      expect(euConfig.provider.region).toBe("eu-west-1");
      expect(apacConfig.provider.region).toBe("ap-southeast-1");

      expect(usConfig.defaults?.maxFileSize).toBe("10MB");
      expect(euConfig.defaults?.maxFileSize).toBe("5MB");
      expect(apacConfig.defaults?.maxFileSize).toBe("15MB");

      expect(euConfig.security?.requireAuth).toBe(true);
      expect(usConfig.security?.requireAuth).toBeUndefined();
      expect(apacConfig.security?.requireAuth).toBeUndefined();

      // S3 instances should be independent
      expect(usS3).not.toBe(euS3);
      expect(euS3).not.toBe(apacS3);
      expect(usS3).not.toBe(apacS3);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle development vs production configurations", () => {
      // Development environment
      const { config: devConfig, s3: devS3 } = createUploadConfig()
        .provider("minio", {
          endpoint: "http://localhost:9000",
          bucket: "dev-uploads",
          accessKeyId: "minioadmin",
          secretAccessKey: "minioadmin",
          region: "us-east-1",
        })
        .defaults({
          maxFileSize: "100MB", // Generous limits for dev
        })
        .paths({
          prefix: "dev/",
        })
        .build();

      // Production environment
      const { config: prodConfig, s3: prodS3 } = createUploadConfig()
        .provider("aws", {
          bucket: "prod-uploads",
          region: "us-east-1",
          accessKeyId: "prod-key",
          secretAccessKey: "prod-secret",
        })
        .defaults({
          maxFileSize: "10MB", // Strict limits for prod
          acl: "private",
        })
        .paths({
          prefix: "prod/",
        })
        .security({
          requireAuth: true,
          rateLimiting: {
            maxUploads: 100,
            windowMs: 60000,
          },
        })
        .build();

      // Verify different providers
      expect(devConfig.provider.provider).toBe("minio");
      expect(prodConfig.provider.provider).toBe("aws");

      // Verify different security postures
      expect(devConfig.security?.requireAuth).toBeUndefined();
      expect(prodConfig.security?.requireAuth).toBe(true);
      expect(prodConfig.security?.rateLimiting).toBeDefined();

      // Verify different file size limits
      expect(devConfig.defaults?.maxFileSize).toBe("100MB");
      expect(prodConfig.defaults?.maxFileSize).toBe("10MB");

      // Verify independent instances
      expect(devS3).not.toBe(prodS3);
    });

    it("should handle microservices architecture", () => {
      // User service
      const { config: userServiceConfig, s3: userServiceS3 } =
        createUploadConfig()
          .provider("aws", {
            bucket: "microservice-users",
            region: "us-east-1",
            accessKeyId: "user-service-key",
            secretAccessKey: "user-service-secret",
          })
          .paths({
            prefix: "users/",
          })
          .build();

      // Product service
      const { config: productServiceConfig, s3: productServiceS3 } =
        createUploadConfig()
          .provider("cloudflareR2", {
            accountId: "account123",
            bucket: "microservice-products",
            accessKeyId: "product-service-key",
            secretAccessKey: "product-service-secret",
            region: "auto",
          })
          .paths({
            prefix: "products/",
          })
          .build();

      // Order service
      const { config: orderServiceConfig, s3: orderServiceS3 } =
        createUploadConfig()
          .provider("aws", {
            bucket: "microservice-orders",
            region: "us-west-2",
            accessKeyId: "order-service-key",
            secretAccessKey: "order-service-secret",
          })
          .paths({
            prefix: "orders/",
          })
          .build();

      // Verify service isolation
      expect(userServiceConfig.provider.bucket).toBe("microservice-users");
      expect(productServiceConfig.provider.bucket).toBe(
        "microservice-products"
      );
      expect(orderServiceConfig.provider.bucket).toBe("microservice-orders");

      // Different providers per service
      expect(userServiceConfig.provider.provider).toBe("aws");
      expect(productServiceConfig.provider.provider).toBe("cloudflare-r2");
      expect(orderServiceConfig.provider.provider).toBe("aws");

      // Services should be completely isolated
      expect(userServiceS3).not.toBe(productServiceS3);
      expect(productServiceS3).not.toBe(orderServiceS3);
      expect(userServiceS3).not.toBe(orderServiceS3);

      // Each service can have its own schemas
      const userRouter = userServiceS3.createRouter({
        profiles: userServiceS3.image(),
      });

      const productRouter = productServiceS3.createRouter({
        catalog: productServiceS3.image(),
      });

      const orderRouter = orderServiceS3.createRouter({
        receipts: orderServiceS3.file(),
      });

      expect(userRouter.getRouteNames()).toEqual(["profiles"]);
      expect(productRouter.getRouteNames()).toEqual(["catalog"]);
      expect(orderRouter.getRouteNames()).toEqual(["receipts"]);
    });
  });

  describe("Error Isolation", () => {
    it("should isolate errors between different configurations", () => {
      // Valid configuration
      const { config: validConfig } = createUploadConfig()
        .provider("aws", {
          bucket: "valid-bucket",
          region: "us-east-1",
          accessKeyId: "valid-key",
          secretAccessKey: "valid-secret",
        })
        .build();

      // Invalid configuration (missing required fields)
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

      // Valid config should still work despite invalid one
      expect(validConfig.provider.bucket).toBe("valid-bucket");
      expect(validConfig.provider.provider).toBe("aws");
    });

    it("should handle concurrent configuration creation", () => {
      // Simulate concurrent config creation (like in serverless)
      const configs = [];
      const promises = [];

      for (let i = 0; i < 5; i++) {
        const promise = Promise.resolve().then(() => {
          const { config } = createUploadConfig()
            .provider("aws", {
              bucket: `concurrent-bucket-${i}`,
              region: "us-east-1",
              accessKeyId: `key-${i}`,
              secretAccessKey: `secret-${i}`,
            })
            .build();
          return config;
        });
        promises.push(promise);
      }

      return Promise.all(promises).then((resolvedConfigs) => {
        resolvedConfigs.forEach((config, index) => {
          expect(config.provider.bucket).toBe(`concurrent-bucket-${index}`);
        });

        // All configs should be independent
        for (let i = 0; i < resolvedConfigs.length; i++) {
          for (let j = i + 1; j < resolvedConfigs.length; j++) {
            expect(resolvedConfigs[i]).not.toBe(resolvedConfigs[j]);
          }
        }
      });
    });
  });

  describe("Memory and Performance", () => {
    it("should handle many configurations without memory leaks", () => {
      const configs = [];
      const s3Instances = [];
      const storageInstances = [];

      // Create 50 different configurations
      for (let i = 0; i < 50; i++) {
        const { config, s3, storage } = createUploadConfig()
          .provider("aws", {
            bucket: `perf-bucket-${i}`,
            region: "us-east-1",
            accessKeyId: `key-${i}`,
            secretAccessKey: `secret-${i}`,
          })
          .build();

        configs.push(config);
        s3Instances.push(s3);
        storageInstances.push(storage);
      }

      // Verify all are independent
      configs.forEach((config, index) => {
        expect(config.provider.bucket).toBe(`perf-bucket-${index}`);
      });

      // Check all S3 instances are different
      for (let i = 0; i < s3Instances.length; i++) {
        for (let j = i + 1; j < s3Instances.length; j++) {
          expect(s3Instances[i]).not.toBe(s3Instances[j]);
        }
      }

      // Check all storage instances are different
      for (let i = 0; i < storageInstances.length; i++) {
        for (let j = i + 1; j < storageInstances.length; j++) {
          expect(storageInstances[i]).not.toBe(storageInstances[j]);
        }
      }
    });
  });

  describe("Migration Scenarios", () => {
    it("should support gradual migration from single to multi-config", () => {
      // Old approach: single global config (for backward compatibility)
      const { config: globalConfig } = createUploadConfig()
        .provider("aws", {
          bucket: "legacy-bucket",
          region: "us-east-1",
          accessKeyId: "legacy-key",
          secretAccessKey: "legacy-secret",
        })
        .build();

      // New approach: multiple specific configs
      const { config: newConfig1 } = createUploadConfig()
        .provider("aws", {
          bucket: "new-bucket-1",
          region: "us-east-1",
          accessKeyId: "new-key-1",
          secretAccessKey: "new-secret-1",
        })
        .build();

      const { config: newConfig2 } = createUploadConfig()
        .provider("cloudflareR2", {
          accountId: "account123",
          bucket: "new-bucket-2",
          accessKeyId: "new-key-2",
          secretAccessKey: "new-secret-2",
          region: "auto",
        })
        .build();

      // All should coexist without interference
      expect(globalConfig.provider.bucket).toBe("legacy-bucket");
      expect(newConfig1.provider.bucket).toBe("new-bucket-1");
      expect(newConfig2.provider.bucket).toBe("new-bucket-2");

      expect(globalConfig.provider.provider).toBe("aws");
      expect(newConfig1.provider.provider).toBe("aws");
      expect(newConfig2.provider.provider).toBe("cloudflare-r2");
    });
  });
});
