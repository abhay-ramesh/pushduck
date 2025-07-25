import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { S3ArraySchema } from "../core/schema";

describe("maxFiles Method", () => {
  it("should create array schema with max constraint", () => {
    const { s3 } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build();

    const schema = s3.image().maxFileSize("2MB").maxFiles(6);

    expect(schema._type).toBe("array");
    expect(schema).toBeInstanceOf(S3ArraySchema);
  });

  it("should validate maximum file count correctly", async () => {
    const { s3 } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build();

    const schema = s3.file().maxFiles(3);

    // Create mock files
    const createMockFile = (name: string) =>
      new File(["test"], name, { type: "text/plain" });

    const files = [
      createMockFile("file1.txt"),
      createMockFile("file2.txt"),
      createMockFile("file3.txt"),
    ];

    // Should pass with 3 files (max allowed)
    const result1 = await schema.validate(files);
    expect(result1.success).toBe(true);

    // Should fail with 4 files (exceeds max)
    const files4 = [...files, createMockFile("file4.txt")];
    const result2 = await schema.validate(files4);
    expect(result2.success).toBe(false);
    expect(result2.error?.code).toBe("ARRAY_TOO_LONG");
  });

  it("should work with image schemas", async () => {
    const { s3 } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build();

    const schema = s3.image().maxFileSize("1MB").maxFiles(2);

    // Create mock image files
    const createMockImage = (name: string) =>
      new File(["test"], name, { type: "image/jpeg" });

    const images = [
      createMockImage("image1.jpg"),
      createMockImage("image2.jpg"),
    ];

    const result = await schema.validate(images);
    expect(result.success).toBe(true);
  });

  it("should work in router configuration", () => {
    const { s3 } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build();

    const router = s3.createRouter({
      gallery: s3.image().maxFileSize("2MB").maxFiles(6),
      documents: s3.file().types(["application/pdf"]).maxFiles(5),
    });

    expect(router).toBeDefined();
    expect(router.getRouteNames()).toEqual(["gallery", "documents"]);
  });
});
