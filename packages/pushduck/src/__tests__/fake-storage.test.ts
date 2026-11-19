/**
 * @fileoverview The fake storage behaves like storage.
 *
 * Every completion test from here on relies on it, so it is held to the same
 * contract a provider is: what is PUT is what HEAD and GET report, missing is
 * a 404, and nothing escapes to the network.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import {
  generatePresignedUploadUrl,
  getFileInfo,
  resetS3Client,
} from "../core/storage/client";
import { installFakeStorage, type FakeStorage } from "./fixtures/fake-storage";

let storage: FakeStorage;

afterEach(() => {
  storage.restore();
  resetS3Client();
});

const { config } = createUploadConfig()
  .provider("aws", {
    bucket: "test-bucket",
    region: "us-east-1",
    accessKeyId: "key",
    secretAccessKey: "secret",
  })
  .build();

describe("fake storage", () => {
  it("stores what a presigned PUT sends, and HEAD reports it", async () => {
    storage = installFakeStorage({ bucket: "test-bucket" });
    const { url } = await generatePresignedUploadUrl(config, {
      key: "a/photo.jpg",
      contentType: "image/jpeg",
    });

    const put = await fetch(url, {
      method: "PUT",
      body: new Uint8Array(1234),
      headers: { "Content-Type": "image/jpeg" },
    });

    expect(put.status).toBe(200);
    const info = await getFileInfo(config, "a/photo.jpg");
    expect(info).toMatchObject({ size: 1234, contentType: "image/jpeg" });
  });

  it("answers 404 for a key nothing was written to", async () => {
    storage = installFakeStorage({ bucket: "test-bucket" });

    await expect(getFileInfo(config, "missing.jpg")).rejects.toThrow();
    expect(storage.requests.at(-1)).toMatchObject({ method: "HEAD", key: "missing.jpg" });
  });

  it("never reaches another host", async () => {
    storage = installFakeStorage({ bucket: "test-bucket" });

    const response = await fetch("https://example.com/anything");
    expect(response.status).toBe(501);
  });
});

describe("fake storage — multipart", () => {
  it("assembles parts in order into one object", async () => {
    storage = installFakeStorage({ bucket: "test-bucket" });
    const { createMultipartUpload, presignUploadPart, completeMultipartUpload } =
      await import("../core/storage/multipart");

    const { uploadId } = await createMultipartUpload(config, {
      key: "big.bin",
      contentType: "application/octet-stream",
    });
    const parts = [];
    for (const [partNumber, fill] of [[2, 2], [1, 1]] as const) {
      const url = await presignUploadPart(config, { key: "big.bin", uploadId, partNumber });
      const response = await fetch(url, { method: "PUT", body: new Uint8Array(3).fill(fill) });
      parts.push({ partNumber, etag: response.headers.get("etag")! });
    }
    await completeMultipartUpload(config, { key: "big.bin", uploadId, parts });

    expect([...storage.objects.get("big.bin")!.body]).toEqual([1, 1, 1, 2, 2, 2]);
  });
});
