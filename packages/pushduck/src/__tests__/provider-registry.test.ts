/**
 * @fileoverview Which provider names createProvider accepts.
 *
 * A provider name that is accepted must produce a config that can sign
 * requests. `gcs` used to be accepted and then threw "not S3-compatible" at
 * the first upload — the failure arrived far from the mistake. Google Cloud
 * Storage is reached through `s3Compatible` and an HMAC key instead.
 */

import { describe, expect, it } from "vitest";
import { createProvider } from "../core/providers/providers";

describe("provider names", () => {
  it("rejects gcs up front instead of failing at the first upload", () => {
    expect(() =>
      createProvider("gcs" as never, { bucket: "b" } as never)
    ).toThrow("Unknown provider type: gcs");
  });

  it("reaches Google Cloud Storage through s3Compatible", () => {
    const config = createProvider("s3Compatible", {
      endpoint: "https://storage.googleapis.com",
      bucket: "my-app-uploads",
      accessKeyId: "GOOGEXAMPLE",
      secretAccessKey: "secret",
      region: "auto",
    });

    expect(config).toMatchObject({
      provider: "s3-compatible",
      endpoint: "https://storage.googleapis.com",
      region: "auto",
    });
  });
});
