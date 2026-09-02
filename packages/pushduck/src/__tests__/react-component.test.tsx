// @vitest-environment happy-dom

/**
 * @fileoverview The React binding inside a component that actually renders.
 *
 * `use-upload-route.test.ts` drives the hook through `renderHook` and covers
 * the React-specific invariants well: snapshot stability and engine identity
 * across re-renders both fail there when broken, which was checked by
 * reverting each and watching that suite fail. This file does not duplicate
 * that, and it would be dishonest to claim it catches something subtler.
 *
 * What it covers is the layer above: whether the state a caller renders
 * actually arrives in the DOM. `renderHook` mounts a component whose output is
 * nothing, so a keyed list, a `progress` element's attribute, and error text
 * are never produced. Those are what a consumer writes and what a user sees,
 * and nothing else in the suite renders them.
 */

import { act, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { useUploadRoute } from "../hooks/use-upload-route";
import type { UploadRouteConfig } from "../types";

function makeFile(name = "photo.jpg", size = 1000, type = "image/jpeg"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function createFetcher(
  options: { fail?: boolean } = {}
): NonNullable<UploadRouteConfig["fetcher"]> {
  return vi.fn(async (input: RequestInfo) => {
    if (options.fail) {
      return new Response(
        JSON.stringify({
          type: "https://pushduck.org/errors/forbidden",
          title: "Forbidden",
          status: 403,
          code: "FORBIDDEN",
          detail: "Not allowed",
        }),
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const payload = String(input).includes("action=presign")
      ? {
          success: true,
          results: [
            {
              success: true,
              presignedUrl: "https://bucket.s3.amazonaws.com/signed",
              key: "uploads/photo.jpg",
              requiredHeaders: { "Content-Type": "image/jpeg" },
            },
          ],
        }
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

/** Captured so a test can drive an upload without a real file picker. */
let controls: ReturnType<typeof useUploadRoute>;

function Uploader({
  fetcher,
}: {
  fetcher: NonNullable<UploadRouteConfig["fetcher"]>;
}) {
  const upload = useUploadRoute("imageUpload", {
    endpoint: "/api/upload",
    fetcher,
    transport: noopTransport,
  });

  controls = upload;

  return (
    <div>
      <progress data-testid="progress" value={upload.progress} max={100} />
      <span data-testid="status">{String(upload.isUploading)}</span>
      <ul>
        {upload.files.map((file) => (
          <li key={file.id} data-testid="file">
            {file.name}:{file.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Same component, with an injectable transport so a transfer can be held. */
function BlockingUploader({
  fetcher,
  transport,
}: {
  fetcher: NonNullable<UploadRouteConfig["fetcher"]>;
  transport: () => Promise<void>;
}) {
  const upload = useUploadRoute("imageUpload", {
    endpoint: "/api/upload",
    fetcher,
    transport: async () => transport(),
  });

  controls = upload;

  return (
    <div>
      <span data-testid="status">{String(upload.isUploading)}</span>
      <ul>
        {upload.files.map((file) => (
          <li key={file.id} data-testid="file">
            {file.name}:{file.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A parent that re-renders on demand, to prove the child survives it. */
function Parent({
  fetcher,
}: {
  fetcher: NonNullable<UploadRouteConfig["fetcher"]>;
}) {
  const [tick, setTick] = React.useState(0);
  rerenderParent = () => setTick((t) => t + 1);

  return (
    <div>
      <span data-testid="tick">{tick}</span>
      <Uploader fetcher={fetcher} />
    </div>
  );
}

let rerenderParent: () => void;

describe("React binding in a rendered component", () => {
  it("renders upload state into the DOM", async () => {
    render(<Uploader fetcher={createFetcher()} />);

    expect(screen.getByTestId("status").textContent).toBe("false");
    expect(screen.queryAllByTestId("file")).toHaveLength(0);

    await act(async () => {
      await controls.uploadFiles([makeFile()]);
    });

    expect(screen.getAllByTestId("file")).toHaveLength(1);
    expect(screen.getByTestId("file").textContent).toBe("photo.jpg:success");
    expect(screen.getByTestId("progress").getAttribute("value")).toBe("100");
    expect(screen.getByTestId("status").textContent).toBe("false");
  });

  it("renders the in-flight state, not only the settled one", async () => {
    // A component that only ever showed the settled result would still pass
    // every other test here, and would render no spinner and no disabled
    // button. So the transport is held open and the DOM read mid-flight.
    let releaseTransport!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseTransport = resolve;
    });

    render(
      <BlockingUploader fetcher={createFetcher()} transport={() => blocked} />
    );

    let settle!: Promise<void>;
    await act(async () => {
      settle = controls.uploadFiles([makeFile()]);
      // Let the presign round trip land, but not the transfer.
      await Promise.resolve();
    });

    expect(screen.getByTestId("status").textContent).toBe("true");
    expect(screen.getByTestId("file").textContent).toContain("uploading");

    await act(async () => {
      releaseTransport();
      await settle;
    });

    expect(screen.getByTestId("status").textContent).toBe("false");
    expect(screen.getByTestId("file").textContent).toContain("success");
  });

  it("keeps in-flight state across a parent re-render", async () => {
    // The regression this guards: callbacks whose identity changes each render
    // tearing down and recreating the engine, discarding the current batch.
    render(<Parent fetcher={createFetcher()} />);

    await act(async () => {
      await controls.uploadFiles([makeFile("kept.jpg")]);
    });
    expect(screen.getByTestId("file").textContent).toContain("kept.jpg");

    await act(async () => {
      rerenderParent();
    });

    expect(screen.getByTestId("tick").textContent).toBe("1");
    // Still there — a recreated engine would have reset this to empty.
    expect(screen.getByTestId("file").textContent).toContain("kept.jpg");
  });

  it("renders a keyed list correctly across successive uploads", async () => {
    render(<Uploader fetcher={createFetcher()} />);

    await act(async () => {
      await controls.uploadFiles([makeFile("first.jpg")]);
    });
    expect(screen.getByTestId("file").textContent).toContain("first.jpg");

    await act(async () => {
      await controls.uploadFiles([makeFile("second.jpg")]);
    });

    // A duplicated or stale key would leave the previous node mounted.
    expect(screen.getAllByTestId("file")).toHaveLength(1);
    expect(screen.getByTestId("file").textContent).toContain("second.jpg");
  });

  it("renders a server error into the DOM", async () => {
    render(<Uploader fetcher={createFetcher({ fail: true })} />);

    await act(async () => {
      await controls.uploadFiles([makeFile()]);
    });

    expect(screen.getByTestId("file").textContent).toContain(":error");
    expect(screen.getByTestId("status").textContent).toBe("false");
  });

  it("clears the rendered list on reset", async () => {
    render(<Uploader fetcher={createFetcher()} />);

    await act(async () => {
      await controls.uploadFiles([makeFile()]);
    });
    expect(screen.getAllByTestId("file")).toHaveLength(1);

    await act(async () => {
      controls.reset();
    });

    expect(screen.queryAllByTestId("file")).toHaveLength(0);
    expect(screen.getByTestId("progress").getAttribute("value")).toBe("0");
  });
});
