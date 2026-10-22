/**
 * @fileoverview What signs completion and multipart session tokens.
 *
 * The tokens are HMACs keyed with the provider's secret access key — a value
 * only the server holds. They used to fall back to the *access key ID* when
 * no secret was present. The access key ID is public: it appears in the
 * `X-Amz-Credential` parameter of every presigned URL the server hands out.
 * A token keyed with it can be minted by anyone who has seen one upload URL,
 * which turns the completion token's IDOR protection into a formality.
 *
 * The fallback existed for the gcs provider, which carries no secret — and
 * which never worked: it throws at the first signed request. Every working
 * provider requires a secret. In practice a forged token was then stopped one
 * step later, because presigning the download URL also needs the secret — but
 * that was luck, not design. With no secret, signing and verifying must fail
 * loudly rather than quietly downgrade.
 */

import { describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { signCompletion } from "../core/router/multipart-session";

const ACCESS_KEY_ID = "AKIAPUBLICEXAMPLE";

function build(secretAccessKey: string) {
  const { s3, config } = createUploadConfig()
    .provider("aws", {
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: "server-only-secret",
    })
    .build();

  // A config the builder would refuse, as a hand-assembled or mutated config
  // can still produce. Only the token path is under test.
  (config.provider as { secretAccessKey: string }).secretAccessKey =
    secretAccessKey;

  const onUploadComplete = vi.fn();
  const router = s3.createRouter({
    imageUpload: s3.image().maxFileSize("5MB").onUploadComplete(onUploadComplete),
  });
  return { router, onUploadComplete };
}

function post(
  router: { handler: (request: Request) => Promise<Response> },
  action: string,
  body: unknown
) {
  return router.handler(
    new Request(`http://localhost/api/upload?route=imageUpload&action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("token signing secret", () => {
  it("issues a completion token when the secret is present", async () => {
    const { router } = build("server-only-secret");
    const response = await post(router, "presign", {
      files: [{ name: "photo.jpg", size: 1000, type: "image/jpeg" }],
    });
    const body = await response.json();

    expect(body.results[0].completionToken).toEqual(expect.any(String));
  });

  it("rejects a completion token minted with the public access key ID", async () => {
    // Everything an attacker needs: the access key ID from any presigned URL.
    const forged = await signCompletion(ACCESS_KEY_ID, {
      key: "uploads/victim/private.pdf",
      route: "imageUpload",
    });

    const { router, onUploadComplete } = build("");
    const res = await post(router, "complete", {
      completions: [
        {
          key: "uploads/victim/private.pdf",
          file: { name: "private.pdf", size: 1000, type: "image/jpeg" },
          metadata: {},
          completionToken: forged,
        },
      ],
    });

    // Refused at the token check, as a configuration error — not accepted and
    // then failing later for an unrelated reason.
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "CONFIG_INVALID" });
    expect(onUploadComplete).not.toHaveBeenCalled();
  });
});
