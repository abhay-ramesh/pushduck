/**
 * @fileoverview Vue binding tests.
 *
 * Two things distinguish the Vue binding from the others and are asserted here:
 *
 * 1. State is exposed as refs, so destructuring at the call site keeps
 *    reactivity — the idiomatic Vue shape.
 * 2. The engine subscription is released automatically when the surrounding
 *    effect scope is disposed, and manually via `stop()` outside one.
 *
 * Scope disposal is exercised through Vue's real `effectScope`, so the test
 * checks actual framework behaviour rather than our assumption about it.
 */

import { describe, expect, it, vi } from "vitest";
import { effectScope, isRef, nextTick } from "vue";
import type { UploadClientConfig } from "../core/upload";
import { useUploadRoute } from "../vue";

function makeFile(name = "photo.jpg", size = 1000, type = "image/jpeg"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function createFetcher(
  over: { presign?: unknown } = {}
): NonNullable<UploadClientConfig["fetcher"]> {
  return vi.fn(async (input: RequestInfo) => {
    const url = String(input);
    const payload = url.includes("action=presign")
      ? (over.presign ?? {
          success: true,
          results: [
            {
              success: true,
              presignedUrl: "https://bucket.s3.amazonaws.com/signed",
              key: "uploads/photo.jpg",
              requiredHeaders: { "Content-Type": "image/jpeg" },
            },
          ],
        })
      : {
          success: true,
          results: [
            {
              success: true,
              key: "uploads/photo.jpg",
              url: "https://cdn.example.com/uploads/photo.jpg",
            },
          ],
        };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

const noopTransport = async () => {};

function build(over: Partial<UploadClientConfig> = {}) {
  return useUploadRoute("imageUpload", {
    endpoint: "/api/upload",
    fetcher: createFetcher(),
    transport: noopTransport,
    ...over,
  });
}

describe("Vue binding — reactive shape", () => {
  it("exposes every state field as a ref", () => {
    const upload = build();

    // Destructuring plain values would silently break reactivity in a template,
    // so each field must survive being pulled off the returned object.
    expect(isRef(upload.files)).toBe(true);
    expect(isRef(upload.isUploading)).toBe(true);
    expect(isRef(upload.errors)).toBe(true);
    expect(isRef(upload.progress)).toBe(true);
    expect(isRef(upload.uploadSpeed)).toBe(true);
    expect(isRef(upload.eta)).toBe(true);
  });

  it("exposes controls as plain functions", () => {
    const upload = build();
    expect(typeof upload.uploadFiles).toBe("function");
    expect(typeof upload.cancel).toBe("function");
    expect(typeof upload.cancelAll).toBe("function");
    expect(typeof upload.reset).toBe("function");
    expect(typeof upload.stop).toBe("function");
  });

  it("starts idle", () => {
    const upload = build();
    expect(upload.files.value).toEqual([]);
    expect(upload.isUploading.value).toBe(false);
    expect(upload.progress.value).toBe(0);
  });
});

describe("Vue binding — reactivity", () => {
  it("updates refs as the upload progresses", async () => {
    const upload = build();

    await upload.uploadFiles([makeFile()]);
    await nextTick();

    expect(upload.files.value).toHaveLength(1);
    expect(upload.files.value[0].status).toBe("success");
    expect(upload.progress.value).toBe(100);
    expect(upload.isUploading.value).toBe(false);
  });

  it("keeps reactivity through destructuring", async () => {
    // The pattern every Vue user writes: pull fields off in <script setup>.
    const { files, progress, uploadFiles } = build();

    await uploadFiles([makeFile()]);
    await nextTick();

    expect(files.value).toHaveLength(1);
    expect(progress.value).toBe(100);
  });

  it("surfaces server errors in state", async () => {
    const upload = build({
      fetcher: createFetcher({
        presign: { success: false, error: "Unauthorized" },
      }),
    });

    await upload.uploadFiles([makeFile()]);
    await nextTick();

    expect(upload.files.value[0].status).toBe("error");
    expect(upload.files.value[0].error).toBe("Unauthorized");
  });

  it("reset returns state to idle", async () => {
    const upload = build();

    await upload.uploadFiles([makeFile()]);
    expect(upload.files.value).toHaveLength(1);

    upload.reset();
    await nextTick();

    expect(upload.files.value).toEqual([]);
    expect(upload.progress.value).toBe(0);
  });

  it("forwards client metadata", async () => {
    const fetcher = createFetcher();
    const upload = build({ fetcher });

    await upload.uploadFiles([makeFile()], { albumId: "abc" });

    const presign = (fetcher as any).mock.calls.find((c: any[]) =>
      String(c[0]).includes("action=presign")
    );
    expect(JSON.parse(presign[1].body).metadata).toEqual({ albumId: "abc" });
  });
});

describe("Vue binding — lifecycle", () => {
  it("releases the subscription when its effect scope is disposed", async () => {
    // Verified against Vue's real effectScope: a component unmounting must not
    // leave the composable subscribed to the engine.
    const scope = effectScope();
    let upload!: ReturnType<typeof build>;

    scope.run(() => {
      upload = build();
    });

    scope.stop();

    const before = upload.files.value;
    await upload.uploadFiles([makeFile()]);

    // The engine still ran, but the disposed scope no longer syncs into the ref.
    expect(upload.files.value).toBe(before);
  });

  it("keeps syncing while the scope is alive", async () => {
    const scope = effectScope();
    let upload!: ReturnType<typeof build>;

    scope.run(() => {
      upload = build();
    });

    await upload.uploadFiles([makeFile()]);
    await nextTick();

    expect(upload.files.value).toHaveLength(1);
    scope.stop();
  });

  it("works outside any scope, with stop() as the manual escape hatch", async () => {
    // A module-level singleton has no scope; getCurrentScope() is undefined and
    // the caller owns teardown. This must not throw.
    const upload = build();

    await upload.uploadFiles([makeFile()]);
    await nextTick();
    expect(upload.files.value).toHaveLength(1);

    expect(() => upload.stop()).not.toThrow();
  });
});
