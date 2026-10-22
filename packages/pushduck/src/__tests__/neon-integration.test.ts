/**
 * @fileoverview End-to-end against a live Neon Object Storage branch.
 *
 * The MinIO suites prove pushduck's SigV4 against *a* real server. This proves
 * it against Neon specifically, where three things can only fail live: the
 * region read from the branch endpoint, path-style addressing, and that a
 * configured ACL is never sent (Neon answers S3 ACL writes with 501).
 *
 * ## Running
 *
 * Create a private bucket (and optionally a `public_read` one) and a
 * credential with `storage:read` and `storage:write`, then:
 *
 * ```bash
 * neon env pull --file .env.neon   # AWS_ENDPOINT_URL_S3, AWS_REGION, keys
 * NEON_STORAGE_BUCKET=pushduck-uploads \
 * NEON_STORAGE_PUBLIC_BUCKET=pushduck-public \
 *   npx dotenvx run -f .env.neon -- vitest run src/__tests__/neon-integration.test.ts
 * ```
 *
 * Skipped unless `NEON_STORAGE_BUCKET` and a Neon `AWS_ENDPOINT_URL_S3` are
 * set, so it never runs against AWS credentials that happen to be exported.
 */

import { afterAll, describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { createStorage } from "../core/storage/storage-api";
import { uploadFiles } from "../core/upload";
import { MIB } from "../core/upload/multipart/limits";
import { createFetchTransport } from "../core/upload/transport";

const ENDPOINT = process.env.AWS_ENDPOINT_URL_S3 ?? "";
const BUCKET = process.env.NEON_STORAGE_BUCKET ?? "";
const PUBLIC_BUCKET = process.env.NEON_STORAGE_PUBLIC_BUCKET ?? "";

const available =
  Boolean(BUCKET) &&
  /\.neon\.tech\/?$/.test(ENDPOINT) &&
  Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

if (!available) {
  console.warn(
    "[neon-integration] NEON_STORAGE_BUCKET / AWS_ENDPOINT_URL_S3 not set — suite SKIPPED.",
  );
}

/** Every key written here, so the bucket is left as it was found. */
const written: Array<{ bucket: string; key: string }> = [];

function buildStack(
  options: { bucket?: string; acl?: string; maxFileSize?: string } = {},
) {
  const bucket = options.bucket ?? BUCKET;
  const { upload: builder, config } = createUploadConfig()
    .provider("neonStorage", {
      endpoint: ENDPOINT,
      bucket,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      // Deliberately no region: it must come from the endpoint hostname.
      ...(options.acl ? { acl: options.acl } : {}),
    })
    .build();

  const router = builder.createRouter({
    upload: builder.file().maxSize(options.maxFileSize ?? "100MB"),
  });

  const fetcher = async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input).startsWith("http")
      ? String(input)
      : `http://localhost${String(input)}`;
    return router.handler(new Request(url, init));
  };

  const storage = createStorage(config);

  async function upload(files: File[], multipart?: Record<string, number>) {
    const result = await uploadFiles({
      files,
      route: "upload",
      endpoint: "/api/upload",
      fetcher,
      transport: createFetchTransport(),
      ...(multipart ? { multipart } : {}),
    } as never);
    for (const file of result.files) {
      if (file.key) written.push({ bucket, key: file.key });
    }
    return result;
  }

  return { router, config, storage, upload };
}

function patternedBytes(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  for (let i = 0; i < size; i++) bytes[i] = i % 251;
  return bytes;
}

async function readBack(
  storage: ReturnType<typeof createStorage>,
  key: string,
): Promise<Response> {
  return fetch(await storage.download.presignedUrl(key, 60));
}

afterAll(async () => {
  if (!available) return;
  for (const bucket of new Set(written.map((w) => w.bucket))) {
    const keys = written.filter((w) => w.bucket === bucket).map((w) => w.key);
    await buildStack({ bucket }).storage.delete.files(keys);
  }
});

