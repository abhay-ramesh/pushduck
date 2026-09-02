/**
 * @fileoverview Provider config must not silently discard what it was given.
 *
 * `createProviderBuilder` copies only the keys listed in a provider's
 * `configKeys` and drops everything else without a word. That is how
 * `sessionToken` came to be declared on the AWS config, documented, read from
 * `AWS_SESSION_TOKEN`, and then lost before signing: it survived only because
 * someone happened to list it, and every S3-compatible provider that did not
 * list it lost it.
 *
 * The bug that produced is fixed, but the mechanism that produced it is not a
 * one-off. Any option a user passes that the spec does not enumerate — a
 * genuine typo, an option from a newer version, a key valid on a sibling
 * provider — vanishes with no error, no warning and no trace in the resolved
 * config. The failure surfaces much later as "why is this setting being
 * ignored", which is among the hardest questions to answer from the outside.
 *
 * Silently dropping input is the same shape as the two worst bugs found in this
 * codebase: the filename sanitiser that erased non-Latin names, and this. Both
 * succeeded while destroying what they were given.
 *
 * The resolution behaviour is deliberately unchanged — an unknown key is still
 * not copied — because copying arbitrary keys into a provider config would
 * defeat validation. What changes is that it is no longer silent.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createProvider } from "../core/providers/providers";

afterEach(() => {
  vi.restoreAllMocks();
});

const AWS_BASE = {
  bucket: "test-bucket",
  region: "us-east-1",
  accessKeyId: "key",
  secretAccessKey: "secret",
};

describe("dropped configuration keys are reported", () => {
  it("warns when an unrecognised option is discarded", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createProvider("aws", { ...AWS_BASE, definitelyNotAnOption: true } as never);

    expect(warn).toHaveBeenCalled();
    const message = warn.mock.calls.map((call) => String(call[0])).join(" ");
    expect(message).toContain("definitelyNotAnOption");
  });

  it("names the provider, so the message is actionable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createProvider("aws", { ...AWS_BASE, sessionTokn: "typo" } as never);

    const message = warn.mock.calls.map((call) => String(call[0])).join(" ");
    expect(message).toContain("aws");
    expect(message).toContain("sessionTokn");
  });

  it("catches a key that is valid on another provider", () => {
    // The realistic mistake: copying a config between providers. `accountId`
    // belongs to R2 and means nothing to AWS.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createProvider("aws", { ...AWS_BASE, accountId: "abc123" } as never);

    const message = warn.mock.calls.map((call) => String(call[0])).join(" ");
    expect(message).toContain("accountId");
  });
});

describe("legitimate configuration stays quiet", () => {
  it("says nothing for a correct AWS config", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createProvider("aws", AWS_BASE as never);

    expect(warn).not.toHaveBeenCalled();
  });

  it("says nothing about keys a provider computes rather than lists", () => {
    // MinIO's `useSSL` and `port` are absent from `configKeys` and produced by
    // the provider's own `customLogic`. Warning about them would train users
    // to ignore the warning, which is worse than not having one.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createProvider("minio", {
      endpoint: "localhost:9000",
      bucket: "b",
      accessKeyId: "k",
      secretAccessKey: "s",
      useSSL: false,
      port: 9000,
    } as never);

    expect(warn).not.toHaveBeenCalled();
  });

  it("says nothing about a session token, now that it is honoured", () => {
    // The regression guard for the bug that motivated this: if `sessionToken`
    // is ever dropped from a provider spec again, this fails loudly.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    for (const provider of ["aws", "minio", "digitalOceanSpaces", "cloudflareR2"]) {
      createProvider(provider as never, {
        bucket: "b",
        region: "us-east-1",
        accessKeyId: "k",
        secretAccessKey: "s",
        sessionToken: "tok",
        accountId: provider === "cloudflareR2" ? "acct" : undefined,
        endpoint: provider === "aws" ? undefined : "https://example.com",
      } as never);
    }

    const message = warn.mock.calls.map((call) => String(call[0])).join(" ");
    expect(message).not.toContain("sessionToken");
  });

  it("says nothing for an R2 config using accountId", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createProvider("cloudflareR2", {
      bucket: "b",
      accountId: "abc",
      accessKeyId: "k",
      secretAccessKey: "s",
    } as never);

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("resolution behaviour is unchanged", () => {
  it("still ignores the unknown key rather than copying it through", () => {
    // Copying arbitrary keys into a provider config would defeat validation.
    // The fix is to stop being silent, not to start trusting input.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const config = createProvider("aws", {
      ...AWS_BASE,
      notAnOption: "value",
    } as never) as unknown as Record<string, unknown>;

    expect(config.notAnOption).toBeUndefined();
    expect(config.bucket).toBe("test-bucket");
    expect(config.provider).toBe("aws");
  });

  it("still throws for an unknown provider", () => {
    expect(() => createProvider("nope" as never, {} as never)).toThrow(
      /unknown provider/i
    );
  });
});
