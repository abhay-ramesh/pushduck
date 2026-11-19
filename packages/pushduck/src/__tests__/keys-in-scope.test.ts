/**
 * @fileoverview `storage.keys.inScope(key, prefix)`.
 *
 * Apps that let a client name a key to delete or download checked ownership
 * with `key.startsWith(`users/${id}`)`, which says user 1 owns user 10's files
 * and accepts `users/1/../2/x`. The check belongs beside the code that builds
 * keys, with the same normalisation.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { resetS3Client } from "../core/storage/client";
import { inScope } from "../core/storage/keys";
import { installFakeStorage, type FakeStorage } from "./fixtures/fake-storage";

describe("inScope", () => {
  it.each([
    ["users/1/a.png", "users/1"],
    ["users/1/deep/er/a.png", "users/1"],
    ["users/1/文档.pdf", "users/1"],
    // The prefix is normalised the way `.paths()` builds one from metadata.
    ["users/ada_lovelace/a.png", "users/ada lovelace"],
  ])("%s is inside %s", (key, prefix) => {
    expect(inScope(key, prefix)).toBe(true);
  });

  it.each([
    // Segment-aware: the bug a `startsWith` check has.
    ["users/10/a.png", "users/1"],
    ["users/1a.png", "users/1"],
    // The folder itself is not inside the folder.
    ["users/1", "users/1"],
    ["users/1/", "users/1"],
    // Traversal and anything else resolveKey refuses.
    ["users/1/../2/a.png", "users/1"],
    ["users/1/./a.png", "users/1"],
    ["users/1//a.png", "users/1"],
    ["/users/1/a.png", "users/1"],
    ["users/1/a.png?x=1", "users/1"],
    ["users/1/a\u202egnp.exe", "users/1"],
    // A key pushduck would not produce: an unsanitised segment.
    ["users/1/a b.png", "users/1"],
    // Case matters, as it does in S3.
    ["Users/1/a.png", "users/1"],
    // A prefix that cannot be resolved fails closed: an empty id must not
    // grant everything under `users`.
    ["users/1/a.png", ""],
    ["users/1/a.png", "users/"],
    ["users/1/a.png", "users/1/"],
    ["users/1/a.png", "../users/1"],
  ])("%s is not inside %j", (key, prefix) => {
    expect(inScope(key, prefix)).toBe(false);
  });
});

describe("storage.keys.inScope", () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = installFakeStorage({ bucket: "test-bucket" });
  });

  afterEach(() => {
    storage.restore();
    resetS3Client();
  });

  it("recognises the keys a route built for that owner, and only those", async () => {
    const owner = (userId: string) => `users/${userId}`;
    const { s3, storage: api } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "key",
        secretAccessKey: "secret",
      })
      .paths({ prefix: "uploads" })
      .build();

    const router = s3.createRouter({
      docs: s3
        .file()
        .middleware(async ({ metadata }) => ({ userId: String(metadata?.userId) }))
        .paths({ prefix: ({ metadata }) => owner(metadata.userId), name: "unique" }),
    });

    const response = await router.handler(
      new Request("http://localhost/api/upload?route=docs&action=presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "Q3 report.pdf", size: 10, type: "application/pdf" }],
          metadata: { userId: "1" },
        }),
      })
    );
    const { key } = (await response.json()).results[0];

    expect(api.keys.inScope(key, `uploads/${owner("1")}`)).toBe(true);
    expect(api.keys.inScope(key, `uploads/${owner("10")}`)).toBe(false);
    expect(api.keys.inScope(key, `uploads/${owner("")}`)).toBe(false);
  });
});
