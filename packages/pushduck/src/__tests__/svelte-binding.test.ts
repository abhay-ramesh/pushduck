/**
 * @fileoverview Svelte binding tests.
 *
 * The binding's whole job is to satisfy Svelte's store contract on top of the
 * engine's `subscribe`/`getSnapshot` pair. These tests assert that contract
 * precisely, because `$upload` in a component depends on every clause of it:
 *
 * - `subscribe(run)` calls `run` synchronously with the current value
 * - `run` is called again on every subsequent change
 * - the returned function unsubscribes
 *
 * Uses the real `svelte/store` `get()` helper as an independent check that a
 * genuine Svelte consumer can read the store, rather than trusting our own
 * reading of the spec.
 */

import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { createUploadRoute } from "../svelte";
import type { UploadClientConfig } from "../core/upload";

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

/** A transport that resolves immediately without touching the network. */
const noopTransport = async () => {};

describe("Svelte binding — store contract", () => {
  it("emits the current value synchronously on subscribe", () => {
    const upload = createUploadRoute("imageUpload");
    const values: unknown[] = [];

    upload.subscribe((v) => values.push(v));

    // The `$store` syntax renders before any upload begins, so a synchronous
    // first emission is mandatory, not a nicety.
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      files: [],
      isUploading: false,
      progress: 0,
    });
  });

  it("is readable by svelte/store's get()", () => {
    // An independent check against the real Svelte runtime rather than our
    // own interpretation of the contract.
    const upload = createUploadRoute("imageUpload");
    expect(get(upload)).toMatchObject({ files: [], isUploading: false });
  });

  it("returns a working unsubscribe function", async () => {
    const fetcher = createFetcher();
    const upload = createUploadRoute("imageUpload", {
      endpoint: "/api/upload",
      fetcher,
      transport: noopTransport,
    });

    const listener = vi.fn();
    const unsubscribe = upload.subscribe(listener);
    const afterInitial = listener.mock.calls.length;

    unsubscribe();
    await upload.uploadFiles([makeFile()]);

    expect(listener.mock.calls.length).toBe(afterInitial);
  });

  it("exposes the imperative controls alongside the store", () => {
    const upload = createUploadRoute("imageUpload");
    expect(typeof upload.uploadFiles).toBe("function");
    expect(typeof upload.cancel).toBe("function");
    expect(typeof upload.cancelAll).toBe("function");
    expect(typeof upload.reset).toBe("function");
    expect(typeof upload.subscribe).toBe("function");
  });
});

describe("Svelte binding — behaviour", () => {
  it("pushes every state change to subscribers", async () => {
    const fetcher = createFetcher();
    const upload = createUploadRoute("imageUpload", {
      endpoint: "/api/upload",
      fetcher,
      transport: noopTransport,
    });

    const seen: number[] = [];
    upload.subscribe((state) => seen.push(state.files.length));

    await upload.uploadFiles([makeFile()]);

    expect(seen[0]).toBe(0); // initial emission
    expect(seen[seen.length - 1]).toBe(1); // after upload
    expect(get(upload).files[0].status).toBe("success");
  });

  it("targets the configured route and endpoint", async () => {
    const fetcher = createFetcher();
    const upload = createUploadRoute("documentUpload", {
      endpoint: "/custom/upload",
      fetcher,
      transport: noopTransport,
    });

    await upload.uploadFiles([makeFile()]);

    expect(String((fetcher as any).mock.calls[0][0])).toContain(
      "/custom/upload?route=documentUpload&action=presign"
    );
  });

  it("surfaces server errors in store state", async () => {
    const fetcher = createFetcher({
      presign: { success: false, error: "Unauthorized" },
    });
    const upload = createUploadRoute("imageUpload", {
      endpoint: "/api/upload",
      fetcher,
    });

    await upload.uploadFiles([makeFile()]);

    expect(get(upload).files[0].status).toBe("error");
    expect(get(upload).files[0].error).toBe("Unauthorized");
  });

  it("reset clears state and notifies subscribers", async () => {
    const fetcher = createFetcher();
    const upload = createUploadRoute("imageUpload", {
      endpoint: "/api/upload",
      fetcher,
      transport: noopTransport,
    });

    await upload.uploadFiles([makeFile()]);
    expect(get(upload).files).toHaveLength(1);

    const listener = vi.fn();
    upload.subscribe(listener);
    listener.mockClear();

    upload.reset();

    expect(listener).toHaveBeenCalled();
    expect(get(upload).files).toEqual([]);
  });

  it("forwards client metadata", async () => {
    const fetcher = createFetcher();
    const upload = createUploadRoute("imageUpload", {
      endpoint: "/api/upload",
      fetcher,
      transport: noopTransport,
    });

    await upload.uploadFiles([makeFile()], { albumId: "abc" });

    const presign = (fetcher as any).mock.calls.find((c: any[]) =>
      String(c[0]).includes("action=presign")
    );
    expect(JSON.parse(presign[1].body).metadata).toEqual({ albumId: "abc" });
  });
});
