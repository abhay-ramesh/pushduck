/**
 * @fileoverview Cross-implementation agreement with the Go server.
 *
 * The conformance suite proves both implementations obey the protocol. It does
 * not prove they are *interchangeable*, because it matches signatures and keys
 * by shape — it has to, since those legitimately vary between implementations
 * with different credentials or key generators.
 *
 * But two things must match exactly for a client to presign against one server
 * and complete against the other, which is the normal outcome of a blue-green
 * deploy or a load balancer in front of both:
 *
 * 1. The SigV4 signature, for identical credentials, key and instant.
 * 2. The object key produced from a given filename.
 *
 * The expected values here are produced by
 * `packages/pushduck-go/pushduck/interop_test.go`. If either side changes, one
 * of these fails instead of the difference surfacing as a 403 in production.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { createStorage } from "../core/storage/storage-api";
import { generateFileKey } from "../core/storage/client";

/** The instant the Go test pins; a signature is scoped to its date. */
const FIXED_TIME = new Date("2026-08-11T12:00:00Z");

const { config } = createUploadConfig()
  .provider("aws", {
    bucket: "conformance-bucket",
    region: "us-east-1",
    accessKeyId: "conformance-key",
    secretAccessKey: "conformance-secret",
  })
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SigV4 agreement", () => {
  it("produces the signature the Go implementation produces", async () => {
    // Written out rather than compared at runtime: a test that ran both
    // implementations would need Go installed, and this has to fail in a
    // JavaScript-only CI job too.
    const storage = createStorage(config);
    const result = await storage.upload.presignedUrl({
      key: "photo.jpg",
      expiresIn: 3600,
    });

    const url = new URL(result.url);

    expect(url.searchParams.get("X-Amz-Signature")).toBe(
      "d5055c164579cc08189f3efa518d271da39979487ca8b8cb49e219349b85ab78"
    );
  });

  it("agrees on the credential scope and signed headers", async () => {
    // These are the inputs to the signature, so a mismatch here explains a
    // signature mismatch above rather than leaving it a mystery.
    const storage = createStorage(config);
    const result = await storage.upload.presignedUrl({
      key: "photo.jpg",
      expiresIn: 3600,
    });

    const url = new URL(result.url);

    expect(url.searchParams.get("X-Amz-Credential")).toBe(
      "conformance-key/20260811/us-east-1/s3/aws4_request"
    );
    expect(url.searchParams.get("X-Amz-Date")).toBe("20260811T120000Z");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host;x-amz-acl");
    expect(url.host).toBe("conformance-bucket.s3.us-east-1.amazonaws.com");
  });
});

describe("object key agreement", () => {
  // Mirrors `TestKeyGenerationMatchesTypeScript`. A key that differs between
  // implementations means the same upload lands in two different places.
  it.each([
    ["photo.jpg", "photo.jpg"],
    ["my photo.jpg", "my_photo.jpg"],
    ["file(1).pdf", "file_1_.pdf"],
    ["a,b.csv", "a_b.csv"],
    ["report-2024.final.pdf", "report-2024.final.pdf"],
    ["UPPER_case-99.TXT", "UPPER_case-99.TXT"],
    ["文档.pdf", "文档.pdf"],
    ["写真.pdf", "写真.pdf"],
    ["Отчёт.pdf", "Отчёт.pdf"],
    ["café.txt", "café.txt"],
    [".gitignore", ".gitignore"],
  ])("maps %s to %s in both implementations", (input, expected) => {
    expect(generateFileKey(config, { originalName: input })).toBe(expected);
  });
});
