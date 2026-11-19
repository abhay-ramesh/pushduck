/**
 * @fileoverview Declarative keys: `.paths({ prefix, name })`.
 *
 * Apps hand-wrote the same sanitise + timestamp + prefix logic in every route,
 * and the bare-filename default silently overwrote one user's file with
 * another's of the same name. A route now says what it means — whose folder,
 * and whether names may collide — and the library builds the key, through the
 * same chokepoint as every other key.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { resetS3Client } from "../core/storage/client";
import { uniqueName } from "../core/storage/keys";
import { installFakeStorage, type FakeStorage } from "./fixtures/fake-storage";

describe("uniqueName", () => {
  it("puts a 10-character base32 id before the extension", () => {
    expect(uniqueName("Q3 report.pdf")).toMatch(/^Q3_report-[0-9a-hjkmnp-tv-z]{10}\.pdf$/);
  });

  it("appends the id to a name with no extension, or a dotfile", () => {
    expect(uniqueName("README")).toMatch(/^README-[0-9a-z]{10}$/);
    expect(uniqueName(".env")).toMatch(/^\.env-[0-9a-z]{10}$/);
  });

  it("keeps non-Latin names", () => {
    expect(uniqueName("文档.pdf")).toMatch(/^文档-[0-9a-z]{10}\.pdf$/);
  });

  it("never repeats", () => {
    const names = new Set(Array.from({ length: 1000 }, () => uniqueName("a.png")));
    expect(names.size).toBe(1000);
  });
});

describe(".paths({ prefix, name })", () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = installFakeStorage({ bucket: "test-bucket" });
  });

  afterEach(() => {
    storage.restore();
    resetS3Client();
  });

  function config(paths?: {
    prefix?: string;
    generateKey?: (file: { name: string }, metadata: unknown) => string;
  }) {
    const builder = createUploadConfig().provider("aws", {
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
    return (paths ? builder.paths(paths) : builder).build().s3;
  }

  async function keyFor(
    router: { handler: (req: Request) => Promise<Response> },
    route: string,
    name = "Q3 report.pdf",
    metadata?: Record<string, unknown>
  ): Promise<string | { refused: string }> {
    const response = await router.handler(
      new Request(`http://localhost/api/upload?route=${route}&action=presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name, size: 10, type: "application/pdf" }],
          metadata,
        }),
      })
    );
    const [result] = (await response.json()).results;
    return result.success ? result.key : { refused: result.error };
  }

  // Stands in for auth middleware: the id comes from the request.
  const user = async ({ metadata }: { metadata: { userId?: unknown } | undefined }) => ({
    userId: String(metadata?.userId ?? ""),
  });

  it("keeps the sanitised filename by default", async () => {
    const s3 = config();
    const router = s3.createRouter({ plain: s3.file() });

    expect(await keyFor(router, "plain")).toBe("Q3_report.pdf");
  });

  it("nests a fixed prefix, with or without a trailing slash", async () => {
    const s3 = config({ prefix: "uploads/" });
    const router = s3.createRouter({
      a: s3.file().paths({ prefix: "documents" }),
      b: s3.file().paths({ prefix: "documents/" }),
    });

    expect(await keyFor(router, "a")).toBe("uploads/documents/Q3_report.pdf");
    expect(await keyFor(router, "b")).toBe("uploads/documents/Q3_report.pdf");
  });

  it("computes a prefix from metadata and sanitises each segment", async () => {
    const s3 = config({ prefix: "uploads" });
    const router = s3.createRouter({
      docs: s3
        .file()
        .middleware(user)
        .paths({ prefix: ({ metadata }) => `users/${metadata.userId}`, name: "unique" }),
    });

    expect(await keyFor(router, "docs", "Q3 report.pdf", { userId: "ada lovelace" })).toMatch(
      /^uploads\/users\/ada_lovelace\/Q3_report-[0-9a-z]{10}\.pdf$/
    );
  });

  it("refuses a computed prefix that would escape or lose its scope", async () => {
    const s3 = config();
    const router = s3.createRouter({
      docs: s3
        .file()
        .middleware(user)
        .paths({ prefix: ({ metadata }) => `users/${metadata.userId}` }),
    });

    // `users/../admin` escapes. `users/` (an empty id) would otherwise
    // collapse to `users/a.pdf`, outside any one user's folder.
    expect(await keyFor(router, "docs", "a.pdf", { userId: "../admin" })).toHaveProperty("refused");
    expect(await keyFor(router, "docs", "a.pdf", { userId: "" })).toHaveProperty("refused");
  });

  it("names with a function, which may add folders", async () => {
    const s3 = config();
    const router = s3.createRouter({
      docs: s3
        .file()
        .middleware(user)
        .paths({
          prefix: "docs",
          name: ({ metadata, file }) => `${metadata.userId}/${file.name}`,
        }),
    });

    expect(await keyFor(router, "docs", "Q3 report.pdf", { userId: "42" })).toBe(
      "docs/42/Q3_report.pdf"
    );
  });

  it("gives every upload of the same name its own key with name: 'unique'", async () => {
    const s3 = config();
    const router = s3.createRouter({ docs: s3.file().paths({ name: "unique" }) });

    expect(await keyFor(router, "docs")).not.toBe(await keyFor(router, "docs"));
  });

  it("puts the global generateKey below the prefixes, as returned", async () => {
    // A global generateKey that also returned the global prefix used to have it
    // stripped again. It returns the part of the key below the prefixes.
    const s3 = config({ prefix: "uploads", generateKey: (file) => `g/${file.name}` });
    const router = s3.createRouter({
      inherits: s3.file().paths({ prefix: "docs" }),
      overrides: s3.file().paths({ prefix: "docs", name: "original" }),
    });

    expect(await keyFor(router, "inherits")).toBe("uploads/docs/g/Q3_report.pdf");
    expect(await keyFor(router, "overrides")).toBe("uploads/docs/Q3_report.pdf");
  });

  it("lets a route's generateKey own the whole key, still checked", async () => {
    const s3 = config({ prefix: "uploads" });
    const router = s3.createRouter({
      raw: s3.file().paths({ prefix: "ignored", generateKey: ({ file }) => `raw/${file.name}` }),
    });

    expect(await keyFor(router, "raw")).toBe("raw/Q3_report.pdf");
  });
});
