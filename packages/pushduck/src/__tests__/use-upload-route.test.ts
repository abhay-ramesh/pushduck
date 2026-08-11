// @vitest-environment happy-dom

/**
 * @fileoverview React binding tests for `useUploadRoute`.
 *
 * These assert that rebuilding the hook on top of the framework-agnostic engine
 * preserved its public contract exactly, and that the binding honours the two
 * constraints `useSyncExternalStore` imposes:
 *
 * 1. `getSnapshot` must be referentially stable, or React re-renders forever.
 * 2. Callbacks whose identity changes every render must not tear down the
 *    engine, or in-flight uploads would be discarded on each parent render.
 *
 * React is the most demanding consumer of the engine. If it is satisfied here,
 * the Vue, Svelte, and Solid bindings rest on proven ground.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useUploadRoute } from "../hooks/use-upload-route";
import type { UploadRouteConfig } from "../types";

// ========================================
// Helpers
// ========================================

function makeFile(name = "photo.jpg", size = 1000, type = "image/jpeg"): File {
  return new File([new Uint8Array(size)], name, { type });
}

/** A fetcher answering presign and complete with successful fixtures. */
function createFetcher(
  over: { presign?: unknown; complete?: unknown } = {}
): NonNullable<UploadRouteConfig["fetcher"]> {
  return vi.fn(async (input: RequestInfo, _init?: RequestInit) => {
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
      : (over.complete ?? {
          success: true,
          results: [
            {
              success: true,
              key: "uploads/photo.jpg",
              url: "https://cdn.example.com/uploads/photo.jpg",
            },
          ],
        });

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

/**
 * Stubs `XMLHttpRequest` with a minimal double that reports progress and
 * succeeds, so the default transport can be exercised without a network.
 */
function stubXhr() {
  const instances: any[] = [];

  class FakeXhr {
    status = 200;
    upload: { onprogress?: (e: any) => void } = {};
    onload?: () => void;
    onerror?: () => void;
    onabort?: () => void;
    headers: Record<string, string> = {};

    constructor() {
      instances.push(this);
    }
    open() {}
    setRequestHeader(key: string, value: string) {
      this.headers[key] = value;
    }
    getResponseHeader(name: string): string | null {
      // Multipart needs the ETag from each part's response; the single-PUT
      // path ignores it. Returning one keeps the double faithful to a real
      // XMLHttpRequest either way.
      return name.toLowerCase() === "etag" ? '"fake-etag"' : null;
    }
    abort() {
      this.onabort?.();
    }
    send() {
      queueMicrotask(() => {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: 1000,
          total: 1000,
        });
        this.onload?.();
      });
    }
  }

  vi.stubGlobal("XMLHttpRequest", FakeXhr as unknown as typeof XMLHttpRequest);
  return instances;
}

// ========================================
// Public contract
// ========================================

describe("useUploadRoute — public contract", () => {
  it("returns the documented shape", () => {
    const { result } = renderHook(() => useUploadRoute("imageUpload"));

    expect(Object.keys(result.current).sort()).toEqual(
      [
        "cancel",
        "cancelAll",
        "errors",
        "eta",
        "files",
        "isUploading",
        "progress",
        "reset",
        "uploadFiles",
        "uploadFilesAsync",
        "uploadSpeed",
      ].sort()
    );
  });

  it("uploadFilesAsync resolves with results while state stays live", async () => {
    // The differentiator: promise semantics for useMutation AND reactive
    // per-file state from the same upload, without tracking files by hand.
    stubXhr();
    const fetcher = createFetcher();

    const { result } = renderHook(() =>
      useUploadRoute("imageUpload", { endpoint: "/api/upload", fetcher })
    );

    let resolved!: Awaited<ReturnType<typeof result.current.uploadFilesAsync>>;
    await act(async () => {
      resolved = await result.current.uploadFilesAsync([makeFile()]);
    });

    // Promise gave us the results...
    expect(resolved.files).toHaveLength(1);
    expect(resolved.files[0].status).toBe("success");
    expect(resolved.failedFiles).toEqual([]);

    // ...and the hook's reactive state reflects the same upload.
    expect(result.current.files).toHaveLength(1);
    expect(result.current.progress).toBe(100);
  });

  it("uploadFilesAsync rejects so useMutation's onError can fire", async () => {
    const fetcher = createFetcher({
      presign: { success: false, error: "Unauthorized" },
    });

    const { result } = renderHook(() =>
      useUploadRoute("imageUpload", { endpoint: "/api/upload", fetcher })
    );

    await act(async () => {
      await expect(
        result.current.uploadFilesAsync([makeFile()])
      ).rejects.toThrow("Unauthorized");
    });
  });

  it("exposes cancellation, at parity with the Vue, Svelte and Solid bindings", () => {
    // Every binding wraps the same engine, so a capability present in one must
    // be present in all — otherwise "same API, framework-native shape" is false.
    const { result } = renderHook(() => useUploadRoute("imageUpload"));

    expect(result.current.cancel).toBeTypeOf("function");
    expect(result.current.cancelAll).toBeTypeOf("function");
    expect(() => result.current.cancel("unknown-id")).not.toThrow();
  });

  it("starts idle with empty collections", () => {
    const { result } = renderHook(() => useUploadRoute("imageUpload"));

    expect(result.current.files).toEqual([]);
    expect(result.current.errors).toEqual([]);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.uploadSpeed).toBe(0);
    expect(result.current.eta).toBe(0);
  });

  it("keeps `reset` and `uploadFiles` identities stable across re-renders", () => {
    const { result, rerender } = renderHook(() =>
      useUploadRoute("imageUpload")
    );

    const first = {
      reset: result.current.reset,
      uploadFiles: result.current.uploadFiles,
    };

    rerender();

    expect(result.current.reset).toBe(first.reset);
    expect(result.current.uploadFiles).toBe(first.uploadFiles);
  });
});

