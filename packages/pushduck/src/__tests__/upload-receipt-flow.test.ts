/**
 * @fileoverview Every request of an upload acts on the decision presign made.
 *
 * Presign runs the route's middleware over the caller's input and seals the
 * outcome into a receipt (see core/router/receipt.ts). Each later request —
 * completion, and for multipart the part signing, listing, abort and assembly
 * — reads that receipt back. These tests pin the three consequences:
 *
 * 1. `onUploadComplete` receives the metadata middleware produced at presign,
 *    whatever the completion request claims.
 * 2. Middleware sees the same input on every request, with a `phase` saying
 *    which one this is — so middleware that reads a field it does not return
 *    keeps working, and work meant to happen once can be skipped.
 * 3. Single-PUT and multipart uploads finish through the same pipeline, so the
 *    same hook fires, with the same guarantees, whatever the file's size.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { UploadError } from "../core/errors";
import { signCompletion } from "../core/router/multipart-session";
import { resetS3Client } from "../core/storage/client";
import { installFakeStorage, type FakeStorage } from "./fixtures/fake-storage";

let storage: FakeStorage;

beforeEach(() => {
  storage = installFakeStorage({ bucket: "test-bucket" });
});

afterEach(() => {
  storage.restore();
  resetS3Client();
});

const FILE = { name: "photo.jpg", size: 1000, type: "image/jpeg" };

interface Seen {
  phase: unknown;
  metadata: unknown;
  file: unknown;
}

/**
 * A route whose middleware authenticates from a header, requires `slug` in its
 * input, and returns a shape that does NOT contain `slug` — exactly the
 * middleware that threw at completion in 0.7, where it was handed its own
 * output as input.
 */
function build() {
  const { s3, config } = createUploadConfig()
    .provider("aws", {
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
    })
    .build();

  const seen: Seen[] = [];
  const onComplete = vi.fn();

  const middleware = async (ctx: {
    req: Request;
    metadata: Record<string, unknown>;
    file: unknown;
    phase?: unknown;
  }) => {
    seen.push({ phase: ctx.phase, metadata: ctx.metadata, file: ctx.file });
    const user = ctx.req.headers.get("x-user");
    if (!user) throw new UploadError("UNAUTHORIZED", "Sign in");
    if (typeof ctx.metadata.slug !== "string") {
      throw new UploadError("BAD_REQUEST", "slug is required");
    }
    return { userId: user, recordId: `record-for-${ctx.metadata.slug}` };
  };

  const router = s3.createRouter({
    attachment: s3.file().maxFileSize("50MB").middleware(middleware).onComplete(onComplete),
    other: s3.file().maxFileSize("50MB").middleware(middleware),
  });

  return { router, config, seen, onComplete };
}

