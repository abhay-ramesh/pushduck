/**
 * @fileoverview Completion accepts what was stored, not what was claimed.
 *
 * A presigned PUT does not bind the bytes that arrive to the size declared at
 * presign, and the browser chooses the Content-Type it sends. So a route's
 * `maxFileSize` and accepted types, enforced at presign against the client's
 * declaration, are only a promise until completion checks the object itself.
 * These tests pin that check: completion HEADs the key, refuses an upload that
 * never arrived, deletes and refuses one that breaks the route's rules, and
 * hands the hook the observed size and type.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
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

function build() {
  const { s3 } = createUploadConfig()
    .provider("aws", {
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
    })
    .build();

  const onComplete = vi.fn();
  const onError = vi.fn();

  const router = s3.createRouter({
    avatar: s3
      .image()
      .maxFileSize("2KB")
      .middleware(async () => ({ userId: "alice" }))
      .onComplete(onComplete)
      .onError(onError),
  });

  return { router, onComplete, onError };
}

function call(router: ReturnType<typeof build>["router"], action: string, body: unknown) {
  return router.handler(
    new Request(`http://localhost/api/upload?route=avatar&action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

/** Presigns `declared`, PUTs `bytes` with `contentType`, then completes. */
async function upload(
  router: ReturnType<typeof build>["router"],
  options: {
    declared: { name: string; size: number; type: string };
    bytes?: number;
    contentType?: string;
    skipPut?: boolean;
  }
) {
  const presigned = await (
    await call(router, "presign", { files: [options.declared] })
  ).json();
  const issued = presigned.results[0];
  expect(issued.success).toBe(true);

  if (!options.skipPut) {
    await fetch(issued.presignedUrl, {
      method: "PUT",
      body: new Uint8Array(options.bytes ?? options.declared.size),
      headers: {
        ...issued.requiredHeaders,
        "Content-Type": options.contentType ?? options.declared.type,
      },
    });
  }

  const response = await call(router, "complete", {
    completions: [
      {
        key: issued.key,
        file: options.declared,
        completionToken: issued.completionToken,
      },
    ],
  });
  return { response, body: await response.json(), key: issued.key as string };
}

const PHOTO = { name: "me.jpg", size: 1000, type: "image/jpeg" };

describe("completion verifies the stored object", () => {
  it("gives the hook the size and type that were stored", async () => {
    const { router, onComplete } = build();

    const { body } = await upload(router, { declared: PHOTO, bytes: 1500 });

    expect(body.results[0].success).toBe(true);
    const ctx = onComplete.mock.calls[0][0];
    expect(ctx.file).toEqual({ name: "me.jpg", size: 1500, type: "image/jpeg" });
    expect(ctx.object).toMatchObject({ size: 1500, contentType: "image/jpeg" });
    expect(ctx.object.etag).toMatch(/^[0-9a-f]+$/);
  });

  it("refuses a completion for an upload that never arrived", async () => {
    const { router, onComplete, onError } = build();

    const { body } = await upload(router, { declared: PHOTO, skipPut: true });

    expect(body.results[0]).toMatchObject({ success: false, code: "NOT_FOUND" });
    expect(body.results[0].error).toMatch(/no object/i);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("deletes and refuses an object larger than the route allows", async () => {
    const { router, onComplete } = build();

    // Declared within the 2KB limit, so presign agreed; then 5KB arrived.
    const { body, key } = await upload(router, { declared: PHOTO, bytes: 5000 });

    expect(body.results[0]).toMatchObject({ success: false, code: "VALIDATION_FAILED" });
    expect(onComplete).not.toHaveBeenCalled();
    expect(storage.objects.has(key)).toBe(false);
  });

  it("deletes and refuses an object stored with a type the route does not accept", async () => {
    const { router, onComplete } = build();

    const { body, key } = await upload(router, {
      declared: PHOTO,
      contentType: "text/html",
    });

    expect(body.results[0]).toMatchObject({ success: false });
    expect(onComplete).not.toHaveBeenCalled();
    expect(storage.objects.has(key)).toBe(false);
  });

  it("returns the observed file to the client too", async () => {
    const { router } = build();

    const { body } = await upload(router, { declared: PHOTO, bytes: 1200 });

    expect(body.results[0].file).toEqual({ name: "me.jpg", size: 1200, type: "image/jpeg" });
  });
});
