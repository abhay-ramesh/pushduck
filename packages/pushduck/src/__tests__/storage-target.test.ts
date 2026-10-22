/**
 * @fileoverview What each provider resolves to.
 *
 * Every provider ends as a StorageTarget: where requests go, the region they
 * are signed with, how the bucket is addressed, and whether ACLs may be sent.
 * These are the only ways providers differ once configured, so they are pinned
 * here per provider — a change to any of them is a change to what goes over
 * the wire.
 */

import { describe, expect, it } from "vitest";
import {
  createProvider,
  PROVIDERS,
  toStorageTarget,
  validateProviderConfig,
} from "../core/providers/providers";

const KEYS = { accessKeyId: "key", secretAccessKey: "secret", bucket: "b" };

describe("storage targets", () => {
  it("AWS: no endpoint, region as given, path style as given, ACLs allowed", () => {
    const target = toStorageTarget(
      createProvider("aws", { ...KEYS, region: "eu-west-1" })
    );
    expect(target.endpoint).toBeUndefined();
    expect(target).toMatchObject({ region: "eu-west-1", supportsAcl: true });
    expect(target.forcePathStyle).toBeFalsy();

    expect(
      toStorageTarget(createProvider("aws", { ...KEYS, forcePathStyle: true }))
        .forcePathStyle
    ).toBe(true);
  });

  it("Cloudflare R2: endpoint from the account ID, signs as auto, path-style, no ACLs", () => {
    expect(
      toStorageTarget(createProvider("cloudflareR2", { ...KEYS, accountId: "acct" }))
    ).toMatchObject({
      endpoint: "https://acct.r2.cloudflarestorage.com",
      region: "auto",
      forcePathStyle: true,
      supportsAcl: false,
    });
  });

  it("DigitalOcean Spaces: endpoint from the region, virtual-hosted, ACLs allowed", () => {
    expect(
      toStorageTarget(
        createProvider("digitalOceanSpaces", { ...KEYS, region: "fra1" })
      )
    ).toMatchObject({
      endpoint: "https://fra1.digitaloceanspaces.com",
      region: "fra1",
      forcePathStyle: false,
      supportsAcl: true,
    });
  });

  it("MinIO: endpoint as given, path-style, no ACLs", () => {
    expect(
      toStorageTarget(
        createProvider("minio", { ...KEYS, endpoint: "http://localhost:9000" })
      )
    ).toMatchObject({
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      forcePathStyle: true,
      supportsAcl: false,
    });
  });

  it.each([
    // The documented default and the shape `mc alias` users write.
    [{ endpoint: "localhost:9000" }, "http://localhost:9000"],
    [{ endpoint: "minio.internal", port: 9010 }, "http://minio.internal:9010"],
    [{ endpoint: "minio.example.com", useSSL: true }, "https://minio.example.com"],
    // A full URL is used as written; useSSL and port do not second-guess it.
    [{ endpoint: "https://minio.example.com:9443", useSSL: false }, "https://minio.example.com:9443"],
    [{ endpoint: "http://127.0.0.1:9010/" }, "http://127.0.0.1:9010"],
  ])("MinIO: %o resolves to %s", (options, endpoint) => {
    const config = createProvider("minio", { ...KEYS, ...options });
    expect(toStorageTarget(config).endpoint).toBe(endpoint);
  });

  it("Neon: region read from the endpoint, path-style, no ACLs", () => {
    expect(
      toStorageTarget(
        createProvider("neonStorage", {
          ...KEYS,
          endpoint: "https://br-a.storage.c-1.eu-central-1.aws.neon.tech/",
        })
      )
    ).toMatchObject({
      endpoint: "https://br-a.storage.c-1.eu-central-1.aws.neon.tech",
      region: "eu-central-1",
      forcePathStyle: true,
      supportsAcl: false,
    });
  });

  it("S3-compatible: auto signs as us-east-1, path-style by default, ACLs allowed", () => {
    expect(
      toStorageTarget(
        createProvider("s3Compatible", {
          ...KEYS,
          endpoint: "https://storage.googleapis.com",
          region: "auto",
        })
      )
    ).toMatchObject({
      endpoint: "https://storage.googleapis.com",
      region: "us-east-1",
      forcePathStyle: true,
      supportsAcl: true,
    });
  });

  it("S3-compatible: honours forcePathStyle: false for virtual-hosted services", () => {
    // Backblaze B2 and others address buckets by hostname. The option was
    // dropped with an "unrecognised option" warning, so every request went
    // path-style regardless.
    const config = createProvider("s3Compatible", {
      ...KEYS,
      endpoint: "https://s3.us-west-004.backblazeb2.com",
      forcePathStyle: false,
    });

    expect(toStorageTarget(config).forcePathStyle).toBe(false);
  });

  it("carries a session token, and treats an empty one as absent", () => {
    expect(
      toStorageTarget(createProvider("aws", { ...KEYS, sessionToken: "tok" }))
        .sessionToken
    ).toBe("tok");
    expect(
      toStorageTarget(createProvider("aws", { ...KEYS, sessionToken: "" }))
        .sessionToken
    ).toBeUndefined();
  });
});

describe("the registry", () => {
  it("gives every provider a distinct id", () => {
    const ids = Object.values(PROVIDERS).map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reports an unregistered provider instead of passing it", () => {
    expect(
      validateProviderConfig({ provider: "gcs", bucket: "b" } as never).errors
    ).toEqual(["Unknown provider: gcs"]);
  });
});
