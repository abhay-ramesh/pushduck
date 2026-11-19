/**
 * @fileoverview The object-key chokepoint.
 *
 * Every key a route produces passes through `resolveKey`, which refuses what
 * cannot be made safe and re-sanitises each segment of what is left. The
 * cases live in `fixtures/key-cases.json`, which the Python and Go suites read
 * too, so a fragment resolves to the same key — or is refused — and a filename
 * gets the same default key, whichever server answers.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { resetS3Client } from "../core/storage/client";
import { resolveKey, sanitizeFilename } from "../core/storage/keys";
import { isUploadError } from "../core/errors";
import { readFileSync } from "node:fs";
import { installFakeStorage, type FakeStorage } from "./fixtures/fake-storage";

interface KeyCases {
  accept: Array<{ fragment: string; key: string }>;
  reject: Array<{ fragment: string; rule: string }>;
  default: Array<{ name: string; key: string }>;
}

const cases: KeyCases = JSON.parse(
  readFileSync(new URL("./fixtures/key-cases.json", import.meta.url), "utf8")
);

function rejection(fragment: string) {
  try {
    resolveKey(fragment);
  } catch (error) {
    return error;
  }
  throw new Error(`${JSON.stringify(fragment.slice(0, 40))} was accepted`);
}

describe("resolveKey: the shared case table", () => {
  it.each(cases.accept.map((c) => [c.fragment.slice(0, 40), c] as const))(
    "accepts %j",
    (_label, { fragment, key }) => {
      expect(resolveKey(fragment)).toBe(key);
    }
  );

  it.each(cases.reject.map((c) => [c.rule, c.fragment.slice(0, 40), c] as const))(
    "rejects (%s) %j",
    (_rule, _label, { fragment }) => {
      const error = rejection(fragment);
      expect(isUploadError(error)).toBe(true);
      // Reported against the one file, like any other per-file rejection.
      expect((error as { code: string }).code).toBe("VALIDATION_FAILED");
      expect((error as Error).message).toContain("Object key");
    }
  );

  it.each(cases.default.map((c) => [c.name.slice(0, 40), c] as const))(
    "gives %j its default key",
    (_label, { name, key }) => {
      expect(sanitizeFilename(name)).toBe(key);
    }
  );
});

describe("resolveKey", () => {
  it("rejects a string that has no UTF-8 encoding", () => {
    // Go's equivalent case is invalid UTF-8 bytes; a JavaScript string cannot
    // hold those, but it can hold a lone surrogate.
    expect(() => resolveKey("a\ud800b.png")).toThrow(/well-formed/);
  });

  it("rejects a key that is not a string, as a generateKey bug would return", () => {
    expect(() => resolveKey(undefined as unknown as string)).toThrow(/must be a string/);
  });

  it("names the fragment and the rule in the message", () => {
    expect(() => resolveKey("users/../admin/x.png")).toThrow(
      `Object key "users/../admin/x.png" contains an empty, '.' or '..' segment`
    );
  });

  it("re-sanitises each segment exactly as the default key would be", () => {
    for (const name of ["写真 photo.png", "Отчёт.pdf", "a  b__c.png", "***.png"]) {
      expect(resolveKey(`tenant/${name}`)).toBe(`tenant/${sanitizeFilename(name)}`);
    }
  });

  it("leaves every default key unchanged", () => {
    for (const name of ["photo.jpg", "my photo.jpg", "文档.pdf", ".gitignore", "???.pdf"]) {
      const key = sanitizeFilename(name);
      expect(resolveKey(key)).toBe(key);
    }
  });
});

describe("routes pass every key through resolveKey", () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = installFakeStorage({ bucket: "test-bucket" });
  });

  afterEach(() => {
    storage.restore();
    resetS3Client();
  });

  function build() {
    const { s3 } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "key",
        secretAccessKey: "secret",
      })
      .build();

    return s3.createRouter({
      // The shape the audit found: a key built from a value the caller sent.
      folder: s3
        .file()
        .middleware(async ({ metadata }) => ({
          folder: String((metadata as { folder?: unknown })?.folder ?? ""),
        }))
        .paths({
          generateKey: ({ file, metadata }) => `tenants/${metadata.folder}/${file.name}`,
        }),
      plain: s3.file(),
    });
  }

  async function presign(
    router: ReturnType<typeof build>,
    route: string,
    files: Array<{ name: string; size: number; type: string }>,
    metadata?: Record<string, unknown>
  ) {
    const response = await router.handler(
      new Request(`http://localhost/api/upload?route=${route}&action=presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, metadata }),
      })
    );
    return { status: response.status, body: await response.json() };
  }

  const file = { name: "report.pdf", size: 10, type: "application/pdf" };

  it("refuses a generateKey that interpolates ../ from the caller's metadata", async () => {
    const { status, body } = await presign(build(), "folder", [file], {
      folder: "../../other-tenant",
    });

    expect(status).toBe(200);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toContain(`"tenants/../../other-tenant/report.pdf"`);
    expect(body.results[0].code).toBe("VALIDATION_FAILED");
    expect(body.results[0].presignedUrl).toBeUndefined();
  });

  it("re-sanitises a generateKey's segments", async () => {
    const { body } = await presign(build(), "folder", [{ ...file, name: "my report.pdf" }], {
      folder: "acme corp",
    });

    expect(body.results[0].key).toBe("tenants/acme_corp/my_report.pdf");
  });

  it("fails only the file whose key was refused", async () => {
    // generateKey interpolates the raw filename, so one file's name escapes
    // and the other's does not.
    const { status, body } = await presign(
      build(),
      "folder",
      [{ ...file, name: "../../escape.pdf" }, file],
      { folder: "acme" }
    );

    expect(status).toBe(200);
    expect(body.results.map((r: { success: boolean }) => r.success)).toEqual([false, true]);
    expect(body.results[1].key).toBe("tenants/acme/report.pdf");
  });

  it("refuses an empty segment rather than collapsing it", async () => {
    // `tenants//report.pdf`. Collapsing it to `tenants/report.pdf` would
    // silently drop the scope the route meant to apply.
    const { body } = await presign(build(), "folder", [file], { folder: "" });

    expect(body.results[0].success).toBe(false);
  });

  it("keeps the default key as the sanitised filename", async () => {
    const { body } = await presign(build(), "plain", [{ ...file, name: "../../etc/passwd" }]);

    expect(body.results[0].success).toBe(true);
    expect(body.results[0].key).toBe(sanitizeFilename("../../etc/passwd"));
    expect(body.results[0].key).not.toContain("/");
  });
});
