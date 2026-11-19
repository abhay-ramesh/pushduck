/**
 * @fileoverview True end-to-end: presign → real PUT → complete, against MinIO.
 *
 * Every other test in this suite stubs the storage leg. That leaves the single
 * most failure-prone part of the library — SigV4 signing — verified only
 * against our own expectations of the algorithm. A signature can be
 * self-consistently wrong: the unit tests assert the string we build, not that
 * a real S3 server accepts it.
 *
 * These tests move real bytes to a real S3-compatible server, so a signing
 * regression fails here rather than in a user's production bucket.
 *
 * ## Running
 *
 * ```bash
 * docker run -d --rm --name pushduck-minio -p 9010:9000 \
 *   -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
 *   minio/minio server /data
 * docker exec pushduck-minio mc alias set local http://127.0.0.1:9000 minioadmin minioadmin
 * docker exec pushduck-minio mc mb local/test-uploads
 * ```
 *
 * Skipped automatically when MinIO is unreachable, so the suite still runs on a
 * machine without Docker.
 */

import { describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { createStorage } from "../core/storage/storage-api";
import { UploadError } from "../core/errors";
import { uploadFiles } from "../core/upload";
import { createFetchTransport } from "../core/upload/transport";

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? "http://127.0.0.1:9010";
const BUCKET = process.env.MINIO_BUCKET ?? "test-uploads";

/** MinIO may not be running; the suite must degrade rather than fail. */
async function minioAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${MINIO_ENDPOINT}/minio/health/live`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Resolved at module load, not in `beforeAll`, so the suite can genuinely
 * **skip** rather than pass vacuously.
 *
 * An early `return` inside each test would report green on a machine with no
 * Docker, which reads as "signing is verified" when nothing ran — the most
 * misleading state a test suite can be in.
 */
const available = await minioAvailable();

if (!available) {
  console.warn(
    `[minio-integration] MinIO unreachable at ${MINIO_ENDPOINT} — suite SKIPPED. ` +
      `Start it with: pnpm minio`
  );
}

function buildStack(options: { requireAuth?: boolean } = {}) {
  const { s3, config } = createUploadConfig()
    .provider("minio", {
      endpoint: MINIO_ENDPOINT,
      bucket: BUCKET,
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
      region: "us-east-1",
      useSSL: false,
    })
    .build();

  const base = s3.file().maxFileSize("10MB");
  const route = options.requireAuth
    ? base.middleware(async ({ req }) => {
        if (!req.headers.get("authorization")) {
          throw new UploadError("UNAUTHORIZED", "Sign in to upload");
        }
        return { userId: "u1" };
      })
    : base;

  const router = s3.createRouter({ docUpload: route });

  /** Routes the client's server calls straight into the real handler. */
  const fetcher = async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input).startsWith("http")
      ? String(input)
      : `http://localhost${String(input)}`;
    return router.handler(new Request(url, init));
  };

  // Reading objects back goes through a presigned download URL rather than a
  // bare GET: the test bucket is private (as a real one should be), and this
  // exercises the download-signing path, which is separate code from upload
  // signing and has its own history of bugs.
  const storage = createStorage(config);

  return { router, fetcher, config, storage };
}

/** Fetches an object using a pushduck-generated presigned download URL. */
async function readBack(
  storage: ReturnType<typeof createStorage>,
  key: string
): Promise<Response> {
  const url = await storage.download.presignedUrl(key, 60);
  return fetch(url);
}

/**
 * Real network transport for the storage leg.
 *
 * `fetch` rather than the default XHR transport, because there is no
 * XMLHttpRequest in Node — this is the same substitution a Node or Workers
 * consumer would make.
 */
const realTransport = createFetchTransport();

function makeFile(name: string, contents: string, type = "text/plain"): File {
  return new File([new TextEncoder().encode(contents)], name, { type });
}

