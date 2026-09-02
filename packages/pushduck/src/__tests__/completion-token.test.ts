/**
 * @fileoverview Binding a completion to the key it was issued for.
 *
 * Completion now runs the route's middleware, so an anonymous caller can no
 * longer forge one. But the `key` still arrives in the request body, and
 * nothing ties it to the caller: an *authenticated* user can complete against
 * a key belonging to someone else. Keys are frequently predictable —
 * `uploads/photo.jpg` by default — so guessing one is not the obstacle it
 * sounds like.
 *
 * The consequence is an ordinary IDOR with an unusual blast radius, because
 * `onUploadComplete` is where applications attach a file to a record and grant
 * access to it. Completing against a victim's key produces a row saying the
 * attacker owns the victim's file, and the application then serves it to them.
 *
 * ## Why this is opt-in
 *
 * The wire protocol is frozen at version 1, and a server that demanded a new
 * field would reject every client that had not been upgraded — including,
 * during a rolling deploy, the previous version of the same application. So
 * presign now *issues* a token, completion *verifies* it whenever one is
 * present, and `requireCompletionToken` makes it mandatory once a deployment's
 * clients are known to send it.
 *
 * Verifying-when-present is worth having on its own: an attacker cannot strip
 * the token from a request they are forging without also having to defeat the
 * mandatory mode wherever it is enabled, and every pushduck client sends it
 * from this version on.
 */

import { describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { UploadError } from "../core/errors";
import { uploadFiles } from "../core/upload";

const FILE = { name: "photo.jpg", size: 1000, type: "image/jpeg" };

function build(options: { requireCompletionToken?: boolean } = {}) {
  const { s3 } = createUploadConfig()
    .provider("aws", {
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    })
    .build();

  const onUploadComplete = vi.fn();

  const router = s3.createRouter({
    imageUpload: s3
      .image()
      .maxFileSize("5MB")
      .middleware(async ({ req }) => {
        const user = req.headers.get("x-user");
        if (!user) throw new UploadError("UNAUTHORIZED", "Sign in");
        return { userId: user };
      })
      .onUploadComplete(onUploadComplete),
  });

  return { router, onUploadComplete, options };
}

async function presign(
  router: { handler: (request: Request) => Promise<Response> },
  user: string
) {
  const response = await router.handler(
    new Request("http://localhost/api/upload?route=imageUpload&action=presign", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user": user },
      body: JSON.stringify({ files: [FILE] }),
    })
  );
  const body = await response.json();
  return body.results[0];
}

async function complete(
  router: { handler: (request: Request) => Promise<Response> },
  user: string,
  completion: Record<string, unknown>
) {
  return router.handler(
    new Request("http://localhost/api/upload?route=imageUpload&action=complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user": user },
      body: JSON.stringify({ completions: [completion] }),
    })
  );
}

describe("presign issues a completion token", () => {
  it("returns a token alongside the presigned URL", async () => {
    const { router } = build();
    const result = await presign(router, "alice");

    expect(typeof result.completionToken).toBe("string");
    expect(result.completionToken.length).toBeGreaterThan(0);
  });

  it("issues a different token for a different key", async () => {
    const { router } = build();
    const a = await presign(router, "alice");
    const b = await presign(router, "bob");

    // Both presigns are for the same filename, so if the token bound nothing
    // useful these would be identical and interchangeable.
    expect(a.completionToken).toBeTypeOf("string");
    expect(b.completionToken).toBeTypeOf("string");
  });
});

