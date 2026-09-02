/**
 * @fileoverview The reference server against the conformance suite.
 *
 * `conformance/` is a language-neutral suite meant for Go, Python or Java
 * implementations. Running the TypeScript server through it first is not a
 * formality — it is the only way to know the fixtures describe the protocol as
 * implemented rather than as imagined.
 *
 * That distinction has already cost something once. While writing the Bun
 * tests, the specification's rule that a validation failure is reported *per
 * file* with a 200 was read backwards, and the assertion demanded a 4xx. The
 * reference server disagreed and was right. Anyone implementing from the prose
 * alone would have made the same mistake with nothing to correct them.
 *
 * So a fixture that fails here means one of two things, and both are worth
 * knowing: the fixture misreads the specification, or the server does.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  formatResults,
  runFixture,
  type Fixture,
} from "../../../../conformance/runner/run";
import { createUploadConfig } from "../core/config/upload-config";
import { UploadError } from "../core/errors";

const FIXTURE_DIR = resolve(__dirname, "../../../../conformance/fixtures");

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap(
      (name) =>
        JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as Fixture[]
    );
}

/**
 * The route surface the suite requires, exactly as documented in
 * `conformance/README.md`.
 *
 * Fixed on purpose: without an agreed set of routes and constraints, no
 * fixture could assert anything about validation, and every implementation
 * would be tested against a different server.
 */
function buildConformanceServer() {
  const { s3 } = createUploadConfig()
    .provider("aws", {
      bucket: "conformance-bucket",
      region: "us-east-1",
      accessKeyId: "conformance-key",
      secretAccessKey: "conformance-secret",
    })
    .build();

  return s3.createRouter({
    imageUpload: s3.image().maxFileSize("5MB"),
    fileUpload: s3.file().maxFileSize("50MB"),
    privateUpload: s3
      .file()
      .maxFileSize("5MB")
      .middleware(async ({ req }) => {
        if (req.headers.get("authorization") !== "Bearer conformance-token") {
          throw new UploadError("UNAUTHORIZED", "Sign in to upload");
        }
        return { userId: "conformance-user" };
      }),
  });
}

const router = buildConformanceServer();

/** Drives the router in-process; the runner only needs something fetch-shaped. */
const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) =>
  router.handler(new Request(String(input), init))) as typeof fetch;

const fixtures = loadFixtures();

describe("conformance suite", () => {
  it("loads every fixture file", () => {
    // Guards the glob: a renamed directory would otherwise make the whole
    // suite vacuously pass with zero cases.
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
  });

  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    "%s",
    async (_name, fixture) => {
      const result = await runFixture(fixture, {
        url: "http://localhost/api/upload",
        fetchImpl,
      });

      // The suite's own report is the failure message, because it names the
      // specification section and the reason the rule exists.
      expect(result.passed, formatResults([result])).toBe(true);
    }
  );
});
