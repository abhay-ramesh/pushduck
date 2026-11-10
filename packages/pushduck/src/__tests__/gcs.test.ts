/**
 * @fileoverview Google Cloud Storage, through its S3-compatible XML API.
 *
 * The old `gcs` provider took a service account and threw "not S3-compatible"
 * at the first request. GCS does serve the S3 API — signed with an HMAC key —
 * and this provider is that path, with the settings a live run against a real
 * bucket needed:
 *
 * - endpoint `https://storage.googleapis.com`, path-style or virtual-hosted;
 * - region `"auto"` (signed as us-east-1) or the bucket's own location;
 * - **no `x-amz-acl`**: buckets with uniform bucket-level access, the default,
 *   reject it with "Cannot insert legacy ACL". `s3Compatible` sends the
 *   default `acl: "private"`, which is what made GCS fail there.
 *
 * Verified live (presigned PUT/GET, 3-part multipart, list/metadata/delete,
 * router presign → complete, CORS preflight) on 2026-11-10.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import {
  createProvider,
  toStorageTarget,
} from "../core/providers/providers";
import {
  generatePresignedUploadUrl,
  resetS3Client,
} from "../core/storage/client";

const HMAC = {
  accessKeyId: "GOOG1EXAMPLEEXAMPLEEXAMPLE",
  secretAccessKey: "secretsecretsecretsecretsecretsecret1234",
};

beforeEach(() => resetS3Client());

function build(options: Record<string, unknown> = {}) {
  return createUploadConfig()
    .provider("gcs", { bucket: "my-bucket", ...HMAC, ...options } as never)
    .build().config;
}

describe("gcs target", () => {
  it("defaults to the XML API, region auto, path-style, no ACLs", () => {
    expect(
      toStorageTarget(createProvider("gcs", { bucket: "b", ...HMAC }))
    ).toMatchObject({
      endpoint: "https://storage.googleapis.com",
      region: "us-east-1",
      forcePathStyle: true,
      supportsAcl: false,
    });
  });

  it("signs with the bucket's location when given one", () => {
    expect(
      toStorageTarget(
        createProvider("gcs", { bucket: "b", ...HMAC, region: "us-central1" })
      ).region
    ).toBe("us-central1");
  });
});

describe("gcs presigned upload", () => {
  it("never signs x-amz-acl, even with acl: 'private' configured", async () => {
    // The exact request uniform-access buckets rejected with a 400.
    const url = new URL(
      (await generatePresignedUploadUrl(build({ acl: "private" }), { key: "a.png" })).url
    );

    expect(url.host).toBe("storage.googleapis.com");
    expect(url.pathname).toBe("/my-bucket/a.png");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(
      /^GOOG1EXAMPLE.*\/us-east-1\/s3\/aws4_request$/
    );
  });

  it("addresses the bucket by hostname with forcePathStyle: false", async () => {
    const url = new URL(
      (await generatePresignedUploadUrl(build({ forcePathStyle: false }), { key: "a.png" })).url
    );

    expect(url.host).toBe("my-bucket.storage.googleapis.com");
    expect(url.pathname).toBe("/a.png");
  });
});

describe("gcs credentials", () => {
  it("asks for an HMAC key when a service-account config is passed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() =>
      createProvider("gcs", {
        bucket: "b",
        projectId: "p",
        keyFilename: "./key.json",
      } as never)
    ).toThrow(/needs an HMAC key .* not a service-account key/);

    // The old options are named as ignored, so the reason is visible.
    const message = warn.mock.calls.map((call) => String(call[0])).join(" ");
    expect(message).toContain("projectId");
    expect(message).toContain("keyFilename");
    warn.mockRestore();
  });
});
