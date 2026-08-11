/**
 * @fileoverview Upload engine tests — no React, no renderer, no DOM, no network.
 *
 * These tests are the contract that lets a Vue, Svelte, or Solid binding be
 * written with confidence: if the engine behaves correctly here, a binding only
 * has to translate `subscribe`/`getSnapshot` into its own reactivity primitive.
 *
 * The fact that this file imports no framework at all *is* the assertion that
 * the extraction succeeded.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeAggregateProgress,
  computeFileTelemetry,
  createUploadEngine,
  formatETA,
  formatUploadSpeed,
  getInputMeta,
  isMimeType,
  UploadAbortedError,
  type UploadEngineOptions,
  type UploadTransport,
} from "../core/upload";
import type { S3UploadedFile, UploadInput } from "../types";

// ========================================
// Test doubles
// ========================================

/** A controllable transport that records calls and never touches the network. */
function createTestTransport(
  behaviour: {
    /** Emits progress events before resolving. */
    progressSteps?: Array<[loaded: number, total: number]>;
    /** Rejects with this error instead of resolving. */
    failWith?: Error;
    /** Blocks until the returned `release` is invoked. */
    manual?: boolean;
  } = {}
) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  let release: (() => void) | undefined;

  const transport: UploadTransport = async (request) => {
    calls.push({ url: request.url, headers: request.headers });

    for (const [loaded, total] of behaviour.progressSteps ?? []) {
      request.onProgress?.(loaded, total);
    }

    if (behaviour.manual) {
      await new Promise<void>((resolve, reject) => {
        release = resolve;
        request.signal?.addEventListener("abort", () =>
          reject(new UploadAbortedError())
        );
      });
    }

    if (behaviour.failWith) throw behaviour.failWith;
  };

  return {
    transport,
    calls,
    release: () => release?.(),
  };
}

/** Builds a `fetcher` that answers the presign and complete calls from fixtures. */
function createTestFetcher(
  responses: {
    presign?: unknown;
    presignStatus?: number;
    complete?: unknown;
    completeStatus?: number;
  } = {}
) {
  const requests: Array<{
    url: string;
    body?: {
      files?: Array<{ name: string; size: number; type: string }>;
      metadata?: unknown;
      completions?: unknown[];
    };
  }> = [];

  const fetcher = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url, body });

    const isPresign = url.includes("action=presign");
    const status = isPresign
      ? (responses.presignStatus ?? 200)
      : (responses.completeStatus ?? 200);
    const payload = isPresign
      ? (responses.presign ?? { success: true, results: [] })
      : (responses.complete ?? { success: true, results: [] });

    return new Response(JSON.stringify(payload), {
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: { "Content-Type": "application/json" },
    });
  });

  return { fetcher, requests };
}

function presignResult(over: Record<string, unknown> = {}) {
  return {
    success: true,
    presignedUrl: "https://bucket.s3.amazonaws.com/signed",
    key: "uploads/photo.jpg",
    requiredHeaders: { "Content-Type": "image/jpeg" },
    metadata: { userId: "u1" },
    ...over,
  };
}

function makeFile(name = "photo.jpg", size = 1000, type = "image/jpeg"): File {
  return new File([new Uint8Array(size)], name, { type });
}

/** Builds an engine with test doubles wired in and sane defaults. */
function buildEngine(over: Partial<UploadEngineOptions> = {}) {
  return createUploadEngine({
    route: "imageUpload",
    endpoint: "/api/upload",
    ...over,
  });
}

// ========================================
// Pure helpers
// ========================================

