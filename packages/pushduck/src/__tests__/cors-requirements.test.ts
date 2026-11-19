/**
 * @fileoverview What bucket CORS must allow, and how each provider sets it.
 *
 * Browser uploads go straight to the bucket, so a bucket rule that misses the
 * page's origin, a header the client sends, or `ETag` breaks uploads with a
 * bare network error. `corsRequirements` is the one statement of what the
 * client sends; these tests pin it to the client's actual requests.
 */

import { describe, expect, it } from "vitest";
import {
  corsRequirements,
  corsRule,
  createProvider,
  objectApiUrl,
  PROVIDERS,
  toStorageTarget,
} from "../core/providers/providers";

const KEYS = { accessKeyId: "key", secretAccessKey: "secret", bucket: "b" };

describe("corsRequirements", () => {
  it("an upload PUT sends Content-Type and, where ACLs are signed in, x-amz-acl; it reads ETag", () => {
    expect(corsRequirements({ supportsAcl: true })).toEqual([
      {
        purpose: "upload",
        method: "PUT",
        headers: ["content-type", "x-amz-acl"],
        exposes: ["etag"],
      },
      { purpose: "download", method: "GET", headers: [], exposes: [] },
    ]);
  });

  it("does not ask for x-amz-acl on providers that never receive it", () => {
    expect(corsRequirements({ supportsAcl: false })[0].headers).toEqual([
      "content-type",
    ]);
  });
});

describe("corsRule", () => {
  it("allows exactly the required methods and headers, and exposes ETag", () => {
    expect(corsRule(["http://localhost:3000"], { supportsAcl: true })).toEqual({
      id: "pushduck",
      allowedOrigins: ["http://localhost:3000"],
      allowedMethods: ["PUT", "GET"],
      allowedHeaders: ["content-type", "x-amz-acl"],
      exposeHeaders: ["ETag"],
      maxAgeSeconds: 3600,
    });
  });
});

describe("provider CORS support", () => {
  it("every provider declares how its bucket CORS is managed", () => {
    for (const definition of Object.values(PROVIDERS)) {
      expect(["s3", "external"]).toContain(definition.cors.api);
    }
  });

  it("GCS: prints its own JSON (one responseHeader list) and the gcloud command", () => {
    const { cors } = PROVIDERS.gcs;
    if (cors.api !== "external") throw new Error("expected external");

    const text = cors.instructions(
      [corsRule(["https://app.example.com"], { supportsAcl: false })],
      "uploads"
    );

    expect(text).toContain(
      "gcloud storage buckets update gs://uploads --cors-file=cors.json"
    );
    const json = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    expect(json).toEqual([
      {
        origin: ["https://app.example.com"],
        method: ["PUT", "GET"],
        responseHeader: ["content-type", "ETag"],
        maxAgeSeconds: 3600,
      },
    ]);
  });

  it("MinIO: says CORS is server-wide and names the setting", () => {
    const { cors } = PROVIDERS.minio;
    if (cors.api !== "external") throw new Error("expected external");

    const text = cors.instructions(
      [corsRule(["http://localhost:3000", "https://app.example.com"], { supportsAcl: false })],
      "uploads"
    );

    expect(text).toContain("501 NotImplemented");
    expect(text).toContain(
      'MINIO_API_CORS_ALLOW_ORIGIN="http://localhost:3000,https://app.example.com"'
    );
  });

  it("R2: explains the token permission bucket CORS needs", () => {
    const { cors } = PROVIDERS.cloudflareR2;
    expect(cors).toMatchObject({ api: "s3" });
    expect(cors.api === "s3" && cors.permissionHint).toMatch(/Admin Read & Write/);
  });
});

describe("objectApiUrl", () => {
  it.each([
    ["aws", { region: "eu-west-1" }, "https://b.s3.eu-west-1.amazonaws.com/k.txt"],
    ["cloudflareR2", { accountId: "acct" }, "https://acct.r2.cloudflarestorage.com/b/k.txt"],
    ["digitalOceanSpaces", { region: "nyc3" }, "https://b.nyc3.digitaloceanspaces.com/k.txt"],
    ["minio", { endpoint: "localhost:9000" }, "http://localhost:9000/b/k.txt"],
  ] as const)("%s", (provider, options, expected) => {
    const target = toStorageTarget(
      createProvider(provider, { ...KEYS, ...options } as never)
    );
    expect(objectApiUrl(target, "k.txt")).toBe(expected);
  });

  it("percent-encodes each key segment, keeping / — a literal + would break signing", () => {
    const target = toStorageTarget(createProvider("minio", { ...KEYS, endpoint: "localhost:9000" }));
    expect(objectApiUrl(target, "a b/c+d(1).txt")).toBe(
      "http://localhost:9000/b/a%20b/c%2Bd%281%29.txt"
    );
  });
});
