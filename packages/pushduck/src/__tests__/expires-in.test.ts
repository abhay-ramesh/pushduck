/**
 * Tests for .expiresIn() route configuration
 *
 * Covers:
 * - .expiresIn() validation (invalid values throw at definition time)
 * - expiresIn is passed through to generatePresignedUploadUrl
 * - Default 3600 is used when not set
 * - Config is preserved through .middleware() chaining (regression)
 * - expiresIn is preserved when .middleware() is called after .expiresIn()
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { S3Route } from "../core/router/router-v2";
import * as client from "../core/storage/client";

// --- Helpers ---

function makeRequest() {
  return {
    headers: new Map(),
    method: "POST",
    url: "http://localhost:3000/api/upload",
  } as any;
}

function makeFiles(count = 1) {
  return Array.from({ length: count }, (_, i) => ({
    name: `file-${i}.txt`,
    size: 1000,
    type: "text/plain",
  }));
}

function makeS3() {
  return createUploadConfig()
    .provider("aws", {
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    })
    .build();
}

// --- Tests ---

describe(".expiresIn() — validation", () => {
  it("throws for zero", () => {
    const { s3 } = makeS3();
    expect(() => s3.file().expiresIn(0)).toThrow(
      "expiresIn must be between 1 and 604800"
    );
  });

  it("throws for negative values", () => {
    const { s3 } = makeS3();
    expect(() => s3.file().expiresIn(-1)).toThrow(
      "expiresIn must be between 1 and 604800"
    );
  });

  it("throws above AWS 7-day maximum (604800)", () => {
    const { s3 } = makeS3();
    expect(() => s3.file().expiresIn(604801)).toThrow(
      "expiresIn must be between 1 and 604800"
    );
  });

  it("accepts 1 (minimum)", () => {
    const { s3 } = makeS3();
    expect(() => s3.file().expiresIn(1)).not.toThrow();
  });

  it("accepts 604800 (7-day maximum)", () => {
    const { s3 } = makeS3();
    expect(() => s3.file().expiresIn(604800)).not.toThrow();
  });

  it("accepts typical values (300, 3600, 7200)", () => {
    const { s3 } = makeS3();
    expect(() => s3.file().expiresIn(300)).not.toThrow();
    expect(() => s3.file().expiresIn(3600)).not.toThrow();
    expect(() => s3.file().expiresIn(7200)).not.toThrow();
  });

  it("is stored in route config", () => {
    const { s3 } = makeS3();
    const route = s3.file().expiresIn(300);
    expect(route._getConfig().expiresIn).toBe(300);
  });

  it("returns an S3Route instance for chaining", () => {
    const { s3 } = makeS3();
    // s3.file() is a schema; .expiresIn() creates a new S3Route
    const route = s3.file().expiresIn(300);
    expect(route).toBeInstanceOf(S3Route);
    // further chaining works
    expect(() => route.middleware(async () => ({}))).not.toThrow();
  });
});

describe(".expiresIn() — passed to generatePresignedUploadUrl", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(client, "generatePresignedUploadUrl");
  });

  it("passes custom expiresIn to the presigned URL generator", async () => {
    const { s3 } = makeS3();
    const router = s3.createRouter({
      upload: s3.file().maxFileSize("10MB").expiresIn(300),
    });

    await router.generatePresignedUrls("upload", makeRequest(), makeFiles());

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][1]).toMatchObject({ expiresIn: 300 });
  });

  it("passes undefined (falls back to default 3600) when not set", async () => {
    const { s3 } = makeS3();
    const router = s3.createRouter({
      upload: s3.file().maxFileSize("10MB"),
    });

    await router.generatePresignedUrls("upload", makeRequest(), makeFiles());

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][1].expiresIn).toBeUndefined();
  });

  it("different routes use their own expiresIn independently", async () => {
    const { s3 } = makeS3();
    const router = s3.createRouter({
      fast: s3.file().maxFileSize("1MB").expiresIn(60),
      slow: s3.file().maxFileSize("500MB").expiresIn(7200),
    });

    await router.generatePresignedUrls("fast", makeRequest(), makeFiles());
    expect(spy.mock.calls[0][1]).toMatchObject({ expiresIn: 60 });

    spy.mockClear();

    await router.generatePresignedUrls("slow", makeRequest(), makeFiles());
    expect(spy.mock.calls[0][1]).toMatchObject({ expiresIn: 7200 });
  });
});

describe(".middleware() config preservation (regression)", () => {
  it("preserves expiresIn when .middleware() is called after .expiresIn()", () => {
    const { s3 } = makeS3();
    const route = s3
      .file()
      .expiresIn(300)
      .middleware(async () => ({ userId: "123" }));

    expect(route._getConfig().expiresIn).toBe(300);
  });

  it("preserves paths when .middleware() is called after .paths()", () => {
    const { s3 } = makeS3();
    const route = s3
      .file()
      .middleware(async () => ({}))
      .paths({ prefix: "uploads" })
      .middleware(async () => ({ userId: "123" }));

    expect(route._getConfig().paths?.prefix).toBe("uploads");
  });

  it("preserves onComplete when .middleware() is called after", () => {
    const { s3 } = makeS3();
    const hook = vi.fn();
    const route = s3
      .file()
      .onComplete(hook)
      .middleware(async () => ({ userId: "123" }));

    expect(route._getConfig().onComplete).toBe(hook);
  });

  it("preserves all config when multiple .middleware() calls are chained", () => {
    const { s3 } = makeS3();
    const hook = vi.fn();
    // expiresIn and onComplete start an S3Route; paths and further
    // middleware calls must also preserve the accumulated config
    const route = s3
      .file()
      .expiresIn(600)
      .onComplete(hook)
      .middleware(async () => ({ step: 1 }))
      .paths({ prefix: "docs" })
      .middleware(async ({ metadata }) => ({ ...metadata, step: 2 }));

    const config = route._getConfig();
    expect(config.expiresIn).toBe(600);
    expect(config.paths?.prefix).toBe("docs");
    expect(config.onComplete).toBe(hook);
    expect(config.middleware).toHaveLength(2);
  });

  it("works correctly when .expiresIn() is called after .middleware()", async () => {
    const spy = vi.spyOn(client, "generatePresignedUploadUrl");
    const { s3 } = makeS3();
    const router = s3.createRouter({
      upload: s3
        .file()
        .middleware(async () => ({ userId: "123" }))
        .expiresIn(900),
    });

    await router.generatePresignedUrls("upload", makeRequest(), makeFiles());

    expect(spy.mock.calls[0][1]).toMatchObject({ expiresIn: 900 });
    spy.mockRestore();
  });
});
