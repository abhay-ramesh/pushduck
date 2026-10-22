/**
 * @fileoverview Where MinIO requests go.
 *
 * MinIO is often configured the way `mc alias` and the docker images present
 * it — `localhost:9000`, or a host plus `useSSL` and `port` — rather than as a
 * URL. The default endpoint is exactly that shape, and the client used to
 * concatenate it straight into request URLs, so every request failed to
 * build; `useSSL` and `port` were accepted and then ignored.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { getProviderEndpoint } from "../core/providers/providers";
import {
  generatePresignedUploadUrl,
  resetS3Client,
} from "../core/storage/client";

const KEYS = { bucket: "b", accessKeyId: "key", secretAccessKey: "secret" };

function build(options: Record<string, unknown>) {
  return createUploadConfig()
    .provider("minio", { ...KEYS, ...options } as never)
    .build().config;
}

beforeEach(() => resetS3Client());

describe("MinIO endpoint", () => {
  it.each([
    [{ endpoint: "localhost:9000" }, "http://localhost:9000"],
    [{ endpoint: "minio.internal", port: 9010 }, "http://minio.internal:9010"],
    [{ endpoint: "minio.example.com", useSSL: true }, "https://minio.example.com"],
    // A full URL is used as written; useSSL and port do not second-guess it.
    [{ endpoint: "https://minio.example.com:9443", useSSL: false }, "https://minio.example.com:9443"],
    [{ endpoint: "http://127.0.0.1:9010/" }, "http://127.0.0.1:9010"],
  ])("%o sends requests to %s", async (options, origin) => {
    const config = build(options);
    const { url } = await generatePresignedUploadUrl(config, { key: "a.png" });

    expect(new URL(url).origin).toBe(origin);
    expect(new URL(url).pathname).toBe("/b/a.png");
    expect(getProviderEndpoint(config.provider)).toBe(origin);
  });
});