describe("pure helpers", () => {
  describe("computeAggregateProgress", () => {
    it("returns idle state for an empty batch", () => {
      expect(computeAggregateProgress([])).toEqual({
        progress: 0,
        uploadSpeed: 0,
        eta: 0,
      });
    });

    it("ignores pending files so progress cannot lurch backwards", () => {
      const files = [
        { size: 1000, status: "success", progress: 100 },
        { size: 9000, status: "pending", progress: 0 },
      ] as S3UploadedFile[];

      // Only the started file counts: 100%, not 10%.
      expect(computeAggregateProgress(files).progress).toBe(100);
    });

    it("weights progress by bytes, not by file count", () => {
      const files = [
        { size: 1, status: "success", progress: 100 },
        { size: 999, status: "uploading", progress: 0 },
      ] as S3UploadedFile[];

      // File-count weighting would say 50%. Byte weighting says 0.1%.
      expect(computeAggregateProgress(files).progress).toBeCloseTo(0.1, 5);
    });

    it("sums transfer rates and derives ETA from remaining bytes", () => {
      const files = [
        { size: 1000, status: "uploading", progress: 50, uploadSpeed: 250 },
        { size: 1000, status: "uploading", progress: 50, uploadSpeed: 250 },
      ] as S3UploadedFile[];

      const result = computeAggregateProgress(files);
      expect(result.progress).toBe(50);
      expect(result.uploadSpeed).toBe(500);
      expect(result.eta).toBe(2); // 1000 bytes remaining / 500 B/s
    });

    it("reports zero ETA rather than Infinity when nothing is moving", () => {
      const files = [
        { size: 1000, status: "uploading", progress: 0, uploadSpeed: 0 },
      ] as S3UploadedFile[];

      expect(computeAggregateProgress(files).eta).toBe(0);
    });

    it("clamps progress into 0-100", () => {
      const files = [
        { size: 100, status: "uploading", progress: 500 },
      ] as S3UploadedFile[];

      expect(computeAggregateProgress(files).progress).toBe(100);
    });
  });

  describe("computeFileTelemetry", () => {
    it("derives rate and ETA from elapsed time", () => {
      expect(computeFileTelemetry(500, 1000, 1)).toEqual({
        progress: 50,
        uploadSpeed: 500,
        eta: 1,
      });
    });

    it("avoids Infinity when no time has elapsed", () => {
      expect(computeFileTelemetry(500, 1000, 0)).toEqual({
        progress: 50,
        uploadSpeed: 0,
        eta: 0,
      });
    });

    it("handles a zero-byte file without dividing by zero", () => {
      expect(computeFileTelemetry(0, 0, 1).progress).toBe(0);
    });
  });

  describe("input normalisation", () => {
    it("reads name, size and type straight off a File", () => {
      expect(getInputMeta(makeFile("a.png", 12, "image/png"))).toEqual({
        name: "a.png",
        size: 12,
        type: "image/png",
      });
    });

    it("prefers mimeType over expo-image-picker's category type field", () => {
      const asset: UploadInput = {
        uri: "file:///tmp/x.jpg",
        fileName: "x.jpg",
        mimeType: "image/jpeg",
        type: "image", // a category, not a MIME type
        fileSize: 42,
      };
      expect(getInputMeta(asset).type).toBe("image/jpeg");
    });

    it("accepts react-native-image-picker's type when it is a real MIME type", () => {
      const asset: UploadInput = {
        uri: "file:///tmp/x.jpg",
        fileName: "x.jpg",
        type: "image/jpeg",
        fileSize: 42,
      };
      expect(getInputMeta(asset).type).toBe("image/jpeg");
    });

    it("falls back to octet-stream when no usable MIME type is present", () => {
      const asset: UploadInput = { uri: "file:///tmp/x", type: "video" };
      expect(getInputMeta(asset)).toEqual({
        name: "upload",
        size: 0,
        type: "application/octet-stream",
      });
    });

    it("distinguishes MIME types from media categories", () => {
      expect(isMimeType("image/png")).toBe(true);
      expect(isMimeType("image")).toBe(false);
      expect(isMimeType(null)).toBe(false);
    });
  });

  describe("formatting", () => {
    it("formats ETA across unit boundaries", () => {
      expect(formatETA(45)).toBe("45s");
      expect(formatETA(120)).toBe("2m");
      expect(formatETA(7200)).toBe("2h");
    });

    it("formats speed across unit boundaries", () => {
      expect(formatUploadSpeed(1024)).toBe("1.0 KB/s");
      expect(formatUploadSpeed(1048576)).toBe("1.0 MB/s");
    });
  });
});

