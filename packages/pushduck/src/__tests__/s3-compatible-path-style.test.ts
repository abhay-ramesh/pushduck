/**
 * @fileoverview s3Compatible honours forcePathStyle.
 *
 * Virtual-hosted services (Backblaze B2, Wasabi) address a bucket by hostname,
 * and the docs tell their users to set `forcePathStyle: false`. The option was
 * not in s3Compatible's accepted list, so it was dropped with an "ignored
 * option" warning and every request went path-style regardless.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import {
  generatePresignedUploadUrl,
  resetS3Client,
} from "../core/storage/client";

const BASE = {
  endpoint: "https://s3.us-west-004.backblazeb2.com",
  bucket: "my-bucket",
  accessKeyId: "key",
  secretAccessKey: "secret",
};

async function uploadUrl(options: Record<string, unknown>) {
  const { config } = createUploadConfig()
    .provider("s3Compatible", { ...BASE, ...options } as never)
    .build();
  return new URL(
    (await generatePresignedUploadUrl(config, { key: "a.png" })).url
  );
}

beforeEach(() => resetS3Client());

describe("s3Compatible addressing", () => {
  it("puts the bucket in the hostname when forcePathStyle is false", async () => {
    const url = await uploadUrl({ forcePathStyle: false });

    expect(url.host).toBe("my-bucket.s3.us-west-004.backblazeb2.com");
    expect(url.pathname).toBe("/a.png");
  });

  it.each(["false", "true", 0, 1])(
    "rejects forcePathStyle: %o instead of guessing what it means",
    (value) => {
      // `forcePathStyle: process.env.S3_FORCE_PATH_STYLE` hands over the
      // string "false", which is truthy: it silently went path-style here and
      // would go path-style on AWS too, the opposite of what was written.
      expect(() =>
        createUploadConfig()
          .provider("s3Compatible", { ...BASE, forcePathStyle: value } as never)
          .build()
      ).toThrow(/forcePathStyle must be true or false/);
    }
  );

  it("stays path-style by default", async () => {
    const url = await uploadUrl({});

    expect(url.host).toBe("s3.us-west-004.backblazeb2.com");
    expect(url.pathname).toBe("/my-bucket/a.png");
  });
});