describe.skipIf(!available)("MinIO end-to-end", () => {
  it("uploads real bytes and stores them retrievably", async () => {
    const stack = buildStack();
    const { fetcher } = stack;
    const contents = `hello from pushduck ${Date.now()}`;

    const result = await uploadFiles({
      files: [makeFile("greeting.txt", contents)],
      route: "docUpload",
      endpoint: "/api/upload",
      fetcher,
      transport: realTransport,
    });

    expect(result.failedFiles).toEqual([]);
    expect(result.files).toHaveLength(1);

    const uploaded = result.files[0];
    expect(uploaded.status).toBe("success");
    expect(uploaded.key).toBeTruthy();

    // The real proof: read the object back out of storage.
    const stored = await readBack(stack.storage, uploaded.key!);
    expect(stored.status).toBe(200);
    expect(await stored.text()).toBe(contents);
  });

  it("signs a presigned PUT that MinIO accepts", async () => {
    // Isolates the signing step: a self-consistently wrong signature passes
    // the unit tests but fails here with 403 SignatureDoesNotMatch.
    const { router } = buildStack();

    const response = await router.handler(
      new Request("http://localhost/api/upload?route=docUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "signed.txt", size: 5, type: "text/plain" }],
        }),
      })
    );

    const { results } = await response.json();
    const { presignedUrl, requiredHeaders } = results[0];

    const put = await fetch(presignedUrl, {
      method: "PUT",
      headers: requiredHeaders,
      body: "hello",
    });

    expect(put.status).toBe(200);
  });

  it("refuses a body of any size but the one declared at presign", async () => {
    // The route's maxFileSize is checked against the declared size; signing
    // that size is what makes it hold for the bytes that arrive.
    const { router } = buildStack();

    const response = await router.handler(
      new Request("http://localhost/api/upload?route=docUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "sized.txt", size: 5, type: "text/plain" }],
        }),
      })
    );

    const { results } = await response.json();
    const { presignedUrl, requiredHeaders } = results[0];
    const put = (body: string) =>
      fetch(presignedUrl, { method: "PUT", headers: requiredHeaders, body });

    expect((await put("hello, and then some")).status).toBe(403);
    expect((await put("hi")).status).toBe(403);
    expect((await put("hello")).status).toBe(200);
  });

  it("rejects a tampered presigned URL", async () => {
    // Confirms the signature actually covers the object key — if it did not,
    // any client could redirect an upload to an arbitrary path.
    const { router } = buildStack();

    const response = await router.handler(
      new Request("http://localhost/api/upload?route=docUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "original.txt", size: 5, type: "text/plain" }],
        }),
      })
    );

    const { results } = await response.json();
    const tampered = results[0].presignedUrl.replace(
      "original.txt",
      "somewhere-else.txt"
    );

    const put = await fetch(tampered, {
      method: "PUT",
      headers: results[0].requiredHeaders,
      body: "hello",
    });

    expect(put.status).toBeGreaterThanOrEqual(400);
  });

  it("uploads several files in one batch", async () => {
    const stack = buildStack();
    const { fetcher } = stack;

    const result = await uploadFiles({
      files: [
        makeFile("one.txt", "first"),
        makeFile("two.txt", "second"),
        makeFile("three.txt", "third"),
      ],
      route: "docUpload",
      endpoint: "/api/upload",
      fetcher,
      transport: realTransport,
    });

    expect(result.files).toHaveLength(3);
    expect(result.failedFiles).toEqual([]);

    const bodies = await Promise.all(
      result.files.map((f) =>
        readBack(stack.storage, f.key!).then((r) => r.text())
      )
    );
    expect(bodies.sort()).toEqual(["first", "second", "third"]);
  });

  it("preserves the declared content type on the stored object", async () => {
    const stack = buildStack();
    const { fetcher } = stack;

    const result = await uploadFiles({
      files: [makeFile("data.json", '{"a":1}', "application/json")],
      route: "docUpload",
      endpoint: "/api/upload",
      fetcher,
      transport: realTransport,
    });

    const stored = await readBack(stack.storage, result.files[0].key!);
    expect(stored.status).toBe(200);
    expect(stored.headers.get("content-type")).toBe("application/json");
  });

  it("carries a typed 401 all the way to the client against real storage", async () => {
    const { fetcher } = buildStack({ requireAuth: true });

    const error = await uploadFiles({
      files: [makeFile("denied.txt", "nope")],
      route: "docUpload",
      endpoint: "/api/upload",
      fetcher,
      transport: realTransport,
    }).catch((e: UploadError) => e);

    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).code).toBe("UNAUTHORIZED");
    expect((error as UploadError).status).toBe(401);
  });

  it("runs the completion step and returns a key the storage API resolves", async () => {
    const stack = buildStack();

    const result = await uploadFiles({
      files: [makeFile("complete.txt", "done")],
      route: "docUpload",
      endpoint: "/api/upload",
      fetcher: stack.fetcher,
      transport: realTransport,
    });

    const uploaded = result.files[0];
    expect(uploaded.url).toBeTruthy();
    expect(uploaded.key).toBeTruthy();

    const stored = await readBack(stack.storage, uploaded.key!);
    expect(stored.status).toBe(200);
    expect(await stored.text()).toBe("done");
  });

  it("signs download URLs against the same host it uploads to", async () => {
    // Upload and download signing are separate code paths. A download URL
    // signed against the wrong host produces a 403 that only appears with a
    // real server — exactly the class of bug a stubbed test cannot catch.
    const stack = buildStack();

    await uploadFiles({
      files: [makeFile("download-check.txt", "readable")],
      route: "docUpload",
      endpoint: "/api/upload",
      fetcher: stack.fetcher,
      transport: realTransport,
    });

    const url = await stack.storage.download.presignedUrl(
      "download-check.txt",
      60
    );
    expect(url).toContain(new URL(MINIO_ENDPOINT).host);

    const stored = await fetch(url);
    expect(stored.status).toBe(200);
    expect(await stored.text()).toBe("readable");
  });
});

