/**
 * @fileoverview `customDomain` is normalised once, where configs are created.
 *
 * Public URLs are `${customDomain}/${key}`, so the value has to be an origin
 * (plus, optionally, a path prefix) with a scheme and no trailing slash. It
 * was used exactly as written: `cdn.example.com` — the form pushduck's own
 * examples showed — produced `cdn.example.com/key`, which a browser resolves
 * as a path relative to the current page. Apps stripped and re-added schemes
 * around it to compensate.
 */

import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import {
  createProvider,
  toStorageTarget,
  validateProviderConfig,
} from "../core/providers/providers";
import { createStorage } from "../core/storage/storage-api";

const KEYS = { accessKeyId: "key", secretAccessKey: "secret", bucket: "b" };

function publicUrl(customDomain: string, key = "avatars/a.png"): string {
  const { config } = createUploadConfig()
    .provider("cloudflareR2", { ...KEYS, accountId: "acct", customDomain })
    .build();
  return createStorage(config).download.url(key);
}

describe("customDomain", () => {
  it.each([
    // Bare host — the form the JSDoc examples used to show.
    ["cdn.example.com", "https://cdn.example.com/avatars/a.png"],
    ["https://cdn.example.com", "https://cdn.example.com/avatars/a.png"],
    // An explicit scheme is kept: local MinIO and dev CDNs serve plain http.
    ["http://localhost:9000", "http://localhost:9000/avatars/a.png"],
    ["https://cdn.example.com/", "https://cdn.example.com/avatars/a.png"],
    ["https://cdn.example.com//", "https://cdn.example.com/avatars/a.png"],
    // A path prefix is a CDN behaviour mapped onto the bucket; keys go below it.
    ["https://cdn.example.com/media/", "https://cdn.example.com/media/avatars/a.png"],
    ["  pub-123.r2.dev  ", "https://pub-123.r2.dev/avatars/a.png"],
  ])("%j makes public URLs like %s", (customDomain, expected) => {
    expect(publicUrl(customDomain)).toBe(expected);
  });

  it("is stored normalised, so every reader sees the same value", () => {
    const config = createProvider("aws", { ...KEYS, customDomain: "cdn.example.com/" });
    expect(config.customDomain).toBe("https://cdn.example.com");
    expect(toStorageTarget(config).customDomain).toBe("https://cdn.example.com");
  });

  it.each(["aws", "digitalOceanSpaces", "gcs"] as const)(
    "%s normalises it too",
    (provider) => {
      expect(
        createProvider(provider, { ...KEYS, customDomain: "cdn.example.com" })
          .customDomain
      ).toBe("https://cdn.example.com");
    }
  );

  it("leaves an omitted customDomain absent, so URLs fall back to the provider", () => {
    expect(publicUrl("")).toBe(
      "https://acct.r2.cloudflarestorage.com/b/avatars/a.png"
    );
  });

  it("a hand-written config must already be in normal form", () => {
    // `.provider(configObject)` skips createProvider; build() validates it.
    const handWritten = {
      ...createProvider("aws", KEYS),
      customDomain: "cdn.example.com/",
    };
    expect(validateProviderConfig(handWritten).errors).toEqual([
      'customDomain must include the scheme and no trailing slash: use "https://cdn.example.com" instead of "cdn.example.com/"',
    ]);
    expect(() =>
      createUploadConfig().provider(handWritten).build()
    ).toThrow(/customDomain must include the scheme/);
  });

  it.each([
    // `${base}/${key}` would put the key inside the query or fragment.
    ["https://cdn.example.com?v=1", /query string or fragment/],
    ["https://cdn.example.com/#top", /query string or fragment/],
    ["ftp://cdn.example.com", /http:\/\/ or https:\/\//],
    ["https://user:pw@cdn.example.com", /credentials/],
    ["https://cdn example.com", /not a valid URL/],
  ])("rejects %j", (customDomain, message) => {
    expect(() =>
      createProvider("aws", { ...KEYS, customDomain })
    ).toThrow(message);
  });
});
