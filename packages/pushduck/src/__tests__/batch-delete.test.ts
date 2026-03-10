/**
 * Tests for S3 batch delete operations and MD5 calculation
 */

import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type DeleteFilesResult,
  deleteFiles,
  deleteFilesByPrefix,
  resetS3Client,
} from "../core/storage/client";

// --- Helpers ---

function makeMockConfig(overrides = {}) {
  return {
    provider: {
      provider: "aws" as const,
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      region: "us-east-1",
      bucket: "test-bucket",
      ...overrides,
    },
  };
}

function md5Base64(content: string): string {
  return createHash("md5").update(content).digest("base64");
}

function makeDeleteXml(keys: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Delete>
  ${keys.map((key) => `<Object><Key>${key}</Key></Object>`).join("")}
</Delete>`;
}

function makeSuccessXml(keys: string[]): string {
  return `<DeleteResult>${keys.map((k) => `<Deleted><Key>${k}</Key></Deleted>`).join("")}</DeleteResult>`;
}

function makeErrorXml(
  errors: { key: string; code: string; message: string }[]
): string {
  return `<DeleteResult>${errors.map((e) => `<Error><Key>${e.key}</Key><Code>${e.code}</Code><Message>${e.message}</Message></Error>`).join("")}</DeleteResult>`;
}

// --- Mocks ---

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: vi.fn().mockImplementation(function () {
    return { fetch: mockFetch };
  }),
}));

vi.mock("../core/config/upload-config", () => ({
  getUploadConfig: () => makeMockConfig(),
}));

// --- Tests ---

describe("calculateMD5", () => {
  it("produces correct base64 MD5 for known input", () => {
    // echo -n "hello" | md5sum → 5d41402abc4b2a76b9719d911017c592
    // base64 of that hex = XUFAKrxLKna5cZ2REBfFkg==
    const expected = md5Base64("hello");
    expect(expected).toBe("XUFAKrxLKna5cZ2REBfFkg==");
  });

  it("produces different hashes for different inputs", () => {
    expect(md5Base64("foo")).not.toBe(md5Base64("bar"));
  });

  it("is deterministic", () => {
    const xml = makeDeleteXml(["uploads/a.jpg", "uploads/b.png"]);
    expect(md5Base64(xml)).toBe(md5Base64(xml));
  });
});

describe("deleteFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetS3Client();
  });

  it("returns empty result immediately when given no keys", async () => {
    const result = await deleteFiles(makeMockConfig() as any, []);
    expect(result).toEqual({ deleted: [], errors: [] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends a POST to the correct S3 batch delete URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => makeSuccessXml(["uploads/file.jpg"]),
    });

    await deleteFiles(makeMockConfig() as any, ["uploads/file.jpg"]);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://test-bucket.s3.amazonaws.com/?delete");
    expect(options.method).toBe("POST");
  });

  it("sets Content-Type to application/xml", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => makeSuccessXml(["file.jpg"]),
    });

    await deleteFiles(makeMockConfig() as any, ["file.jpg"]);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers["Content-Type"]).toBe("application/xml");
  });

  it("sets Content-MD5 header matching the XML body", async () => {
    const keys = ["uploads/a.jpg", "uploads/b.png"];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => makeSuccessXml(keys),
    });

    await deleteFiles(makeMockConfig() as any, keys);

    const [, options] = mockFetch.mock.calls[0];
    const expectedMD5 = md5Base64(options.body as string);
    expect(options.headers["Content-MD5"]).toBe(expectedMD5);
  });

  it("returns deleted keys from successful response", async () => {
    const keys = ["uploads/a.jpg", "uploads/b.png"];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => makeSuccessXml(keys),
    });

    const result = await deleteFiles(makeMockConfig() as any, keys);

    expect(result.deleted).toEqual(keys);
    expect(result.errors).toEqual([]);
  });

  it("returns errors from partial failure response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<DeleteResult>
          <Deleted><Key>uploads/a.jpg</Key></Deleted>
          <Error><Key>uploads/b.png</Key><Code>AccessDenied</Code><Message>Access Denied</Message></Error>
        </DeleteResult>`,
    });

    const result = await deleteFiles(makeMockConfig() as any, [
      "uploads/a.jpg",
      "uploads/b.png",
    ]);

    expect(result.deleted).toEqual(["uploads/a.jpg"]);
    expect(result.errors).toEqual([
      {
        key: "uploads/b.png",
        code: "AccessDenied",
        message: "Access Denied",
      },
    ]);
  });

  it("throws when S3 returns a non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => "",
    });

    await expect(
      deleteFiles(makeMockConfig() as any, ["uploads/file.jpg"])
    ).rejects.toThrow("Failed to delete files");
  });

  it("splits keys into batches of 1000", async () => {
    const keys = Array.from({ length: 1500 }, (_, i) => `file-${i}.jpg`);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => makeSuccessXml(keys.slice(0, 1000)),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => makeSuccessXml(keys.slice(1000)),
      });

    const result = await deleteFiles(makeMockConfig() as any, keys);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.deleted).toHaveLength(1500);
  });

  it("uses custom endpoint when provided (minio)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => makeSuccessXml(["file.jpg"]),
    });

    const config = {
      provider: {
        provider: "minio" as const,
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        region: "us-east-1",
        bucket: "test-bucket",
        endpoint: "https://my-minio.example.com",
      },
    };

    await deleteFiles(config as any, ["file.jpg"]);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://my-minio.example.com/test-bucket/?delete");
  });
});

describe("deleteFilesByPrefix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetS3Client();
  });

  it("returns zero counts when no files match prefix", async () => {
    // listFiles calls awsClient.fetch with a GET, mock an empty list response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>`,
    });

    const result = await deleteFilesByPrefix(makeMockConfig() as any, "temp/");

    expect(result.filesFound).toBe(0);
    expect(result.deleted).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("returns what would be deleted in dry run without calling delete", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<?xml version="1.0"?><ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents><Key>temp/a.jpg</Key><Size>100</Size><LastModified>2024-01-01T00:00:00Z</LastModified><ETag>"abc"</ETag></Contents>
          <Contents><Key>temp/b.png</Key><Size>200</Size><LastModified>2024-01-01T00:00:00Z</LastModified><ETag>"def"</ETag></Contents>
        </ListBucketResult>`,
    });

    const result = await deleteFilesByPrefix(makeMockConfig() as any, "temp/", {
      dryRun: true,
    });

    expect(result.filesFound).toBe(2);
    expect(result.deleted).toEqual(["temp/a.jpg", "temp/b.png"]);
    expect(result.dryRun).toBe(true);
    // Only the list call — no delete call
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});
