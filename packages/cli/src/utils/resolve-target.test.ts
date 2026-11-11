/**
 * @fileoverview The CLI reaches buckets exactly where the server does.
 *
 * `init` and `test` used to build their own S3 client from a switch on the
 * provider name, and that copy drifted from the library:
 *
 * - with the region variable unset, AWS, Spaces and Neon passed `region:
 *   undefined` and the SDK failed with "Region is missing" before sending
 *   anything;
 * - MinIO's endpoint was always prefixed with `http://`, so a full URL became
 *   `http://http://…`;
 * - Neon signed with whatever region was given, not the one in its endpoint.
 *
 * resolveTarget answers from the library's provider definitions instead.
 */

import { describe, expect, it } from "vitest";
import { resolveTarget } from "./provider-setup";

const KEYS = { accessKeyId: "key", secretAccessKey: "secret", bucket: "b" };

describe("resolveTarget", () => {
  it.each([
    ["aws", "us-east-1"],
    ["digitalocean", "nyc3"],
  ] as const)("%s with no region uses the provider's default (%s)", (provider, region) => {
    expect(resolveTarget({ ...KEYS }, provider).region).toBe(region);
  });

  it("neon with no region reads it from the branch endpoint", () => {
    const target = resolveTarget(
      { ...KEYS, endpoint: "https://br-a.storage.c-1.eu-central-1.aws.neon.tech" },
      "neon"
    );

    expect(target).toMatchObject({ region: "eu-central-1", forcePathStyle: true });
  });

  it.each([
    ["localhost:9000", "http://localhost:9000"],
    ["http://127.0.0.1:9010", "http://127.0.0.1:9010"],
    ["https://minio.example.com", "https://minio.example.com"],
  ])("minio endpoint %s resolves to %s", (endpoint, expected) => {
    expect(resolveTarget({ ...KEYS, endpoint }, "minio")).toMatchObject({
      endpoint: expected,
      forcePathStyle: true,
    });
  });

  it("cloudflare-r2 builds its endpoint from the account ID and signs as auto", () => {
    expect(resolveTarget({ ...KEYS, accountId: "acct", region: "auto" }, "cloudflare-r2")).toMatchObject({
      endpoint: "https://acct.r2.cloudflarestorage.com",
      region: "auto",
      forcePathStyle: true,
    });
  });

  it("gcs addresses the XML API", () => {
    expect(resolveTarget({ ...KEYS, region: "us-central1" }, "gcs")).toMatchObject({
      endpoint: "https://storage.googleapis.com",
      region: "us-central1",
    });
  });

  it("says what is missing instead of failing inside the SDK", () => {
    expect(() => resolveTarget({ bucket: "b" }, "aws")).toThrow(
      /AWS Access Key ID is required/
    );
  });
});

describe("testConnection sends what resolveTarget resolved", () => {
  it("minio: path-style HEAD to the resolved endpoint, signed for its region", async () => {
    const { createServer } = await import("node:http");
    const { testConnection } = await import("./provider-setup");

    const seen: { method?: string; url?: string; auth?: string } = {};
    const server = createServer((req, res) => {
      seen.method = req.method;
      seen.url = req.url;
      seen.auth = req.headers.authorization;
      res.writeHead(200).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    try {
      // Scheme-less, the way `mc alias` shows it — the old code produced
      // http://http://… for a full URL and could not take this form at all.
      const ok = await testConnection(
        { ...KEYS, region: "", endpoint: `127.0.0.1:${port}` },
        "minio"
      );

      expect(ok).toBe(true);
      expect(seen.method).toBe("HEAD");
      expect(seen.url).toMatch(/^\/b\/?$/); // path-style: the bucket is in the path
      expect(seen.auth).toContain("/us-east-1/s3/aws4_request");
    } finally {
      server.close();
    }
  });
});
