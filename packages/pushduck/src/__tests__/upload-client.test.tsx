// @vitest-environment happy-dom

/**
 * @fileoverview The property-based client, `createUploadClient`.
 *
 * This is the API the docs lead with, and it had no tests at all — a fact the
 * broken coverage report hid by showing zeros for every file at once.
 *
 * Its whole job is delegation: a Proxy turns `upload.imageUpload(options)` into
 * `useUploadRoute("imageUpload", merged)`. So the things worth testing are the
 * places delegation can quietly lose something — an option that is accepted at
 * the type level and dropped on the way through, or a field of the hook's
 * result that the client forgets to pass on.
 *
 * Both have happened here before. The file's own comment records an earlier
 * version that rebuilt the hook's return value field by field and drifted:
 * it lacked `cancel`, `cancelAll` and `uploadFilesAsync`, and its `uploadFiles`
 * resolved with a stale file list. These tests pin the surface so it cannot
 * drift again.
 */

import { act, render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createUploadClient } from "../client/upload-client";
import { MIB } from "../core/upload/multipart/limits";

function makeFile(name = "photo.jpg", size = 1000, type = "image/jpeg"): File {
  return new File([new Uint8Array(size)], name, { type });
}

/** Answers presign, completion and the multipart handshake. */
function createFetcher() {
  return vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const action = new URL(url, "http://x").searchParams.get("action") ?? "presign";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const reply = (payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    switch (action) {
      case "multipart-init":
        return reply({
          success: true,
          session: "s",
          key: "uploads/photo.jpg",
          partSize: 5 * MIB,
          metadata: {},
        });
      case "multipart-parts":
        return reply({ success: true, parts: [] });
      case "multipart-sign":
        return reply(
          body.partNumbers.map((partNumber: number) => ({
            partNumber,
            url: `https://storage.example/part/${partNumber}`,
          }))
        );
      case "multipart-complete":
        return reply({
          success: true,
          key: "uploads/photo.jpg",
          url: "https://cdn.example/uploads/photo.jpg",
        });
      case "presign":
        return reply({
          success: true,
          results: [
            {
              success: true,
              presignedUrl: "https://storage.example/signed",
              key: "uploads/photo.jpg",
              requiredHeaders: {},
            },
          ],
        });
      default:
        return reply({
          success: true,
          results: [
            {
              success: true,
              key: "uploads/photo.jpg",
              url: "https://cdn.example/uploads/photo.jpg",
            },
          ],
        });
    }
  });
}

const okTransport = async ({ body, onProgress }: any) => {
  onProgress?.(body.size ?? body.byteLength, body.size ?? body.byteLength);
  return { etag: '"e"' };
};

/** Renders a route hook and hands back its latest result. */
function renderRoute(clientConfig: any, route: string, routeOptions?: any) {
  const seen: { current: any } = { current: null };

  function Harness() {
    const upload = createUploadClient<any>(clientConfig);
    seen.current = (upload as any)[route](routeOptions);
    return null;
  }

  render(<Harness />);
  return seen;
}

describe("route access", () => {
  it("exposes any route name as a hook factory", () => {
    const seen = renderRoute({ endpoint: "/api/upload" }, "anyRouteName");

    expect(seen.current).toBeTruthy();
    expect(seen.current.routeName).toBe("anyRouteName");
  });

  it("passes through the hook's full surface", () => {
    // The documented regression: an earlier version rebuilt this object field
    // by field and silently lost `cancel`, `cancelAll` and `uploadFilesAsync`.
    const seen = renderRoute({ endpoint: "/api/upload" }, "imageUpload");

    for (const member of [
      "uploadFiles",
      "uploadFilesAsync",
      "cancel",
      "cancelAll",
      "reset",
      "files",
      "isUploading",
      "errors",
      "progress",
      "uploadSpeed",
      "eta",
    ]) {
      expect(seen.current, `missing ${member}`).toHaveProperty(member);
    }
  });

  it("rejects a symbol route access rather than returning nonsense", () => {
    function Harness() {
      const upload = createUploadClient<any>({ endpoint: "/api/upload" });
      // Reading a symbol would otherwise produce a factory named `Symbol(...)`
      // and fail much later against the server.
      expect(() => (upload as any)[Symbol.iterator]).toThrow(/must be strings/i);
      return null;
    }
    render(<Harness />);
  });
});