// ========================================
// External-store contract
// ========================================

describe("external-store contract", () => {
  it("starts in a clean idle state", () => {
    const engine = buildEngine();
    expect(engine.getSnapshot()).toEqual({
      files: [],
      isUploading: false,
      errors: [],
      progress: 0,
      uploadSpeed: 0,
      eta: 0,
    });
  });

  it("returns a referentially stable snapshot between changes", () => {
    // This is the invariant useSyncExternalStore depends on. Without it React
    // re-renders forever, and Vue/Solid re-render on every tick.
    const engine = buildEngine();
    expect(engine.getSnapshot()).toBe(engine.getSnapshot());
  });

  it("produces a new snapshot reference when state changes", async () => {
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
    });
    const { transport } = createTestTransport();
    const engine = buildEngine({ fetcher, transport });

    const before = engine.getSnapshot();
    await engine.upload([makeFile()]);
    expect(engine.getSnapshot()).not.toBe(before);
  });

  it("notifies subscribers and honours unsubscribe", async () => {
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
    });
    const { transport } = createTestTransport();
    const engine = buildEngine({ fetcher, transport });

    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);

    await engine.upload([makeFile()]);
    expect(listener).toHaveBeenCalled();

    const countAfterFirst = listener.mock.calls.length;
    unsubscribe();
    await engine.upload([makeFile()]);
    expect(listener.mock.calls.length).toBe(countAfterFirst);
  });

  it("survives a listener unsubscribing during notification", () => {
    const engine = buildEngine();
    const second = vi.fn();

    const unsubFirst = engine.subscribe(() => unsubFirst());
    engine.subscribe(second);

    expect(() => engine.reset()).not.toThrow();
    expect(second).toHaveBeenCalled();
  });
});

// ========================================
// Upload workflow
// ========================================

describe("upload workflow", () => {
  let transportKit: ReturnType<typeof createTestTransport>;

  beforeEach(() => {
    transportKit = createTestTransport();
  });

  it("presigns, transmits, then completes — in that order", async () => {
    const { fetcher, requests } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
      complete: {
        success: true,
        results: [
          {
            success: true,
            key: "uploads/photo.jpg",
            url: "https://cdn.example.com/uploads/photo.jpg",
          },
        ],
      },
    });

    const engine = buildEngine({ fetcher, transport: transportKit.transport });
    await engine.upload([makeFile()]);

    expect(requests[0].url).toContain("action=presign");
    expect(requests[0].url).toContain("route=imageUpload");
    expect(transportKit.calls).toHaveLength(1);
    expect(requests[1].url).toContain("action=complete");

    const { files } = engine.getSnapshot();
    expect(files[0].status).toBe("success");
    expect(files[0].url).toBe("https://cdn.example.com/uploads/photo.jpg");
    expect(files[0].progress).toBe(100);
  });

  it("forwards client metadata in the presign request", async () => {
    const { fetcher, requests } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
    });

    const engine = buildEngine({ fetcher, transport: transportKit.transport });
    await engine.upload([makeFile()], { albumId: "abc", tags: ["x"] });

    expect(requests[0].body?.metadata).toEqual({ albumId: "abc", tags: ["x"] });
  });

  it("sends the server's requiredHeaders verbatim", async () => {
    const { fetcher } = createTestFetcher({
      presign: {
        success: true,
        results: [
          presignResult({
            requiredHeaders: {
              "Content-Type": "image/jpeg",
              "x-amz-checksum-crc32": "abc123",
            },
          }),
        ],
      },
    });

    const engine = buildEngine({ fetcher, transport: transportKit.transport });
    await engine.upload([makeFile()]);

    expect(transportKit.calls[0].headers).toEqual({
      "Content-Type": "image/jpeg",
      "x-amz-checksum-crc32": "abc123",
    });
  });

  it("falls back to Content-Type when an older server omits requiredHeaders", async () => {
    const { fetcher } = createTestFetcher({
      presign: {
        success: true,
        results: [presignResult({ requiredHeaders: undefined })],
      },
    });

    const engine = buildEngine({ fetcher, transport: transportKit.transport });
    await engine.upload([makeFile("photo.jpg", 10, "image/jpeg")]);

    expect(transportKit.calls[0].headers).toEqual({
      "Content-Type": "image/jpeg",
    });
  });

  it("tracks progress, speed and ETA from transport events", async () => {
    let clock = 0;
    const kit = createTestTransport({ progressSteps: [[500, 1000]] });
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
    });

    const seen: number[] = [];
    const engine = buildEngine({
      fetcher,
      transport: kit.transport,
      now: () => (clock += 1000), // 1s per tick, deterministic
      onProgress: (p) => seen.push(p),
    });

    await engine.upload([makeFile("photo.jpg", 1000)]);

    expect(seen).toContain(0);
    expect(seen[seen.length - 1]).toBe(100);
    expect(engine.getSnapshot().progress).toBe(100);
  });

  it("resolves without uploading when given an empty batch", async () => {
    const { fetcher } = createTestFetcher();
    const engine = buildEngine({ fetcher, transport: transportKit.transport });

    await engine.upload([]);

    expect(fetcher).not.toHaveBeenCalled();
    expect(engine.getSnapshot().isUploading).toBe(false);
  });

  it("clears isUploading once the batch settles", async () => {
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
    });
    const engine = buildEngine({ fetcher, transport: transportKit.transport });

    await engine.upload([makeFile()]);
    expect(engine.getSnapshot().isUploading).toBe(false);
  });

  it("assigns unique ids to files uploaded within the same millisecond", async () => {
    const { fetcher } = createTestFetcher({
      presign: {
        success: true,
        results: [presignResult(), presignResult({ key: "uploads/b.jpg" })],
      },
    });

    const engine = buildEngine({
      fetcher,
      transport: transportKit.transport,
      now: () => 1700000000000, // frozen clock
    });

    await engine.upload([makeFile("a.jpg"), makeFile("b.jpg")]);

    const ids = engine.getSnapshot().files.map((f) => f.id);
    expect(new Set(ids).size).toBe(2);
  });
});