describe.skipIf(!available)("Neon Object Storage end-to-end", () => {
  it("reaches the bucket with the region read from the endpoint", async () => {
    const { config, storage } = buildStack();

    expect(config.provider.region).toMatch(/^[a-z]{2}-[a-z]+-\d$/);
    const connection = await storage.validation.connection();
    expect(connection.success, JSON.stringify(connection)).toBe(true);
  });

  it("uploads real bytes and reads them back", async () => {
    const { storage, upload } = buildStack();
    const contents = `hello from pushduck ${Date.now()}`;

    const result = await upload([
      new File([contents], "greeting.txt", { type: "text/plain" }),
    ]);

    expect(result.failedFiles).toEqual([]);
    const stored = await readBack(storage, result.files[0].key!);
    expect(stored.status).toBe(200);
    expect(await stored.text()).toBe(contents);
    expect(stored.headers.get("content-type")).toBe("text/plain");
  });

  it("rejects a presigned URL whose key was changed", async () => {
    const { router } = buildStack();
    const response = await router.handler(
      new Request("http://localhost/api/upload?route=upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: "original.txt", size: 5, type: "text/plain" }],
        }),
      }),
    );
    const { results } = await response.json();

    const put = await fetch(
      results[0].presignedUrl.replace("original.txt", "elsewhere.txt"),
      { method: "PUT", headers: results[0].requiredHeaders, body: "hello" },
    );

    expect(put.status).toBe(403);
  });

  it("uploads even when an ACL is configured, because it is never sent", async () => {
    const { storage, upload } = buildStack({ acl: "public-read" });

    const result = await upload([
      new File(["acl"], "acl.txt", { type: "text/plain" }),
    ]);

    expect(result.failedFiles).toEqual([]);
    expect((await readBack(storage, result.files[0].key!)).status).toBe(200);
  });

  it("round-trips a Unicode key", async () => {
    const { storage, upload } = buildStack();
    const name = `文档-${Date.now()}.txt`;

    const result = await upload([
      new File(["unicode"], name, { type: "text/plain" }),
    ]);

    expect(result.files[0].key).toContain("文档");
    expect(await (await readBack(storage, result.files[0].key!)).text()).toBe(
      "unicode",
    );
  });

  it("assembles a multipart upload byte-identical", async () => {
    // 13 MiB + change at 5 MiB parts: three parts, the last one short.
    const { storage, upload } = buildStack();
    const expected = patternedBytes(13 * MIB + 7777);

    const result = await upload([new File([expected], "multi.bin")], {
      threshold: 6 * MIB,
      partSize: 5 * MIB,
      concurrency: 3,
    });

    expect(result.failedFiles).toEqual([]);
    const key = result.files[0].key!;
    const info = await storage.metadata.getInfo(key);
    expect(String(info.etag)).toMatch(/-3"?$/);

    const actual = new Uint8Array(
      await (await readBack(storage, key)).arrayBuffer(),
    );
    expect(actual.length).toBe(expected.length);
    expect(actual).toEqual(expected);
  }, 120_000);

  it("lists, inspects, updates metadata and deletes through the storage API", async () => {
    const { storage } = buildStack();
    const prefix = `pushduck-storage-api-${Date.now()}/`;
    const keys = [`${prefix}a.txt`, `${prefix}b.txt`];

    for (const key of keys) {
      await storage.upload.file(Buffer.from(key), key, {
        contentType: "text/plain",
      });
      written.push({ bucket: BUCKET, key });
    }

    const listed = await storage.list.files({ prefix });
    expect(listed.map((f) => f.key).sort()).toEqual(keys);

    expect(await storage.validation.exists(keys[0])).toBe(true);
    expect(await storage.metadata.getSize(keys[0])).toBe(keys[0].length);

    await storage.metadata.setCustom(keys[0], { reviewed: "yes" });
    expect(await storage.metadata.getCustom(keys[0])).toMatchObject({
      reviewed: "yes",
    });

    await storage.delete.files(keys);
    expect(await storage.validation.exists(keys[0])).toBe(false);
    expect(await storage.list.files({ prefix })).toEqual([]);
  }, 60_000);

  it.skipIf(!PUBLIC_BUCKET)(
    "serves a public_read bucket's objects at the plain URL",
    async () => {
      const { storage, upload } = buildStack({ bucket: PUBLIC_BUCKET });

      const result = await upload([
        new File(["public"], "public.txt", { type: "text/plain" }),
      ]);
      const url = storage.download.url(result.files[0].key!);

      expect(
        url.startsWith(`${ENDPOINT.replace(/\/$/, "")}/${PUBLIC_BUCKET}/`),
      ).toBe(true);
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("public");
    },
  );

  it("keeps a private bucket's plain URL closed", async () => {
    const { storage, upload } = buildStack();

    const result = await upload([
      new File(["private"], "private.txt", { type: "text/plain" }),
    ]);

    const response = await fetch(storage.download.url(result.files[0].key!));
    expect(response.status).toBe(403);
  });
});