// ========================================
// useSyncExternalStore constraints
// ========================================

describe("useUploadRoute — external store constraints", () => {
  it("does not re-render on its own when nothing changes", () => {
    // A getSnapshot that returns a fresh object each call makes React loop
    // forever here. Bounded render count is the assertion.
    let renderCount = 0;
    const { rerender } = renderHook(() => {
      renderCount++;
      return useUploadRoute("imageUpload");
    });

    const afterMount = renderCount;
    rerender();

    expect(renderCount).toBe(afterMount + 1);
  });

  it("survives callbacks with a fresh identity on every render", async () => {
    // Inline arrow callbacks change identity each render. If they were engine
    // dependencies, the engine would be rebuilt and in-flight state discarded.
    stubXhr();
    const fetcher = createFetcher();
    const onSuccess = vi.fn();

    const { result, rerender } = renderHook(() =>
      useUploadRoute("imageUpload", {
        endpoint: "/api/upload",
        fetcher,
        // deliberately new function identities each render
        onProgress: (p) => void p,
        onSuccess,
      })
    );

    const uploadFiles = result.current.uploadFiles;
    rerender();
    rerender();

    // Identity survived the re-renders, so the engine was not rebuilt.
    expect(result.current.uploadFiles).toBe(uploadFiles);

    await act(async () => {
      await result.current.uploadFiles([makeFile()]);
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it("routes callbacks to the latest render's closure", async () => {
    stubXhr();
    const fetcher = createFetcher();
    const first = vi.fn();
    const second = vi.fn();

    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) =>
        useUploadRoute("imageUpload", {
          endpoint: "/api/upload",
          fetcher,
          onSuccess: cb,
        }),
      { initialProps: { cb: first } }
    );

    rerender({ cb: second });

    await act(async () => {
      await result.current.uploadFiles([makeFile()]);
    });

    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});

// ========================================
// Upload behaviour through the binding
// ========================================

describe("useUploadRoute — upload behaviour", () => {
  it("drives a full upload and surfaces the final state", async () => {
    stubXhr();
    const fetcher = createFetcher();

    const { result } = renderHook(() =>
      useUploadRoute("imageUpload", { endpoint: "/api/upload", fetcher })
    );

    await act(async () => {
      await result.current.uploadFiles([makeFile()]);
    });

    await waitFor(() => {
      expect(result.current.files).toHaveLength(1);
    });

    expect(result.current.files[0].status).toBe("success");
    expect(result.current.files[0].progress).toBe(100);
    expect(result.current.files[0].url).toBe(
      "https://cdn.example.com/uploads/photo.jpg"
    );
    expect(result.current.isUploading).toBe(false);
    expect(result.current.progress).toBe(100);
  });

  it("forwards client metadata to the presign request", async () => {
    stubXhr();
    const fetcher = createFetcher();

    const { result } = renderHook(() =>
      useUploadRoute("imageUpload", { endpoint: "/api/upload", fetcher })
    );

    await act(async () => {
      await result.current.uploadFiles([makeFile()], { albumId: "abc" });
    });

    const presignCall = (fetcher as any).mock.calls.find((c: any[]) =>
      String(c[0]).includes("action=presign")
    );
    expect(JSON.parse(presignCall[1].body).metadata).toEqual({
      albumId: "abc",
    });
  });

  it("targets the configured route and endpoint", async () => {
    stubXhr();
    const fetcher = createFetcher();

    const { result } = renderHook(() =>
      useUploadRoute("documentUpload", {
        endpoint: "/custom/upload",
        fetcher,
      })
    );

    await act(async () => {
      await result.current.uploadFiles([makeFile()]);
    });

    expect(String((fetcher as any).mock.calls[0][0])).toContain(
      "/custom/upload?route=documentUpload&action=presign"
    );
  });

  it("surfaces server errors on every file", async () => {
    const fetcher = createFetcher({
      presign: { success: false, error: "Unauthorized" },
    });
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useUploadRoute("imageUpload", {
        endpoint: "/api/upload",
        fetcher,
        onError,
      })
    );

    await act(async () => {
      await result.current.uploadFiles([makeFile()]);
    });

    expect(result.current.files[0].status).toBe("error");
    expect(result.current.files[0].error).toBe("Unauthorized");
    expect(onError).toHaveBeenCalled();
  });

  it("reset clears state back to idle", async () => {
    stubXhr();
    const fetcher = createFetcher();

    const { result } = renderHook(() =>
      useUploadRoute("imageUpload", { endpoint: "/api/upload", fetcher })
    );

    await act(async () => {
      await result.current.uploadFiles([makeFile()]);
    });
    expect(result.current.files).toHaveLength(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.progress).toBe(0);
    expect(result.current.isUploading).toBe(false);
  });

  it("reports progress through the onProgress callback", async () => {
    stubXhr();
    const fetcher = createFetcher();
    const seen: number[] = [];

    const { result } = renderHook(() =>
      useUploadRoute("imageUpload", {
        endpoint: "/api/upload",
        fetcher,
        onProgress: (p) => seen.push(p),
      })
    );

    await act(async () => {
      await result.current.uploadFiles([makeFile()]);
    });

    expect(seen).toContain(0);
    expect(seen[seen.length - 1]).toBe(100);
  });
});
