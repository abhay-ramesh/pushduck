/**
 * @fileoverview Temporary credentials must survive into the signature.
 *
 * AWS's own guidance is to avoid long-lived IAM user keys and use temporary
 * credentials instead: an ECS task role, a Lambda execution role, EKS IRSA, a
 * GitHub Actions OIDC role, or a plain `sts:AssumeRole`. Every one of those
 * issues a *three*-part credential — access key id, secret, **and a session
 * token** — and SigV4 requires the third part to travel with the request as
 * `X-Amz-Security-Token`. Without it S3 rejects the signature outright.
 *
 * pushduck accepted `sessionToken` in provider config and read
 * `AWS_SESSION_TOKEN` from the environment, and then dropped it before signing.
 * So the deployment shape AWS recommends produced presigned URLs that always
 * 403, while static IAM user keys — the shape AWS discourages — worked fine.
 *
 * These tests assert on the *signed URL*, because that is the only place the
 * failure is visible before a real request. Config-level assertions would have
 * passed throughout the entire period the bug existed.
 */

import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { createStorage } from "../core/storage/storage-api";

const TEMP_SESSION_TOKEN =
  "IQoJb3JpZ2luX2VjEBYaCXVzLWVhc3QtMSJHMEUCIQDexampletokenvalue//////////wEQAxoM";

function buildStorage(
  provider: "aws" | "minio" | "digitalOceanSpaces" | "cloudflareR2",
  overrides: Record<string, unknown> = {}
) {
  const base = {
    bucket: "test-bucket",
    accessKeyId: "ASIAEXAMPLETEMPKEY",
    secretAccessKey: "test-secret",
    region: "us-east-1",
    ...overrides,
  };

  const endpoints: Record<string, Record<string, unknown>> = {
    aws: {},
    minio: { endpoint: "http://127.0.0.1:9010", useSSL: false },
    digitalOceanSpaces: { endpoint: "https://nyc3.digitaloceanspaces.com" },
    cloudflareR2: {
      endpoint: "https://acct.r2.cloudflarestorage.com",
      accountId: "acct",
    },
  };

  const { config } = createUploadConfig()
    .provider(provider as never, { ...base, ...endpoints[provider] } as never)
    .build();

  return createStorage(config);
}

describe("temporary credentials", () => {
  it("carries the session token into an upload URL", async () => {
    const storage = buildStorage("aws", { sessionToken: TEMP_SESSION_TOKEN });

    const url = new URL(
      (await storage.upload.presignedUrl({ key: "uploads/photo.jpg" })).url
    );

    // The whole point: SigV4 rejects a temporary credential presented without
    // its session token, so this parameter is the difference between a working
    // URL and a guaranteed 403.
    expect(url.searchParams.get("X-Amz-Security-Token")).toBe(
      TEMP_SESSION_TOKEN
    );
  });

  it("carries the session token into a download URL", async () => {
    const storage = buildStorage("aws", { sessionToken: TEMP_SESSION_TOKEN });

    const url = new URL(
      await storage.download.presignedUrl("uploads/photo.jpg", 3600)
    );

    expect(url.searchParams.get("X-Amz-Security-Token")).toBe(
      TEMP_SESSION_TOKEN
    );
  });

  it("still signs the token into the signature, not merely alongside it", async () => {
    // A token appended to the query but excluded from the canonical request
    // would look right here and still be rejected. Changing only the token
    // must change the signature.
    const withToken = new URL(
      (
        await buildStorage("aws", {
          sessionToken: TEMP_SESSION_TOKEN,
        }).upload.presignedUrl({ key: "uploads/photo.jpg" })
      ).url
    );

    const withOtherToken = new URL(
      (
        await buildStorage("aws", {
          sessionToken: `${TEMP_SESSION_TOKEN}DIFFERENT`,
        }).upload.presignedUrl({ key: "uploads/photo.jpg" })
      ).url
    );

    expect(withToken.searchParams.get("X-Amz-Signature")).not.toBe(
      withOtherToken.searchParams.get("X-Amz-Signature")
    );
  });

  it("omits the parameter entirely for permanent credentials", async () => {
    // An empty `X-Amz-Security-Token` is not the same as no token: S3 treats
    // the parameter as present and fails the signature.
    const url = new URL(
      (await buildStorage("aws").upload.presignedUrl({
        key: "uploads/photo.jpg",
      })).url
    );

    expect(url.searchParams.has("X-Amz-Security-Token")).toBe(false);
  });

  it("ignores an empty session token rather than signing a blank one", async () => {
    // `process.env.AWS_SESSION_TOKEN` is `""` on a machine that exported it and
    // then cleared it, which must behave as "no token".
    const url = new URL(
      (
        await buildStorage("aws", { sessionToken: "" }).upload.presignedUrl({
          key: "uploads/photo.jpg",
        })
      ).url
    );

    expect(url.searchParams.has("X-Amz-Security-Token")).toBe(false);
  });
});

describe("temporary credentials across S3-compatible providers", () => {
  // MinIO issues STS credentials via AssumeRoleWithWebIdentity, and Spaces and
  // R2 both have short-lived credential flows. A provider that silently drops
  // the token there fails the same way it did on AWS.
  it.each(["minio", "digitalOceanSpaces", "cloudflareR2"] as const)(
    "carries the session token on %s",
    async (provider) => {
      const storage = buildStorage(provider, {
        sessionToken: TEMP_SESSION_TOKEN,
      });

      const url = new URL(
        (await storage.upload.presignedUrl({ key: "uploads/photo.jpg" })).url
      );

      expect(url.searchParams.get("X-Amz-Security-Token")).toBe(
        TEMP_SESSION_TOKEN
      );
    }
  );
});