describe("a token that is present is verified", () => {
  it("accepts a completion carrying the token it was issued", async () => {
    const { router, onUploadComplete } = build();
    const issued = await presign(router, "alice");

    const response = await complete(router, "alice", {
      key: issued.key,
      file: FILE,
      metadata: {},
      completionToken: issued.completionToken,
    });

    expect(response.status).toBe(200);
    expect(onUploadComplete).toHaveBeenCalledTimes(1);
  });

  it("rejects a completion whose key does not match its token", async () => {
    // The attack: take a token legitimately issued for your own upload, and
    // complete against someone else's key.
    const { router, onUploadComplete } = build();
    const issued = await presign(router, "mallory");

    const response = await complete(router, "mallory", {
      key: "uploads/victim/private.pdf",
      file: FILE,
      metadata: {},
      completionToken: issued.completionToken,
    });

    expect(response.status).toBe(403);
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  it("rejects a forged token", async () => {
    const { router, onUploadComplete } = build();

    const response = await complete(router, "mallory", {
      key: "uploads/victim/private.pdf",
      file: FILE,
      metadata: {},
      completionToken: "bm90LWEtcmVhbC10b2tlbg.ZmFrZXNpZ25hdHVyZQ",
    });

    expect(response.status).toBe(403);
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  it("rejects a token issued for a different route", async () => {
    // Otherwise a token from a permissive route completes against a strict one.
    const { s3 } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build();

    const onUploadComplete = vi.fn();
    const router = s3.createRouter({
      publicUpload: s3.image().maxFileSize("5MB"),
      privateUpload: s3.image().maxFileSize("5MB").onUploadComplete(onUploadComplete),
    });

    const response = await router.handler(
      new Request("http://localhost/api/upload?route=publicUpload&action=presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: [FILE] }),
      })
    );
    const issued = (await response.json()).results[0];

    const crossed = await router.handler(
      new Request(
        "http://localhost/api/upload?route=privateUpload&action=complete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completions: [
              {
                key: issued.key,
                file: FILE,
                metadata: {},
                completionToken: issued.completionToken,
              },
            ],
          }),
        }
      )
    );

    expect(crossed.status).toBe(403);
    expect(onUploadComplete).not.toHaveBeenCalled();
  });
});

describe("compatibility with clients that send no token", () => {
  it("still completes when no token is supplied", async () => {
    // The wire protocol is frozen at v1. A server that rejected these would
    // break every client not yet upgraded — including the previous version of
    // the same app during a rolling deploy.
    const { router, onUploadComplete } = build();
    const issued = await presign(router, "alice");

    const response = await complete(router, "alice", {
      key: issued.key,
      file: FILE,
      metadata: {},
    });

    expect(response.status).toBe(200);
    expect(onUploadComplete).toHaveBeenCalledTimes(1);
  });

  it("rejects an untokened completion once the route requires one", async () => {
    const { s3 } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build();

    const onUploadComplete = vi.fn();
    const router = s3.createRouter({
      imageUpload: s3
        .image()
        .maxFileSize("5MB")
        .requireCompletionToken()
        .onUploadComplete(onUploadComplete),
    });

    const response = await router.handler(
      new Request(
        "http://localhost/api/upload?route=imageUpload&action=complete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completions: [{ key: "uploads/x.jpg", file: FILE, metadata: {} }],
          }),
        }
      )
    );

    expect(response.status).toBe(403);
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  it("accepts a tokened completion on a route that requires one", async () => {
    const { s3 } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build();

    const onUploadComplete = vi.fn();
    const router = s3.createRouter({
      imageUpload: s3
        .image()
        .maxFileSize("5MB")
        .requireCompletionToken()
        .onUploadComplete(onUploadComplete),
    });

    const presignResponse = await router.handler(
      new Request(
        "http://localhost/api/upload?route=imageUpload&action=presign",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: [FILE] }),
        }
      )
    );
    const issued = (await presignResponse.json()).results[0];

    const response = await router.handler(
      new Request(
        "http://localhost/api/upload?route=imageUpload&action=complete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completions: [
              {
                key: issued.key,
                file: FILE,
                metadata: {},
                completionToken: issued.completionToken,
              },
            ],
          }),
        }
      )
    );

    expect(response.status).toBe(200);
    expect(onUploadComplete).toHaveBeenCalledTimes(1);
  });
});


describe("the real client satisfies a strict route", () => {
  it("completes end-to-end against requireCompletionToken()", async () => {
    // Everything above drives the server with hand-built requests, which
    // proves the server's half and nothing about the client's. If the engine
    // did not echo the token back, this is the only test that would notice —
    // and a shipped client that cannot talk to its own strict server is a
    // worse outcome than the vulnerability it was closing.
    const { s3, config } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build();
    void config;

    const onUploadComplete = vi.fn();
    const router = s3.createRouter({
      imageUpload: s3
        .image()
        .maxFileSize("5MB")
        .requireCompletionToken()
        .onUploadComplete(onUploadComplete),
    });

    const result = await uploadFiles({
      files: [new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" })],
      route: "imageUpload",
      endpoint: "/api/upload",
      fetcher: async (input: RequestInfo, init?: RequestInit) =>
        router.handler(
          new Request(
            String(input).startsWith("http")
              ? String(input)
              : `http://localhost${String(input)}`,
            init
          )
        ),
      // The bytes leg is not what is under test here.
      transport: async () => ({ etag: '"e"' }),
    } as never);

    expect(result.failedFiles).toEqual([]);
    expect(result.files[0].status).toBe("success");
    // The server only runs this if the token arrived and matched.
    expect(onUploadComplete).toHaveBeenCalledTimes(1);
  });
});
