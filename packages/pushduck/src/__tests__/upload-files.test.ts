/**
 * @fileoverview Tests for the promise-based upload API.
 *
 * These pin down the contract async-state libraries depend on. The engine's
 * `upload()` resolves to `void` and never rejects, which silently breaks
 * `useMutation`: `data` is empty, `onError` never fires, `isError` is never
 * true, and retries never trigger. `uploadFiles` exists to be the shape those
 * libraries expect, so the resolve/reject boundary is the thing worth testing
 * most carefully.
 *
 * The boundary: **the batch could not run** rejects; **some files failed**
 * resolves with partial results, because throwing would discard the successes.
 */

import { describe, expect, it, vi } from "vitest";
import type { UploadClientConfig } from "../core/upload";
import { UploadBatchError, uploadFile, uploadFiles } from "../core/upload";

function makeFile(name = "photo.jpg", size = 1000, type = "image/jpeg"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function presignOk(key = "uploads/photo.jpg") {
  return {
    success: true,
    presignedUrl: "https://bucket.s3.amazonaws.com/signed",
    key,
    requiredHeaders: { "Content-Type": "image/jpeg" },
  };
}

function createFetcher(
  over: { presign?: unknown; presignStatus?: number; complete?: unknown } = {}
): NonNullable<UploadClientConfig["fetcher"]> {
  return vi.fn(async (input: RequestInfo) => {
    const isPresign = String(input).includes("action=presign");
    const status = isPresign ? (over.presignStatus ?? 200) : 200;
    const payload = isPresign
      ? (over.presign ?? { success: true, results: [presignOk()] })
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
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: { "Content-Type": "application/json" },
    });
  });
}

const noopTransport = async () => {};

describe("uploadFiles — resolution", () => {
  it("resolves with uploaded files and their URLs", async () => {
    const result = await uploadFiles({
      files: [makeFile()],
      route: "imageUpload",
      endpoint: "/api/upload",
      fetcher: createFetcher(),
      transport: noopTransport,
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].status).toBe("success");
    expect(result.files[0].url).toBe(
      "https://cdn.example.com/uploads/photo.jpg"
    );
    expect(result.failedFiles).toEqual([]);
  });

  it("returns a usable value for useMutation's `data`", async () => {
    // The engine's upload() resolves to undefined, which makes `data` useless.
    const result = await uploadFiles({
      files: [makeFile()],
      route: "imageUpload",
      endpoint: "/api/upload",
      fetcher: createFetcher(),
      transport: noopTransport,
    });

    expect(result).not.toBeUndefined();
    expect(Object.keys(result).sort()).toEqual(["failedFiles", "files"]);
  });

  it("resolves with partial results when only some files fail", async () => {
    // Throwing here would discard the successful uploads — the bytes are
    // already in storage, so the caller must be able to see them.
    const result = await uploadFiles({
      files: [makeFile("ok.jpg"), makeFile("bad.jpg")],
      route: "imageUpload",
      endpoint: "/api/upload",
      transport: noopTransport,
      fetcher: createFetcher({
        presign: {
          success: true,
          results: [presignOk(), { success: false, error: "File too large" }],
        },
      }),
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("ok.jpg");
    expect(result.failedFiles).toHaveLength(1);
    expect(result.failedFiles[0].error).toBe("File too large");
  });

  it("forwards client metadata", async () => {
    const fetcher = createFetcher();

    await uploadFiles({
      files: [makeFile()],
      route: "imageUpload",
      endpoint: "/api/upload",
      fetcher,
      transport: noopTransport,
      metadata: { albumId: "abc" },
    });

    const presign = (fetcher as any).mock.calls.find((c: any[]) =>
      String(c[0]).includes("action=presign")
    );
    expect(JSON.parse(presign[1].body).metadata).toEqual({ albumId: "abc" });
  });
});

describe("uploadFiles — rejection", () => {
  it("rejects when the server refuses the presign request", async () => {
    // onError / isError / retry in TanStack Query all depend on this.
    await expect(
      uploadFiles({
        files: [makeFile()],
        route: "imageUpload",
        endpoint: "/api/upload",
        transport: noopTransport,
        fetcher: createFetcher({
          presign: { error: "Unauthorized" },
          presignStatus: 401,
        }),
      })
    ).rejects.toThrow(UploadBatchError);
  });

  it("carries the error messages and per-file state on the thrown error", async () => {
    let error!: UploadBatchError;
    try {
      await uploadFiles({
        files: [makeFile()],
        route: "imageUpload",
        endpoint: "/api/upload",
        transport: noopTransport,
        fetcher: createFetcher({
          presign: { success: false, error: "Route not found" },
        }),
      });
      throw new Error("expected uploadFiles to reject");
    } catch (thrown) {
      error = thrown as UploadBatchError;
    }

    expect(error).toBeInstanceOf(UploadBatchError);
    expect(error.message).toBe("Route not found");
    expect(error.errors).toContain("Route not found");
    expect(error.files).toHaveLength(1);
    expect(error.files[0].status).toBe("error");
  });

  it("rejects when the network is unavailable", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("Network down");
    }) as unknown as UploadClientConfig["fetcher"];

    await expect(
      uploadFiles({
        files: [makeFile()],
        route: "imageUpload",
        endpoint: "/api/upload",
        fetcher,
      })
    ).rejects.toThrow("Network down");
  });
});