describe.skipIf(!available)("Unicode object keys against real storage", () => {
  /**
   * The key fix is only worth anything if a Unicode key actually round-trips.
   * A presigned URL puts the key in the path, where it must be percent-encoded
   * *and* signed consistently — encode it in one place and not the other and
   * the signature fails. No unit test can catch that; only a real server can.
   */
  it("uploads and reads back a file with a CJK name", async () => {
    const { s3, config } = createUploadConfig()
      .provider("minio", {
        endpoint: MINIO_ENDPOINT,
        bucket: BUCKET,
        accessKeyId: "minioadmin",
        secretAccessKey: "minioadmin",
        region: "us-east-1",
        useSSL: false,
      })
      .build();

    const storage = createStorage(config);
    const router = s3.createRouter({ doc: s3.file().maxFileSize("5MB") });

    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const name = `文档-${Date.now()}.pdf`;

    const response = await router.handler(
      new Request("http://localhost/api/upload?route=doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name, size: bytes.length, type: "application/pdf" }],
        }),
      })
    );

    const { results } = await response.json();
    const presigned = results[0];

    // The key keeps the original characters rather than collapsing to `.pdf`.
    expect(presigned.key).toContain("文档");

    const put = await fetch(presigned.presignedUrl, {
      method: "PUT",
      body: bytes,
      headers: presigned.requiredHeaders ?? {},
    });
    expect(put.status, await put.text().catch(() => "")).toBe(200);

    const downloadUrl = await storage.download.presignedUrl(presigned.key, 120);
    const read = await fetch(downloadUrl);
    expect(read.status).toBe(200);
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes);
  }, 30_000);

  it("stores two differently-named CJK files as two objects", async () => {
    // The data-loss case, proven against a real bucket: these used to share a
    // key, so the second upload replaced the first.
    const { s3, config } = createUploadConfig()
      .provider("minio", {
        endpoint: MINIO_ENDPOINT,
        bucket: BUCKET,
        accessKeyId: "minioadmin",
        secretAccessKey: "minioadmin",
        region: "us-east-1",
        useSSL: false,
      })
      .build();

    const storage = createStorage(config);
    const router = s3.createRouter({ doc: s3.file().maxFileSize("5MB") });
    const stamp = Date.now();

    const keys: string[] = [];
    for (const [index, name] of [`文档-${stamp}.pdf`, `写真-${stamp}.pdf`].entries()) {
      const response = await router.handler(
        new Request("http://localhost/api/upload?route=doc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: [{ name, size: 1, type: "application/pdf" }],
          }),
        })
      );
      const { results } = await response.json();
      keys.push(results[0].key);

      const put = await fetch(results[0].presignedUrl, {
        method: "PUT",
        body: new Uint8Array([index]),
        headers: results[0].requiredHeaders ?? {},
      });
      expect(put.status).toBe(200);
    }

    expect(keys[0]).not.toBe(keys[1]);

    // Both objects exist, and each holds its own byte.
    for (const [index, key] of keys.entries()) {
      const url = await storage.download.presignedUrl(key, 120);
      const read = await fetch(url);
      expect(read.status).toBe(200);
      expect(new Uint8Array(await read.arrayBuffer())).toEqual(
        new Uint8Array([index])
      );
    }
  }, 30_000);
});