// ========================================
// Failure handling
// ========================================

describe("failure handling", () => {
  it("marks every file errored when presign returns a non-2xx", async () => {
    const { fetcher } = createTestFetcher({
      presign: { error: "Unauthorized" },
      presignStatus: 401,
    });

    const onError = vi.fn();
    const engine = buildEngine({ fetcher, onError });

    await engine.upload([makeFile(), makeFile("b.jpg")]);

    const { files } = engine.getSnapshot();
    expect(files.every((f) => f.status === "error")).toBe(true);
    expect(files[0].error).toBe("Unauthorized");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: "Unauthorized",
    }));
  });

  it("marks every file errored when presign returns success: false", async () => {
    const { fetcher } = createTestFetcher({
      presign: { success: false, error: "Route not found" },
    });

    const engine = buildEngine({ fetcher });
    await engine.upload([makeFile()]);

    expect(engine.getSnapshot().files[0].error).toBe("Route not found");
  });

  it("fails only the rejected file when validation rejects one of several", async () => {
    const { fetcher } = createTestFetcher({
      presign: {
        success: true,
        results: [
          presignResult(),
          { success: false, error: "File too large" },
        ],
      },
    });
    const { transport } = createTestTransport();

    const engine = buildEngine({ fetcher, transport });
    await engine.upload([makeFile("ok.jpg"), makeFile("big.jpg")]);

    const { files } = engine.getSnapshot();
    expect(files[0].status).toBe("success");
    expect(files[1].status).toBe("error");
    expect(files[1].error).toBe("File too large");
  });

  it("rejects a success result that omits the presigned URL", async () => {
    // Without an explicit guard this would PUT to the string "undefined" and
    // surface as an opaque network error rather than a diagnosable one.
    const { fetcher } = createTestFetcher({
      presign: {
        success: true,
        results: [presignResult({ presignedUrl: undefined })],
      },
    });
    const kit = createTestTransport();

    const engine = buildEngine({ fetcher, transport: kit.transport });
    await engine.upload([makeFile()]);

    expect(kit.calls).toHaveLength(0);
    expect(engine.getSnapshot().files[0].status).toBe("error");
    expect(engine.getSnapshot().files[0].error).toContain(
      "without a presigned URL"
    );
  });

  it("surfaces a transport failure on the affected file", async () => {
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
    });
    const { transport } = createTestTransport({
      failWith: new Error("Upload failed with status: 403"),
    });

    const onError = vi.fn();
    const engine = buildEngine({ fetcher, transport, onError });
    await engine.upload([makeFile()]);

    expect(engine.getSnapshot().files[0].status).toBe("error");
    expect(engine.getSnapshot().files[0].error).toBe(
      "Upload failed with status: 403"
    );
    expect(onError).toHaveBeenCalled();
  });

  it("keeps uploads successful when the completion call fails", async () => {
    // The bytes are already in storage — a completion failure must not
    // retroactively turn a successful upload into a failed one.
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
      completeStatus: 500,
    });
    const { transport } = createTestTransport();

    const engine = buildEngine({ fetcher, transport });
    await engine.upload([makeFile()]);

    expect(engine.getSnapshot().files[0].status).toBe("success");
  });

  it("never rejects, even when the fetcher throws", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("Network down");
    }) as unknown as UploadEngineOptions["fetcher"];

    const onError = vi.fn();
    const engine = buildEngine({ fetcher, onError });

    await expect(engine.upload([makeFile()])).resolves.toBeUndefined();
    expect(engine.getSnapshot().errors).toContain("Network down");
    expect(onError).toHaveBeenCalled();
  });

  it("rejects content:// URIs with actionable guidance", async () => {
    const { fetcher } = createTestFetcher();
    const engine = buildEngine({ fetcher });

    await engine.upload([{ uri: "content://media/1", name: "x.jpg" }]);

    expect(engine.getSnapshot().errors[0]).toContain("copyToCacheDirectory");
  });
});

