/**
 * @fileoverview An in-memory object store that answers the S3 API over `fetch`.
 *
 * Tests that exercise the full upload flow need storage that behaves like
 * storage: an object exists after a `PUT` and not before, a `HEAD` reports the
 * bytes that were actually written, a `DELETE` removes them. Stubbing the
 * library's own functions instead would test the stub; this fake sits below
 * the library, at the HTTP boundary, so every request pushduck builds — signed
 * URL, headers, method — is the one a real provider would receive.
 *
 * It is deliberately small: single-object `PUT`/`HEAD`/`GET`/`DELETE` and the
 * multipart lifecycle (create, upload part, list, complete, abort) against
 * path-style or virtual-hosted URLs. Signatures are not checked (that is what
 * the signing tests and the live MinIO suite are for). Anything it does not
 * understand is answered with a 501 so a test never silently reaches the
 * network.
 *
 * @example
 * ```ts
 * const storage = installFakeStorage({ bucket: "test-bucket" });
 * afterEach(() => storage.restore());
 * await storage.upload(key, new Uint8Array(1000), "image/jpeg");
 * ```
 */

import { vi } from "vitest";

export interface StoredObject {
  body: Uint8Array;
  contentType: string;
  metadata: Record<string, string>;
  etag: string;
}

export interface FakeStorage {
  /** Objects currently stored, by key. */
  readonly objects: Map<string, StoredObject>;
  /** Every request the fake received, in order. */
  readonly requests: Array<{ method: string; key: string | null; url: string }>;
  /** Stores an object as if a client had PUT it to a presigned URL. */
  upload(key: string, body: Uint8Array, contentType?: string): Promise<void>;
  /** Removes the fetch stub. */
  restore(): void;
}

/**
 * Replaces `globalThis.fetch` with an S3-shaped store for `bucket`.
 *
 * Requests to any other host fall through to a 501, never to the network.
 */
export function installFakeStorage(options: { bucket: string }): FakeStorage {
  const { bucket } = options;
  const objects = new Map<string, StoredObject>();
  const requests: FakeStorage["requests"] = [];
  /** In-progress multipart uploads: uploadId → key, content type and parts. */
  const multipart = new Map<
    string,
    { key: string; contentType: string; parts: Map<number, Uint8Array> }
  >();

  /** The object key a request addresses, for either addressing style. */
  const keyOf = (url: URL): string | null => {
    const path = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (url.hostname.startsWith(`${bucket}.`)) return path || null;
    if (path === bucket) return null;
    if (path.startsWith(`${bucket}/`)) return path.slice(bucket.length + 1);
    return null;
  };

  const etagOf = async (body: Uint8Array): Promise<string> => {
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(body));
    return Array.from(new Uint8Array(digest).slice(0, 16))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const objectHeaders = (object: StoredObject): Headers => {
    const headers = new Headers({
      "content-length": String(object.body.byteLength),
      "content-type": object.contentType,
      etag: `"${object.etag}"`,
      "last-modified": new Date(0).toUTCString(),
    });
    for (const [name, value] of Object.entries(object.metadata)) {
      headers.set(`x-amz-meta-${name}`, value);
    }
    return headers;
  };

  const store = async (
    key: string,
    body: Uint8Array,
    contentType: string,
    metadata: Record<string, string> = {}
  ) => {
    objects.set(key, {
      body,
      contentType,
      metadata,
      etag: await etagOf(body),
    });
  };

  const xml = (body: string, status = 200) =>
    new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
      status,
      headers: { "content-type": "application/xml" },
    });

  const handler = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const key = keyOf(url);
    requests.push({ method: request.method, key, url: request.url });

    if (key === null) {
      return new Response("fake storage: unsupported request", { status: 501 });
    }

    const uploadId = url.searchParams.get("uploadId");

    // ── multipart ───────────────────────────────────────────────────────
    if (request.method === "POST" && url.searchParams.has("uploads")) {
      const id = `mp-${multipart.size + 1}-${Date.now()}`;
      multipart.set(id, {
        key,
        contentType:
          request.headers.get("content-type") ?? "application/octet-stream",
        parts: new Map(),
      });
      return xml(
        `<InitiateMultipartUploadResult><Key>${key}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`
      );
    }

    if (uploadId !== null) {
      const upload = multipart.get(uploadId);
      if (!upload || upload.key !== key) {
        return xml("<Error><Code>NoSuchUpload</Code></Error>", 404);
      }

      if (request.method === "PUT") {
        const partNumber = Number(url.searchParams.get("partNumber"));
        const body = new Uint8Array(await request.arrayBuffer());
        upload.parts.set(partNumber, body);
        return new Response(null, {
          status: 200,
          headers: { etag: `"${await etagOf(body)}"` },
        });
      }

      if (request.method === "GET") {
        const parts = [...upload.parts.entries()].sort(([a], [b]) => a - b);
        const listed = await Promise.all(
          parts.map(
            async ([n, body]) =>
              `<Part><PartNumber>${n}</PartNumber><ETag>"${await etagOf(body)}"</ETag><Size>${body.byteLength}</Size></Part>`
          )
        );
        return xml(`<ListPartsResult>${listed.join("")}</ListPartsResult>`);
      }

      if (request.method === "POST") {
        const ordered = [...upload.parts.entries()].sort(([a], [b]) => a - b);
        const total = ordered.reduce((sum, [, body]) => sum + body.byteLength, 0);
        const assembled = new Uint8Array(total);
        let offset = 0;
        for (const [, body] of ordered) {
          assembled.set(body, offset);
          offset += body.byteLength;
        }
        await store(key, assembled, upload.contentType);
        multipart.delete(uploadId);
        return xml(
          `<CompleteMultipartUploadResult><Key>${key}</Key><ETag>"${objects.get(key)!.etag}-${ordered.length}"</ETag></CompleteMultipartUploadResult>`
        );
      }

      if (request.method === "DELETE") {
        multipart.delete(uploadId);
        return new Response(null, { status: 204 });
      }
    }

    // ── single objects ──────────────────────────────────────────────────
    switch (request.method) {
      case "PUT": {
        const metadata: Record<string, string> = {};
        request.headers.forEach((value, name) => {
          if (name.startsWith("x-amz-meta-")) metadata[name.slice(11)] = value;
        });
        await store(
          key,
          new Uint8Array(await request.arrayBuffer()),
          request.headers.get("content-type") ?? "application/octet-stream",
          metadata
        );
        return new Response(null, {
          status: 200,
          headers: { etag: `"${objects.get(key)!.etag}"` },
        });
      }
      case "HEAD": {
        const object = objects.get(key);
        return object
          ? new Response(null, { status: 200, headers: objectHeaders(object) })
          : new Response(null, { status: 404 });
      }
      case "GET": {
        const object = objects.get(key);
        return object
          ? new Response(new Uint8Array(object.body), {
              status: 200,
              headers: objectHeaders(object),
            })
          : new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
      }
      case "DELETE":
        objects.delete(key);
        return new Response(null, { status: 204 });
      default:
        return new Response("fake storage: unsupported method", { status: 501 });
    }
  };

  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(handler);

  return {
    objects,
    requests,
    upload: (key, body, contentType = "application/octet-stream") =>
      store(key, body, contentType),
    restore: () => spy.mockRestore(),
  };
}