describe("configuration reaches the engine", () => {
  it("uses the client endpoint", async () => {
    const fetcher = createFetcher();
    const seen = renderRoute(
      { endpoint: "/api/upload", fetcher },
      "imageUpload",
      { transport: okTransport }
    );

    await act(async () => {
      await seen.current.uploadFiles([makeFile()]);
    });

    expect(String(fetcher.mock.calls[0][0])).toContain("/api/upload");
  });

  it("lets a route override the endpoint", async () => {
    const fetcher = createFetcher();
    const seen = renderRoute({ endpoint: "/api/upload", fetcher }, "secure", {
      endpoint: "/api/secure-upload",
      transport: okTransport,
    });

    await act(async () => {
      await seen.current.uploadFiles([makeFile()]);
    });

    expect(String(fetcher.mock.calls[0][0])).toContain("/api/secure-upload");
  });

  it("falls back to defaultOptions callbacks", async () => {
    const onSuccess = vi.fn();
    const seen = renderRoute(
      {
        endpoint: "/api/upload",
        fetcher: createFetcher(),
        defaultOptions: { onSuccess },
      },
      "imageUpload",
      { transport: okTransport }
    );

    await act(async () => {
      await seen.current.uploadFiles([makeFile()]);
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it("prefers a route callback over the default", async () => {
    const fromDefault = vi.fn();
    const fromRoute = vi.fn();

    const seen = renderRoute(
      {
        endpoint: "/api/upload",
        fetcher: createFetcher(),
        defaultOptions: { onSuccess: fromDefault },
      },
      "imageUpload",
      { onSuccess: fromRoute, transport: okTransport }
    );

    await act(async () => {
      await seen.current.uploadFiles([makeFile()]);
    });

    expect(fromRoute).toHaveBeenCalled();
    expect(fromDefault).not.toHaveBeenCalled();
  });

  it("forwards a custom transport", async () => {
    // `UploadAdvancedConfig` exists so that "every binding *and* the
    // property-based client accept an identical options object". A transport
    // accepted by the types and dropped in transit would make that false.
    const transport = vi.fn(okTransport);
    const seen = renderRoute(
      { endpoint: "/api/upload", fetcher: createFetcher() },
      "imageUpload",
      { transport }
    );

    await act(async () => {
      await seen.current.uploadFiles([makeFile()]);
    });

    expect(transport).toHaveBeenCalled();
  });

  it("forwards multipart configuration", async () => {
    // Without this, a caller using the recommended client API cannot set a
    // threshold, a resume store, or a chunk reader at all — the entire
    // large-file feature set is unreachable from it.
    const fetcher = createFetcher();
    const transport = vi.fn(okTransport);

    const seen = renderRoute(
      { endpoint: "/api/upload", fetcher },
      "videoUpload",
      {
        transport,
        multipart: { threshold: 6 * MIB, partSize: 5 * MIB, concurrency: 1 },
      }
    );

    await act(async () => {
      await seen.current.uploadFiles([makeFile("big.bin", 12 * MIB)]);
    });

    const actions = fetcher.mock.calls.map((call) =>
      new URL(String(call[0]), "http://x").searchParams.get("action")
    );
    expect(actions).toContain("multipart-init");
  });

  it("honours multipart being switched off", async () => {
    const fetcher = createFetcher();
    const seen = renderRoute(
      { endpoint: "/api/upload", fetcher },
      "videoUpload",
      { transport: okTransport, multipart: { enabled: false } }
    );

    await act(async () => {
      await seen.current.uploadFiles([makeFile("big.bin", 12 * MIB)]);
    });

    const actions = fetcher.mock.calls.map((call) =>
      new URL(String(call[0]), "http://x").searchParams.get("action")
    );
    expect(actions).not.toContain("multipart-init");
  });
});

describe("uploading", () => {
  it("reports success through state", async () => {
    const seen = renderRoute(
      { endpoint: "/api/upload", fetcher: createFetcher() },
      "imageUpload",
      { transport: okTransport }
    );

    await act(async () => {
      await seen.current.uploadFiles([makeFile()]);
    });

    expect(seen.current.files).toHaveLength(1);
    expect(seen.current.files[0].status).toBe("success");
    expect(seen.current.isUploading).toBe(false);
  });

  it("forwards client metadata to the server", async () => {
    // The headline feature of this client, per its own documentation.
    const fetcher = createFetcher();
    const seen = renderRoute(
      { endpoint: "/api/upload", fetcher },
      "imageUpload",
      { transport: okTransport }
    );

    await act(async () => {
      await seen.current.uploadFiles([makeFile()], {
        albumId: "album-1",
        tags: ["vacation"],
      });
    });

    const presign = fetcher.mock.calls.find((call) =>
      String(call[0]).includes("action=presign")
    );
    const body = JSON.parse(String((presign?.[1] as RequestInit).body));
    expect(body.metadata).toEqual({ albumId: "album-1", tags: ["vacation"] });
  });

  it("resolves uploadFilesAsync with the settled files", async () => {
    // The other half of the earlier drift: this used to resolve with the
    // pre-upload snapshot, because React had not re-rendered yet.
    const seen = renderRoute(
      { endpoint: "/api/upload", fetcher: createFetcher() },
      "imageUpload",
      { transport: okTransport }
    );

    let resolved: any;
    await act(async () => {
      resolved = await seen.current.uploadFilesAsync([makeFile()]);
    });

    // Resolves with the settled `UploadFilesResult`, not a bare array.
    expect(resolved.failedFiles).toEqual([]);
    expect(resolved.files).toHaveLength(1);
    expect(resolved.files[0].status).toBe("success");
  });

  it("clears state on reset", async () => {
    const seen = renderRoute(
      { endpoint: "/api/upload", fetcher: createFetcher() },
      "imageUpload",
      { transport: okTransport }
    );

    await act(async () => {
      await seen.current.uploadFiles([makeFile()]);
    });
    expect(seen.current.files).toHaveLength(1);

    await act(async () => {
      seen.current.reset();
    });
    expect(seen.current.files).toHaveLength(0);
  });
});
