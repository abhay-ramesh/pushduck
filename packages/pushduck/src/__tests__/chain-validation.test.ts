import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";

describe("Schema chaining — actual validation", () => {
  const buildS3 = () =>
    createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build().s3;

  // Helper: create a File with a specific size
  const makeFile = (name: string, type: string, sizeBytes: number) => {
    const f = new File([new ArrayBuffer(sizeBytes)], name, { type });
    // File constructor may not respect exact size, so override
    Object.defineProperty(f, "size", { value: sizeBytes });
    return f;
  };

  it("maxFileSize rejects files that are too large", async () => {
    const s3 = buildS3();
    const schema = s3.file().maxFileSize("1MB");

    const small = makeFile("ok.txt", "text/plain", 500_000);
    const big = makeFile("big.txt", "text/plain", 2_000_000);

    expect((await schema.validate(small)).success).toBe(true);
    expect((await schema.validate(big)).success).toBe(false);
    expect((await schema.validate(big)).error?.code).toBe("FILE_TOO_LARGE");
  });

  it("types rejects wrong MIME types", async () => {
    const s3 = buildS3();
    const schema = s3.file().types(["image/jpeg", "image/png"]);

    const jpeg = makeFile("photo.jpg", "image/jpeg", 100);
    const pdf = makeFile("doc.pdf", "application/pdf", 100);

    expect((await schema.validate(jpeg)).success).toBe(true);
    expect((await schema.validate(pdf)).success).toBe(false);
    expect((await schema.validate(pdf)).error?.code).toBe("INVALID_FILE_TYPE");
  });

  it("types wildcard image/* accepts any image", async () => {
    const s3 = buildS3();
    const schema = s3.file().types(["image/*"]);

    const webp = makeFile("photo.webp", "image/webp", 100);
    const mp4 = makeFile("video.mp4", "video/mp4", 100);

    expect((await schema.validate(webp)).success).toBe(true);
    expect((await schema.validate(mp4)).success).toBe(false);
  });

  it("chained maxFileSize + types both validate (any order)", async () => {
    const s3 = buildS3();

    // Order A: types first, maxFileSize second
    const schemaA = s3.file().types(["image/jpeg"]).maxFileSize("1MB");
    // Order B: maxFileSize first, types second
    const schemaB = s3.file().maxFileSize("1MB").types(["image/jpeg"]);

    const goodFile = makeFile("photo.jpg", "image/jpeg", 500_000);
    const wrongType = makeFile("doc.pdf", "application/pdf", 500_000);
    const tooLarge = makeFile("huge.jpg", "image/jpeg", 2_000_000);

    for (const schema of [schemaA, schemaB]) {
      expect((await schema.validate(goodFile)).success).toBe(true);
      expect((await schema.validate(wrongType)).success).toBe(false);
      expect((await schema.validate(tooLarge)).success).toBe(false);
    }
  });

  it("maxFiles + maxFileSize + types all chain (any order)", async () => {
    const s3 = buildS3();

    // The exact pattern from issue #190
    const schema = s3
      .file()
      .maxFiles(5)
      .maxFileSize("1MB")
      .types(["image/jpeg", "image/png"]);

    const goodFile = makeFile("photo.jpg", "image/jpeg", 500_000);
    const wrongType = makeFile("doc.pdf", "application/pdf", 500_000);
    const tooLarge = makeFile("huge.jpg", "image/jpeg", 2_000_000);

    expect((await schema.validate(goodFile)).success).toBe(true);
    expect((await schema.validate(wrongType)).error?.code).toBe("INVALID_FILE_TYPE");
    expect((await schema.validate(tooLarge)).error?.code).toBe("FILE_TOO_LARGE");
  });

  it("S3ImageSchema defaults reject non-images", async () => {
    const s3 = buildS3();
    const schema = s3.image().maxFileSize("5MB").maxFiles(3);

    const image = makeFile("photo.jpg", "image/jpeg", 100);
    const pdf = makeFile("doc.pdf", "application/pdf", 100);

    expect((await schema.validate(image)).success).toBe(true);
    expect((await schema.validate(pdf)).success).toBe(false);
  });

  it("S3ImageSchema.formats still works after maxFiles", async () => {
    const s3 = buildS3();
    const schema = s3.image().maxFiles(5).formats(["jpeg", "png"]);

    const jpeg = makeFile("photo.jpg", "image/jpeg", 100);
    const gif = makeFile("anim.gif", "image/gif", 100);

    expect((await schema.validate(jpeg)).success).toBe(true);
    expect((await schema.validate(gif)).success).toBe(false);
    expect((await schema.validate(gif)).error?.code).toBe("INVALID_FILE_TYPE");
  });
});
