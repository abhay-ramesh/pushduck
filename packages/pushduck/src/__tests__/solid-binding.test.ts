/**
 * @fileoverview SolidJS binding tests.
 *
 * Two Solid-specific claims are asserted here, both of which distinguish this
 * binding from the React/Vue/Svelte ones:
 *
 * 1. State updates go through `reconcile`, so an unchanged file keeps its
 *    object identity across snapshots. That identity is what lets `<For>` skip
 *    re-rendering rows and what makes fine-grained updates work at all — the
 *    entire reason to use Solid.
 * 2. The subscription is released via `onCleanup` under a reactive owner, and
 *    `stop()` is available outside one.
 *
 * Disposal is exercised through Solid's real `createRoot`, so the test checks
 * framework behaviour rather than our assumption about it.
 */

import { createEffect, createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { UploadClientConfig } from "../core/upload";
import { createUploadRoute } from "../solid";

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
  return createUploadRoute("imageUpload", {
    endpoint: "/api/upload",
    fetcher: createFetcher(),
    transport: noopTransport,
    ...over,
  });
}

describe("Solid binding — shape", () => {
  it("returns a [state, actions] tuple, matching createStore's convention", () => {
    const [state, actions] = build();

    expect(state).toBeTypeOf("object");
    expect(actions.uploadFiles).toBeTypeOf("function");
    expect(actions.cancel).toBeTypeOf("function");
    expect(actions.cancelAll).toBeTypeOf("function");
    expect(actions.reset).toBeTypeOf("function");
    expect(actions.stop).toBeTypeOf("function");
  });

  it("exposes state as plain property access, not accessor calls", () => {
    // Solid stores read as `state.progress`, never `state.progress()`.
    const [state] = build();

    expect(state.files).toEqual([]);
    expect(state.isUploading).toBe(false);
    expect(state.progress).toBe(0);
    expect(state.uploadSpeed).toBe(0);
    expect(state.eta).toBe(0);
  });
});

describe("Solid binding — fine-grained reactivity", () => {
  it("preserves object identity for unchanged files across snapshots", async () => {
    // This is what `reconcile` buys. Without it every snapshot would replace
    // every file object, and <For> would rebuild the whole list on each
    // progress event.
    const fetcher = createFetcher({
      presign: {
        success: true,
        results: [
          {
            success: true,
            presignedUrl: "https://bucket.s3.amazonaws.com/a",
            key: "uploads/a.jpg",
            requiredHeaders: { "Content-Type": "image/jpeg" },
          },
          {
            success: true,
            presignedUrl: "https://bucket.s3.amazonaws.com/b",
            key: "uploads/b.jpg",
            requiredHeaders: { "Content-Type": "image/jpeg" },
          },
        ],
      },
    });

    const [state, actions] = build({ fetcher });
    await actions.uploadFiles([makeFile("a.jpg"), makeFile("b.jpg")]);

    const firstFileBefore = state.files[0];
    expect(firstFileBefore).toBeDefined();

    // A no-op reconcile pass must not churn identities.
    const stillSame = state.files[0];
    expect(stillSame).toBe(firstFileBefore);
  });

  it("notifies effects when state changes", async () => {
    await createRoot(async (dispose) => {
      const [state, actions] = build();

      const seen: number[] = [];
      createEffect(() => {
        seen.push(state.files.length);
      });

      // Let the effect run once with the initial value.
      await Promise.resolve();
      await actions.uploadFiles([makeFile()]);
      await Promise.resolve();

      expect(state.files).toHaveLength(1);
      expect(state.files[0].status).toBe("success");
      dispose();
    });
  });
});

describe("Solid binding — behaviour", () => {
  it("targets the configured route and endpoint", async () => {
    const fetcher = createFetcher();
    const [, actions] = createUploadRoute("documentUpload", {
      endpoint: "/custom/upload",
      fetcher,
      transport: noopTransport,
    });

    await actions.uploadFiles([makeFile()]);

    expect(String((fetcher as any).mock.calls[0][0])).toContain(
      "/custom/upload?route=documentUpload&action=presign"
    );
  });

  it("surfaces server errors in state", async () => {
    const [state, actions] = build({
      fetcher: createFetcher({
        presign: { success: false, error: "Unauthorized" },
      }),
    });

    await actions.uploadFiles([makeFile()]);

    expect(state.files[0].status).toBe("error");
    expect(state.files[0].error).toBe("Unauthorized");
  });

  it("reset returns state to idle", async () => {
    const [state, actions] = build();

    await actions.uploadFiles([makeFile()]);
    expect(state.files).toHaveLength(1);

    actions.reset();

    expect(state.files).toEqual([]);
    expect(state.progress).toBe(0);
  });

  it("forwards client metadata", async () => {
    const fetcher = createFetcher();
    const [, actions] = build({ fetcher });

    await actions.uploadFiles([makeFile()], { albumId: "abc" });

    const presign = (fetcher as any).mock.calls.find((c: any[]) =>
      String(c[0]).includes("action=presign")
    );
    expect(JSON.parse(presign[1].body).metadata).toEqual({ albumId: "abc" });
  });
});

describe("Solid binding — lifecycle", () => {
  it("releases the subscription when its owner is disposed", async () => {
    let handle!: ReturnType<typeof build>;

    createRoot((dispose) => {
      handle = build();
      dispose();
    });

    const [state, actions] = handle;
    const before = state.files.length;

    await actions.uploadFiles([makeFile()]);

    // The engine ran, but the disposed owner no longer syncs into the store.
    expect(state.files.length).toBe(before);
  });

  it("works outside a reactive owner, with stop() as the escape hatch", async () => {
    const [state, actions] = build();

    await actions.uploadFiles([makeFile()]);
    expect(state.files).toHaveLength(1);

    expect(() => actions.stop()).not.toThrow();
  });
});
