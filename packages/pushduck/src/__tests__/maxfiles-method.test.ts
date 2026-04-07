import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";

describe("maxFiles Method", () => {
  const buildS3 = () =>
    createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build().s3;

  it("should return a file schema, not an array schema", () => {
    const s3 = buildS3();
    const schema = s3.image().maxFileSize("2MB").maxFiles(6);

    // maxFiles is a constraint — the type doesn't change
    expect(schema._type).toBe("file");
  });

  it("should allow chaining in any order (issue #190)", () => {
    const s3 = buildS3();

    // This is the exact pattern from issue #190 that was broken
    const schema = s3
      .file()
      .maxFiles(5)
      .maxFileSize("30MB")
      .types(["image/avif", "image/jpeg", "image/png", "image/webp"]);

    expect(schema._type).toBe("file");
  });

  it("should validate individual files against type constraints after maxFiles", async () => {
    const s3 = buildS3();
    const schema = s3.file().maxFiles(3).types(["image/jpeg"]);

    // Should reject wrong file type
    const wrongType = new File(["test"], "doc.pdf", { type: "application/pdf" });
    const result = await schema.validate(wrongType);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_FILE_TYPE");

    // Should accept correct type
    const correctType = new File(["test"], "photo.jpg", { type: "image/jpeg" });
    const result2 = await schema.validate(correctType);
    expect(result2.success).toBe(true);
  });

  it("should preserve image schema type through maxFiles chain", () => {
    const s3 = buildS3();
    const schema = s3.image().maxFileSize("1MB").maxFiles(2);

    expect(schema._type).toBe("file");
  });

  it("should work in router configuration", () => {
    const s3 = buildS3();

    const router = s3.createRouter({
      gallery: s3.image().maxFileSize("2MB").maxFiles(6),
      documents: s3.file().types(["application/pdf"]).maxFiles(5),
    });

    expect(router).toBeDefined();
    expect(router.getRouteNames()).toEqual(["gallery", "documents"]);
  });
});
