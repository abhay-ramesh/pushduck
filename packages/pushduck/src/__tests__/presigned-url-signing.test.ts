import { describe, expect, it, vi, beforeEach } from "vitest";
import { generatePresignedUploadUrl, resetS3Client } from "../core/storage/client";
import { createUploadConfig } from "../core/config/upload-config";
import { createS3RouterWithConfig } from "../core/router/router-v2";

// Mock aws4fetch
const signMock = vi.fn().mockImplementation(async (request: any) => {
    return {
        url: request.url + "&signed=true",
        method: request.method,
        headers: request.headers,
    };
});

vi.mock("aws4fetch", () => {
    return {
        AwsClient: class {
            sign = signMock;
        },
    };
});

describe("Presigned URL Signing", () => {
    beforeEach(() => {
        resetS3Client();
        signMock.mockClear();
    });

    const baseProvider = {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
    };

    it("should sign only x-amz-acl, not Content-Type or metadata", async () => {
        const { config } = createUploadConfig()
            .provider("aws", baseProvider)
            .defaults({ acl: "public-read" })
            .build();

        const result = await generatePresignedUploadUrl(config, {
            key: "test.txt",
            contentType: "text/plain",
            metadata: { userId: "123" },
        });

        // requiredHeaders contains all three — client sends all of them
        expect(result.requiredHeaders).toEqual({
            "x-amz-acl": "public-read",
            "Content-Type": "text/plain",
            "x-amz-meta-userId": "123",
        });

        // sign() receives ONLY the ACL — Content-Type and metadata are NOT signed
        const request = signMock.mock.calls[0][0] as Request;
        expect(request.headers.get("x-amz-acl")).toBe("public-read");
        expect(request.headers.get("Content-Type")).toBeNull();
        expect(request.headers.get("x-amz-meta-userId")).toBeNull();
    });

    it("should fall back to provider.acl when defaults.acl is not set", async () => {
        const { config } = createUploadConfig()
            .provider("aws", { ...baseProvider, acl: "authenticated-read" })
            .build();

        await generatePresignedUploadUrl(config, { key: "test.txt" });

        const request = signMock.mock.calls[0][0] as Request;
        expect(request.headers.get("x-amz-acl")).toBe("authenticated-read");
    });

    it("should prefer defaults.acl over provider.acl", async () => {
        const { config } = createUploadConfig()
            .provider("aws", { ...baseProvider, acl: "private" })
            .defaults({ acl: "public-read" })
            .build();

        await generatePresignedUploadUrl(config, { key: "test.txt" });

        const request = signMock.mock.calls[0][0] as Request;
        expect(request.headers.get("x-amz-acl")).toBe("public-read");
    });

    it("should include metadata in requiredHeaders but not in the signed request", async () => {
        const { config } = createUploadConfig()
            .provider("aws", baseProvider)
            .defaults({ acl: "public-read" })
            .build();

        const result = await generatePresignedUploadUrl(config, {
            key: "test.txt",
            metadata: {
                "user-id": "123",
                "project-id": "456",
                "is-public": "true",
            },
        });

        // All metadata headers are in requiredHeaders for the client to send
        expect(result.requiredHeaders?.["x-amz-meta-user-id"]).toBe("123");
        expect(result.requiredHeaders?.["x-amz-meta-project-id"]).toBe("456");
        expect(result.requiredHeaders?.["x-amz-meta-is-public"]).toBe("true");

        // Metadata is NOT in the signed request — no CORS AllowedHeaders change needed
        const request = signMock.mock.calls[0][0] as Request;
        expect(request.headers.get("x-amz-meta-user-id")).toBeNull();
        expect(request.headers.get("x-amz-meta-project-id")).toBeNull();
    });

    it("should sign only ACL with no Content-Type or metadata provided", async () => {
        // AWS provider defaults to acl: "private" when none is explicitly set
        const { config } = createUploadConfig()
            .provider("aws", baseProvider)
            .build();

        const result = await generatePresignedUploadUrl(config, { key: "test-minimal.txt" });

        // Only the default ACL — no Content-Type or metadata
        expect(result.requiredHeaders).toEqual({ "x-amz-acl": "private" });

        // sign() receives only the ACL
        const request = signMock.mock.calls[0][0] as Request;
        expect(request.headers.get("x-amz-acl")).toBe("private");
        expect(request.headers.get("Content-Type")).toBeNull();
    });

    it("router should include requiredHeaders in generatePresignedUrls response", async () => {
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
        expect(results[0].requiredHeaders).toBeDefined();
        expect(results[0].requiredHeaders?.["x-amz-acl"]).toBe("private");
        // Content-Type is in requiredHeaders but was NOT signed
        expect(results[0].requiredHeaders?.["Content-Type"]).toBe("image/jpeg");

        // sign() only received the ACL
        const request = signMock.mock.calls[0][0] as Request;
        expect(request.headers.get("x-amz-acl")).toBe("private");
        expect(request.headers.get("Content-Type")).toBeNull();
    });

    it("should skip x-amz-acl entirely for Cloudflare R2", async () => {
        const { config } = createUploadConfig()
            .provider("cloudflareR2", {
                ...baseProvider,
                accountId: "test-account",
                region: "auto",
            })
            .defaults({ acl: "public-read" })
            .build();

        const result = await generatePresignedUploadUrl(config, { key: "test.txt" });

        // No ACL in requiredHeaders for R2
        expect(result.requiredHeaders?.["x-amz-acl"]).toBeUndefined();

        // sign() received no ACL header
        const request = signMock.mock.calls[0][0] as Request;
        expect(request.headers.get("x-amz-acl")).toBeNull();
    });

    it("should skip x-amz-acl entirely for MinIO", async () => {
        const { config } = createUploadConfig()
            .provider("minio", {
                ...baseProvider,
                endpoint: "http://localhost:9000",
            })
            .defaults({ acl: "public-read" })
            .build();

        const result = await generatePresignedUploadUrl(config, { key: "test.txt" });

        expect(result.requiredHeaders?.["x-amz-acl"]).toBeUndefined();

        const request = signMock.mock.calls[0][0] as Request;
        expect(request.headers.get("x-amz-acl")).toBeNull();
    });
});
