/**
 * @fileoverview pushduck under the Bun runtime, including Elysia.
 *
 * `framework-mounting.test.ts` used to carry this note:
 *
 * > Elysia and Bun are absent because they require the Bun runtime; their
 * > mounting pattern is identical to Hono's, which is covered here.
 *
 * The reasoning was sound and the conclusion was still an assumption. "Same
 * mounting pattern" is exactly the argument that would also have predicted
 * Express 5 works — and Express 5 threw on the documented route pattern. A
 * runtime is not a detail you can reason past: Bun ships its own
 * `Request`/`Response`/`fetch`, its own HTTP server, and its own TypeScript
 * loader.
 *
 * Vitest runs on Node, so a Bun test written here would still execute on Node
 * and prove nothing. Instead this spawns the real `bun` binary against
 * `fixtures/bun-server.ts`, which starts real servers on real ports and reports
 * each check as JSON.
 *
 * Skips — genuinely — when Bun is not installed, so contributors without it are
 * not blocked. CI installs it, so the coverage is not optional there.
 */

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

const FIXTURE = resolve(__dirname, "fixtures/bun-server.ts");

async function bunAvailable(): Promise<boolean> {
  try {
    await run("bun", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

const available = await bunAvailable();
if (!available) {
  console.warn(
    "[bun-runtime] `bun` not found on PATH — suite SKIPPED. Install from https://bun.sh"
  );
}

type Check = { name: string; ok: boolean; detail?: string };

/**
 * Runs the fixture once and returns its checks.
 *
 * A non-zero exit is not treated as a harness failure: the fixture exits 1 when
 * a check fails, and the per-check detail is far more useful than "exit 1". A
 * missing results line *is* a harness failure, and says so.
 */
async function runFixture(): Promise<Check[]> {
  let stdout: string;

  try {
    ({ stdout } = await run("bun", ["run", FIXTURE], {
      timeout: 60_000,
      // Bun writes the config banner to stdout too; the marker line is what
      // the harness reads.
      maxBuffer: 10 * 1024 * 1024,
    }));
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    stdout = failure.stdout ?? "";
    if (!stdout.includes("__RESULTS__")) {
      throw new Error(
        `Bun fixture did not run: ${failure.stderr?.slice(0, 2000) ?? error}`
      );
    }
  }

  const line = stdout
    .split("\n")
    .find((candidate) => candidate.startsWith("__RESULTS__"));

  if (!line) {
    throw new Error(`Bun fixture produced no results. stdout:\n${stdout}`);
  }

  return JSON.parse(line.slice("__RESULTS__".length)) as Check[];
}

// One spawn, shared by every assertion: starting Bun and compiling the fixture
// costs far more than the checks themselves.
const results = available ? await runFixture() : [];

function check(name: string) {
  const found = results.find((result) => result.name === name);
  if (!found) {
    throw new Error(
      `No such check: "${name}". Ran: ${results.map((r) => r.name).join(", ")}`
    );
  }
  return found;
}

describe.skipIf(!available)("Bun runtime", () => {
  it("ran every check in the fixture", () => {
    // Guards against the fixture silently exiting early — a thrown error
    // between blocks would otherwise leave later checks simply absent, and
    // every remaining assertion would fail with a confusing "no such check".
    expect(results.length).toBe(11);
  });

  it("serves a presign request through Bun.serve", () => {
    const result = check("Bun.serve — presign");
    expect(result.detail ?? "ok").toBe("ok");
    expect(result.ok).toBe(true);
  });

  it("serves route introspection through Bun.serve", () => {
    expect(check("Bun.serve — introspection").ok).toBe(true);
  });

  it("maps a rejecting middleware to 401 under Bun", () => {
    // Status mapping crosses the runtime's own Response implementation, which
    // is precisely what a Node-only test cannot exercise.
    expect(check("Bun.serve — middleware rejection maps to 401").ok).toBe(true);
  });

  it("succeeds when credentials are supplied", () => {
    expect(check("Bun.serve — succeeds with credentials").ok).toBe(true);
  });

  it("reports an oversized file per-file rather than failing the request", () => {
    expect(
      check("Bun.serve — oversized file is rejected per-file, not per-request")
        .ok
    ).toBe(true);
  });
});

describe.skipIf(!available)("Elysia", () => {
  it("serves a presign request mounted with .all", () => {
    const result = check("Elysia .all — presign");
    expect(result.detail ?? "ok").toBe("ok");
    expect(result.ok).toBe(true);
  });

  it("serves route introspection mounted with .all", () => {
    expect(check("Elysia .all — introspection").ok).toBe(true);
  });

  it("serves a presign request with split .get/.post handlers", () => {
    // The exact snippet in docs/integrations/elysia.
    expect(check("Elysia .get/.post — presign").ok).toBe(true);
  });

  it("serves introspection with split .get/.post handlers", () => {
    expect(check("Elysia .get/.post — introspection").ok).toBe(true);
  });

  it("serves a presign request mounted with .mount", () => {
    // Elysia's WinterCG interop, and the more idiomatic mounting of the two.
    expect(check("Elysia .mount — presign").ok).toBe(true);
  });

  it("propagates a 401 rather than flattening it to 500", () => {
    expect(check("Elysia — middleware rejection maps to 401").ok).toBe(true);
  });
});