describe.skipIf(!available)("Storage API against real storage", () => {
  /**
   * The server-side reads, copies and checks that replace a second S3 client.
   * Each one is a differently-shaped signed request (GET with response
   * overrides, PUT with x-amz-copy-source, HEAD), so each is proven against a
   * server that verifies the signature rather than against our own encoder.
   */
  const { storage } = buildStack();
  const run = `storage-api-${Date.now()}`;

  async function put(key: string, body: string, contentType = "text/plain") {
    await storage.upload.file(Buffer.from(body), key, { contentType });
  }

  it("stores Content-Type, Cache-Control and metadata from upload.file", async () => {
    const key = `${run}/upload.txt`;
    await storage.upload.file(Buffer.from("cached"), key, {
      contentType: "text/plain",
      cacheControl: "public, max-age=60",
      metadata: { owner: "u1" },
    });

    const served = await fetch(await storage.download.presignedUrl(key, 60));
    expect(served.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await storage.metadata.getCustom(key)).toEqual({ owner: "u1" });
  });

  it("reads an object as a stream, bytes and text", async () => {
    const key = `${run}/read.txt`;
    await put(key, "hello world");

    const object = await storage.download.get(key);
    expect(object.size).toBe(11);
    expect(object.contentType).toBe("text/plain");
    expect(object.etag).toMatch(/^[0-9a-f]{32}$/);
    expect(object.lastModified).toBeInstanceOf(Date);
    expect(await new Response(object.body).text()).toBe("hello world");

    expect(await storage.download.text(key)).toBe("hello world");
    expect(await storage.download.bytes(key)).toEqual(
      new TextEncoder().encode("hello world")
    );
  });

  it("throws NOT_FOUND reading a missing object", async () => {
    await expect(storage.download.get(`${run}/nope.txt`)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("builds a Response with the object's headers and a download name", async () => {
    const key = `${run}/report.pdf`;
    await put(key, "%PDF-1.4", "application/pdf");

    const response = await storage.download.response(key, {
      filename: "Q3 報告.pdf",
      cacheControl: "private, max-age=0",
    });
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-length")).toBe("8");
    expect(response.headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(response.headers.get("cache-control")).toBe("private, max-age=0");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="Q3 __.pdf"; filename*=UTF-8''Q3%20%E5%A0%B1%E5%91%8A.pdf`
    );
    expect(await response.text()).toBe("%PDF-1.4");
  });

  it("serves a presigned URL with the signed Content-Disposition and Content-Type", async () => {
    const key = `${run}/invoice.bin`;
    await put(key, "data", "application/octet-stream");

    const url = await storage.download.presignedUrl(key, {
      expiresIn: 60,
      disposition: "attachment",
      filename: `Invoice "May" — résumé.pdf`,
      contentType: "application/pdf",
    });
    const served = await fetch(url);

    // The provider accepted the signature over the overrides and echoed them.
    expect(served.status, await served.clone().text()).toBe(200);
    expect(served.headers.get("content-disposition")).toBe(
      `attachment; filename="Invoice May _ r_sum_.pdf"; ` +
        `filename*=UTF-8''Invoice%20May%20%E2%80%94%20r%C3%A9sum%C3%A9.pdf`
    );
    expect(served.headers.get("content-type")).toBe("application/pdf");
    expect(await served.text()).toBe("data");
  });

  it("rejects a presigned URL whose filename was changed after signing", async () => {
    const key = `${run}/tamper.txt`;
    await put(key, "x");

    const url = new URL(
      await storage.download.presignedUrl(key, { filename: "a.txt" })
    );
    url.searchParams.set("response-content-disposition", "attachment; filename=evil.exe");
    expect((await fetch(url)).status).toBe(403);
  });

  it("copies an object whose key needs URL-encoding", async () => {
    const from = `${run}/a b+c é.txt`;
    const to = `${run}/copied.txt`;
    await put(from, "copy me", "text/markdown");

    await storage.copy.file(from, to);
    expect(await storage.download.text(to)).toBe("copy me");
    expect(await storage.metadata.getContentType(to)).toBe("text/markdown");
    expect(await storage.validation.exists(from)).toBe(true);
  });

  it("replaces metadata on copy and keeps the content type", async () => {
    const from = `${run}/meta-src.json`;
    const to = `${run}/meta-dst.json`;
    await storage.upload.file(Buffer.from("{}"), from, {
      contentType: "application/json",
      metadata: { stage: "draft" },
    });

    await storage.copy.file(from, to, { metadata: { stage: "final" } });
    const info = await storage.metadata.getInfo(to);
    expect(info.metadata).toEqual({ stage: "final" });
    expect(info.contentType).toBe("application/json");
  });

  it("sets metadata in place", async () => {
    const key = `${run}/in-place.txt`;
    await put(key, "x");
    await storage.metadata.setCustom(key, { reviewed: "yes" });
    expect(await storage.metadata.getCustom(key)).toEqual({ reviewed: "yes" });
    expect(await storage.metadata.getContentType(key)).toBe("text/plain");
  });

  it("moves an object", async () => {
    const from = `${run}/move-src.txt`;
    const to = `${run}/move-dst.txt`;
    await put(from, "moving");

    await storage.move.file(from, to);
    expect(await storage.download.text(to)).toBe("moving");
    expect(await storage.validation.exists(from)).toBe(false);
  });

  it("throws NOT_FOUND copying a missing object", async () => {
    await expect(
      storage.copy.file(`${run}/missing.txt`, `${run}/never.txt`)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("exists: true, false for 404, and throws rather than false on 403", async () => {
    const key = `${run}/exists.txt`;
    await put(key, "x");
    expect(await storage.validation.exists(key)).toBe(true);
    expect(await storage.validation.exists(`${run}/absent.txt`)).toBe(false);
    expect(await storage.validation.existsWithInfo(`${run}/absent.txt`)).toBeNull();

    // A credential the server rejects: the 403 must surface, not read as
    // "missing" — the bug that made apps treat every R2 403 as absent.
    const { config: denied } = createUploadConfig()
      .provider("minio", {
        endpoint: MINIO_ENDPOINT,
        bucket: BUCKET,
        accessKeyId: "minioadmin",
        secretAccessKey: "wrong-secret",
        region: "us-east-1",
        useSSL: false,
      })
      .build();
    await expect(
      createStorage(denied).validation.exists(key)
    ).rejects.toMatchObject({ code: "STORAGE_ACCESS_DENIED" });
  });
});
