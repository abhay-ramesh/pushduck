import { describe, expect, it, vi, beforeEach } from "vitest";
import { generatePresignedUploadUrl, resetS3Client } from "../core/storage/client";
import { createUploadConfig } from "../core/config/upload-config";
import { createS3RouterWithConfig } from "../core/router/router-v2";

// Mock aws4fetch
vi.mock("aws4fetch", () => {
    return {
        AwsClient: class {
            constructor() {
                // console.log("Mock AwsClient constructor called");
            }
            sign = vi.fn().mockImplementation(async (request: any) => {
                return {
                    url: request.url + "&signed=true",
                    method: request.method,
                    headers: request.headers,
                };
            });
        },
    };
});

describe("Presigned URL Signing", () => {
    beforeEach(() => {
        resetS3Client();
    });

    const baseProvider = {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
    };

    it("should include Content-Type and x-amz-acl from defaults in the signed request", async () => {
        const { config } = createUploadConfig()
            .provider("aws", baseProvider)
            .defaults({ acl: "public-read" })
            .build();

        const options = {
            key: "test.txt",
            contentType: "text/plain",
            metadata: {
                userId: "123",
            },
        };

        const result = await generatePresignedUploadUrl(config, options);

        expect(result.fields).toEqual({
            "Content-Type": "text/plain",
            "x-amz-acl": "public-read",
            "x-amz-meta-userId": "123",
        });
    });

    it("should fallback to provider.acl if defaults.acl is missing", async () => {
        const { config } = createUploadConfig()
            .provider("aws", { ...baseProvider, acl: "authenticated-read" })
            .build();

        const result = await generatePresignedUploadUrl(config, { key: "test.txt" });

        expect(result.fields?.["x-amz-acl"]).toBe("authenticated-read");
    });

    it("should prioritize defaults.acl over provider.acl", async () => {
        const { config } = createUploadConfig()
            .provider("aws", { ...baseProvider, acl: "private" })
            .defaults({ acl: "public-read" })
            .build();

        const result = await generatePresignedUploadUrl(config, { key: "test.txt" });

        expect(result.fields?.["x-amz-acl"]).toBe("public-read");
    });

    it("should handle multiple metadata fields", async () => {
        const { config } = createUploadConfig()
            .provider("aws", baseProvider)
            .build();

        const options = {
            key: "test.txt",
            metadata: {
                "user-id": "123",
                "project-id": "456",
                "is-public": "true",
            },
        };

        const result = await generatePresignedUploadUrl(config, options);

        expect(result.fields).toEqual({
            "x-amz-acl": "private",
            "x-amz-meta-user-id": "123",
            "x-amz-meta-project-id": "456",
            "x-amz-meta-is-public": "true",
        });
    });

    it("should include only provided options in fields or default ACL", async () => {
        const { config } = createUploadConfig()
            .provider("aws", baseProvider)
            .build();

        const options = {
            key: "test-minimal.txt",
        };

        const result = await generatePresignedUploadUrl(config, options);

        expect(result.fields).toEqual({
            "x-amz-acl": "private",
        });
    });

    it("router should include fields in generatePresignedUrls response", async () => {
        const { s3, config } = createUploadConfig()
            .provider("aws", baseProvider)
            .defaults({ acl: "private" })
            .build();

        const router = createS3RouterWithConfig({
            testRoute: s3.image().maxFileSize("1MB").middleware(async () => ({})),
        }, config);

        const results = await router.generatePresignedUrls(
            "testRoute",
            new Request("http://localhost"),
            [{ name: "test.jpg", size: 1024, type: "image/jpeg" }]
        );

        expect(results[0].success).toBe(true);
        expect(results[0].fields).toBeDefined();
        expect(results[0].fields?.["x-amz-acl"]).toBe("private");
        expect(results[0].fields?.["Content-Type"]).toBe("image/jpeg");
    });
});
