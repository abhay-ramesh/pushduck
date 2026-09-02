/**
 * Shared fixtures for the registry component tests.
 *
 * The components are tested against the **real** `useUploadRoute`, not a mock.
 * A mocked hook would only assert that the component calls the API this file
 * imagines it has — which is precisely the class of error that let the docs
 * advertise `UploadButton` and `UploadDropzone` for months before either
 * existed. Only `fetch` is replaced, because the alternative is a real bucket.
 */

import { vi } from "vitest";

export function makeFile(
  name = "photo.jpg",
  size = 1000,
  type = "image/jpeg"
): File {
  return new File([new Uint8Array(size)], name, { type });
}

/**
 * Installs a `fetch` that answers the presign and completion calls.
 *
 * Returns the spy so a test can assert an upload was actually attempted, which
 * is the difference between "the button rendered" and "the button works".
 */
export function installFetch(options: { fail?: boolean } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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

  vi.stubGlobal("fetch", fetchMock);

  // The components do not expose a `transport`, so the bytes leg would reach
  // `XMLHttpRequest`. happy-dom has one but no server; this makes it resolve.
  class StubXHR {
    upload = { onprogress: null as unknown };
    status = 200;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    open() {}
    setRequestHeader() {}
    getResponseHeader() {
      return '"etag"';
    }
    send() {
      // Asynchronously, so the component observes an `uploading` state first.
      setTimeout(() => this.onload?.(), 0);
    }
    abort() {
      this.onabort?.();
    }
  }

  vi.stubGlobal("XMLHttpRequest", StubXHR);

  return fetchMock;
}

/** True when a presign request was issued — i.e. an upload really started. */
export function presignWasCalled(fetchMock: ReturnType<typeof vi.fn>): boolean {
  return fetchMock.mock.calls.some((call) =>
    String(call[0]).includes("action=presign")
  );
}

/** Builds a `DataTransfer`-like payload for a synthetic drop event. */
export function dropPayload(files: File[]) {
  return {
    dataTransfer: {
      files,
      items: files.map((file) => ({ kind: "file", type: file.type })),
      types: ["Files"],
    },
  };
}