// ========================================
// Lifecycle callbacks
// ========================================

describe("lifecycle callbacks", () => {
  it("fires onStart with resolved metadata only after validation passes", async () => {
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
    });
    const { transport } = createTestTransport();

    const onStart = vi.fn();
    const engine = buildEngine({ fetcher, transport, onStart });
    await engine.upload([makeFile("photo.jpg", 1000, "image/jpeg")]);

    expect(onStart).toHaveBeenCalledWith([
      { name: "photo.jpg", size: 1000, type: "image/jpeg" },
    ]);
  });

  it("does not fire onStart when presign fails", async () => {
    const { fetcher } = createTestFetcher({
      presign: { success: false, error: "nope" },
    });

    const onStart = vi.fn();
    const engine = buildEngine({ fetcher, onStart });
    await engine.upload([makeFile()]);

    expect(onStart).not.toHaveBeenCalled();
  });

  it("fires onSuccess with only the files that succeeded", async () => {
    const { fetcher } = createTestFetcher({
      presign: {
        success: true,
        results: [presignResult(), { success: false, error: "rejected" }],
      },
    });
    const { transport } = createTestTransport();

    const onSuccess = vi.fn();
    const engine = buildEngine({ fetcher, transport, onSuccess });
    await engine.upload([makeFile("a.jpg"), makeFile("b.jpg")]);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    const delivered = onSuccess.mock.calls[0][0] as S3UploadedFile[];
    expect(delivered).toHaveLength(1);
    expect(delivered[0].name).toBe("a.jpg");
  });

  it("does not fire onSuccess when every file fails", async () => {
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [{ success: false, error: "no" }] },
    });

    const onSuccess = vi.fn();
    const engine = buildEngine({ fetcher, onSuccess });
    await engine.upload([makeFile()]);

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("suppresses duplicate onProgress calls for an unchanged value", async () => {
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
    });
    // Two identical progress events should collapse to one report.
    const { transport } = createTestTransport({
      progressSteps: [
        [500, 1000],
        [500, 1000],
      ],
    });

    let clock = 0;
    const seen: number[] = [];
    const engine = buildEngine({
      fetcher,
      transport,
      now: () => (clock += 1000),
      onProgress: (p) => seen.push(p),
    });

    await engine.upload([makeFile("photo.jpg", 1000)]);

    expect(new Set(seen).size).toBe(seen.length);
  });
});