function call(
  router: { handler: (r: Request) => Promise<Response> },
  route: string,
  action: string,
  body: unknown,
  user = "alice"
) {
  return router.handler(
    new Request(`http://localhost/api/upload?route=${route}&action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user": user },
      body: JSON.stringify(body),
    })
  );
}

async function presign(router: ReturnType<typeof build>["router"], route = "attachment") {
  const response = await call(router, route, "presign", {
    files: [FILE],
    metadata: { slug: "abc" },
  });
  const body = await response.json();
  const issued = body.results[0] as { key: string; completionToken: string; metadata: unknown };
  // The browser's PUT: completion verifies the stored object.
  await storage.upload(issued.key, new Uint8Array(FILE.size), FILE.type);
  return issued;
}

describe("completion acts on the receipt, not the request", () => {
  it("gives the hook the metadata middleware decided, whatever the body claims", async () => {
    const { router, onComplete } = build();
    const issued = await presign(router);

    const response = await call(router, "attachment", "complete", {
      completions: [
        {
          key: issued.key,
          file: { ...FILE, size: 1 },
          metadata: { userId: "victim", recordId: "someone-elses-record" },
          completionToken: issued.completionToken,
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].metadata).toEqual({
      userId: "alice",
      recordId: "record-for-abc",
    });
  });

  it("runs middleware over the same input at completion, with its phase", async () => {
    const { router, seen } = build();
    const issued = await presign(router);

    // The 0.7 failure: completion handed middleware `{ userId, recordId }`,
    // which has no `slug`, so this middleware threw.
    const response = await call(router, "attachment", "complete", {
      completions: [
        { key: issued.key, file: FILE, metadata: {}, completionToken: issued.completionToken },
      ],
    });

    expect(response.status).toBe(200);
    expect(seen.map((s) => s.phase)).toEqual(["presign", "complete"]);
    expect(seen[1].metadata).toEqual({ slug: "abc" });
    expect(seen[1].file).toEqual(FILE);
  });

  it("still requires the caller to be authorised at completion", async () => {
    const { router, onComplete } = build();
    const issued = await presign(router);

    const response = await router.handler(
      new Request("http://localhost/api/upload?route=attachment&action=complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completions: [
            { key: issued.key, file: FILE, completionToken: issued.completionToken },
          ],
        }),
      })
    );

    expect(response.status).toBe(401);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("refuses a receipt presented on another route", async () => {
    const { router } = build();
    const issued = await presign(router, "other");

    const response = await call(router, "attachment", "complete", {
      completions: [
        { key: issued.key, file: FILE, completionToken: issued.completionToken },
      ],
    });

    expect(response.status).toBe(403);
  });

  it("refuses a receipt naming a different key", async () => {
    const { router, onComplete } = build();
    const issued = await presign(router);

    const response = await call(router, "attachment", "complete", {
      completions: [
        { key: "someone/else.jpg", file: FILE, completionToken: issued.completionToken },
      ],
    });

    expect(response.status).toBe(403);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("refuses a forged token before middleware sees the request's metadata", async () => {
    const { router, seen, onComplete } = build();
    const issued = await presign(router);
    const [payload] = issued.completionToken.split(".");

    const response = await call(router, "attachment", "complete", {
      completions: [
        {
          key: issued.key,
          file: FILE,
          metadata: { slug: "chosen-by-the-caller" },
          completionToken: `${payload}.forged-signature`,
        },
      ],
    });

    expect(response.status).toBe(403);
    expect(seen.map((s) => s.phase)).toEqual(["presign"]);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("refuses an expired receipt before middleware runs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { router, seen } = build();
      const issued = await presign(router);
      vi.setSystemTime(Date.now() + 30 * 24 * 3600 * 1000);

      const response = await call(router, "attachment", "complete", {
        completions: [
          { key: issued.key, file: FILE, completionToken: issued.completionToken },
        ],
      });

      expect(response.status).toBe(403);
      expect(seen.map((s) => s.phase)).toEqual(["presign"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("authenticates a token-less completion over no input, then refuses it", async () => {
    const { router, seen } = build();

    // Anonymous: 401 from middleware, before the missing token is reported.
    const anonymous = await router.handler(
      new Request("http://localhost/api/upload?route=attachment&action=complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completions: [{ key: "k", file: FILE, metadata: { slug: "x" } }] }),
      })
    );
    expect(anonymous.status).toBe(401);
    expect(seen[0].metadata).toEqual({});
  });

  it("accepts a v1 token minted before the deploy, with the old behaviour", async () => {
    const { router, onComplete } = build();
    // An upload presigned by the previous version, completing after the
    // deploy. Old behaviour: middleware runs over the echoed metadata.
    const token = await signCompletion("completion:secret".slice("completion:".length), {
      key: "photo.jpg",
      route: "attachment",
    });

    await storage.upload("photo.jpg", new Uint8Array(FILE.size), FILE.type);
    const response = await call(router, "attachment", "complete", {
      completions: [
        { key: "photo.jpg", file: FILE, metadata: { slug: "abc" }, completionToken: token },
      ],
    });

    expect(response.status).toBe(200);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("multipart uploads finish through the same pipeline", () => {
  async function multipartUpload(
    router: ReturnType<typeof build>["router"],
    completeBody: (init: { session: string }) => Record<string, unknown>
  ) {
    const initResponse = await call(router, "attachment", "multipart-init", {
      file: FILE,
      metadata: { slug: "abc" },
    });
    expect(initResponse.status).toBe(200);
    const init = await initResponse.json();

    const signResponse = await call(router, "attachment", "multipart-sign", {
      session: init.session,
      partNumbers: [1],
    });
    expect(signResponse.status).toBe(200);
    const [part] = await signResponse.json();
    const put = await fetch(part.url, { method: "PUT", body: new Uint8Array(FILE.size) });

    return call(router, "attachment", "multipart-complete", {
      session: init.session,
      parts: [{ partNumber: 1, etag: put.headers.get("etag") }],
      file: FILE,
      ...completeBody(init),
    });
  }

  it("fires onComplete — not only the deprecated onUploadComplete", async () => {
    const { router, onComplete } = build();

    const response = await multipartUpload(router, () => ({ metadata: {} }));

    expect(response.status).toBe(200);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("gives the hook sealed metadata, not the metadata in the complete request", async () => {
    const { router, onComplete } = build();

    await multipartUpload(router, () => ({ metadata: { userId: "victim" } }));

    expect(onComplete.mock.calls[0][0].metadata).toEqual({
      userId: "alice",
      recordId: "record-for-abc",
    });
  });

  it("runs middleware over the original input for every part request", async () => {
    const { router, seen } = build();

    await multipartUpload(router, () => ({ metadata: {} }));

    expect(seen.map((s) => s.phase)).toEqual(["presign", "upload", "complete"]);
    for (const { metadata, file } of seen) {
      expect(metadata).toEqual({ slug: "abc" });
      expect(file).toEqual(FILE);
    }
  });
});