describe("uploadFiles — per-file state", () => {
  it("reports each file's state transitions", async () => {
    const seen: Array<{ name: string; status: string }> = [];

    await uploadFiles({
      files: [makeFile("a.jpg"), makeFile("b.jpg")],
      route: "imageUpload",
      endpoint: "/api/upload",
      transport: noopTransport,
      fetcher: createFetcher({
        presign: {
          success: true,
          results: [presignOk("uploads/a.jpg"), presignOk("uploads/b.jpg")],
        },
      }),
      onFileStateChange: (file) =>
        seen.push({ name: file.name, status: file.status }),
    });

    expect(seen.some((s) => s.name === "a.jpg" && s.status === "success")).toBe(
      true
    );
    expect(seen.some((s) => s.name === "b.jpg" && s.status === "success")).toBe(
      true
    );
  });

  it("reports a file only when that file changed", async () => {
    // A naive implementation fires once per file on every commit, so a
    // two-file batch would emit a storm of duplicate events.
    const events: string[] = [];

    await uploadFiles({
      files: [makeFile("a.jpg"), makeFile("b.jpg")],
      route: "imageUpload",
      endpoint: "/api/upload",
      transport: noopTransport,
      fetcher: createFetcher({
        presign: {
          success: true,
          results: [presignOk("uploads/a.jpg"), presignOk("uploads/b.jpg")],
        },
      }),
      onFileStateChange: (file) => events.push(`${file.name}:${file.status}`),
    });

    // Consecutive duplicates would indicate re-emitting unchanged files.
    const duplicates = events.filter((e, i) => i > 0 && events[i - 1] === e);
    expect(duplicates).toEqual([]);
  });
});

describe("uploadFiles — cancellation", () => {
  it("aborts when the provided signal fires", async () => {
    const controller = new AbortController();
    let release!: () => void;

    const blocking = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          release = () => reject(new Error("Upload aborted"));
        })
    );

    const pending = uploadFiles({
      files: [makeFile()],
      route: "imageUpload",
      endpoint: "/api/upload",
      fetcher: createFetcher(),
      transport: async () => {
        queueMicrotask(() => {
          controller.abort();
          release();
        });
        return blocking();
      },
      signal: controller.signal,
    });

    const result = await pending;
    expect(result.failedFiles).toHaveLength(1);
  });

  it("accepts an already-aborted signal without hanging", async () => {
    const result = await uploadFiles({
      files: [makeFile()],
      route: "imageUpload",
      endpoint: "/api/upload",
      fetcher: createFetcher(),
      transport: noopTransport,
      signal: AbortSignal.abort(),
    });

    expect(result).toBeDefined();
  });
});

describe("uploadFile", () => {
  it("resolves with the single uploaded file", async () => {
    const uploaded = await uploadFile({
      file: makeFile(),
      route: "imageUpload",
      endpoint: "/api/upload",
      fetcher: createFetcher(),
      transport: noopTransport,
    });

    expect(uploaded.name).toBe("photo.jpg");
    expect(uploaded.status).toBe("success");
    expect(uploaded.url).toContain("cdn.example.com");
  });

  it("rejects when the file itself fails", async () => {
    // Unlike uploadFiles, there are no other successes to preserve, so a
    // failed file is a failed call.
    await expect(
      uploadFile({
        file: makeFile(),
        route: "imageUpload",
        endpoint: "/api/upload",
        transport: noopTransport,
        fetcher: createFetcher({
          presign: {
            success: true,
            results: [{ success: false, error: "File too large" }],
          },
        }),
      })
    ).rejects.toThrow("File too large");
  });
});

describe("server metadata", () => {
  it("surfaces the middleware chain's output on each uploaded file", async () => {
    // Previously captured internally but never exposed, so a route's middleware
    // output was invisible to the client without a second round trip.
    const result = await uploadFiles({
      files: [makeFile()],
      route: "imageUpload",
      endpoint: "/api/upload",
      transport: noopTransport,
      fetcher: createFetcher({
        presign: {
          success: true,
          results: [
            {
              ...presignOk(),
              metadata: { userId: "u1", recordId: 42, albumId: "summer" },
            },
          ],
        },
      }),
    });

    expect(result.files[0].metadata).toEqual({
      userId: "u1",
      recordId: 42,
      albumId: "summer",
    });
  });
});