// ========================================
// Cancellation and reset
// ========================================

describe("cancellation and reset", () => {
  it("cancels a single in-flight file", async () => {
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
    });
    const kit = createTestTransport({ manual: true });

    const engine = buildEngine({ fetcher, transport: kit.transport });
    const pending = engine.upload([makeFile()]);

    // Wait for the transport to be entered before cancelling.
    await vi.waitFor(() => expect(kit.calls).toHaveLength(1));

    const fileId = engine.getSnapshot().files[0].id;
    engine.cancel(fileId);
    await pending;

    const file = engine.getSnapshot().files[0];
    expect(file.status).toBe("error");
    expect(file.error).toBe("Upload cancelled");
  });

  it("cancelAll aborts every in-flight file", async () => {
    const { fetcher } = createTestFetcher({
      presign: {
        success: true,
        results: [presignResult(), presignResult({ key: "uploads/b.jpg" })],
      },
    });
    const kit = createTestTransport({ manual: true });

    const engine = buildEngine({ fetcher, transport: kit.transport });
    const pending = engine.upload([makeFile("a.jpg"), makeFile("b.jpg")]);

    await vi.waitFor(() => expect(kit.calls).toHaveLength(2));
    engine.cancelAll();
    await pending;

    expect(
      engine.getSnapshot().files.every((f) => f.status === "error")
    ).toBe(true);
  });

  it("reset returns the engine to its initial snapshot and notifies", async () => {
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
    });
    const { transport } = createTestTransport();

    const engine = buildEngine({ fetcher, transport });
    await engine.upload([makeFile()]);
    expect(engine.getSnapshot().files).toHaveLength(1);

    const listener = vi.fn();
    engine.subscribe(listener);
    engine.reset();

    expect(listener).toHaveBeenCalled();
    expect(engine.getSnapshot()).toEqual({
      files: [],
      isUploading: false,
      errors: [],
      progress: 0,
      uploadSpeed: 0,
      eta: 0,
    });
  });

  it("cancelling an unknown file id is a no-op", () => {
    const engine = buildEngine();
    expect(() => engine.cancel("does-not-exist")).not.toThrow();
  });

  it("a superseded batch does not clear the batch that replaced it", async () => {
    // Starting a second upload while the first is in flight must not let the
    // first's completion flip isUploading to false or drop the live tracks.
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
    });
    const first = createTestTransport({ manual: true });
    const engine = buildEngine({ fetcher, transport: first.transport });

    const firstRun = engine.upload([makeFile("a.jpg")]);
    await vi.waitFor(() => expect(first.calls).toHaveLength(1));

    const second = createTestTransport({ manual: true });
    const engine2 = engine; // same engine, new batch
    const secondRun = engine2.upload([makeFile("b.jpg")]);

    // Let the first batch settle after the second has taken ownership.
    first.release();
    await firstRun;

    expect(engine.getSnapshot().isUploading).toBe(true);

    second.release();
    engine.cancelAll();
    await secondRun;
    expect(engine.getSnapshot().isUploading).toBe(false);
  });

  it("reset orphans an in-flight batch so it cannot resurrect state", async () => {
    const { fetcher } = createTestFetcher({
      presign: { success: true, results: [presignResult()] },
    });
    const kit = createTestTransport({ manual: true });
    const engine = buildEngine({ fetcher, transport: kit.transport });

    const pending = engine.upload([makeFile()]);
    await vi.waitFor(() => expect(kit.calls).toHaveLength(1));

    engine.reset();
    kit.release();
    await pending;

    expect(engine.getSnapshot().files).toEqual([]);
    expect(engine.getSnapshot().isUploading).toBe(false);
  });
});
