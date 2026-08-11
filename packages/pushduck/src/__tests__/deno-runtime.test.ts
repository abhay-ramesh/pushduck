/**
 * @fileoverview pushduck under the Deno runtime, and Fresh's handler shape.
 *
 * Deno is the strictest runtime pushduck claims to support: permissions are
 * off by default, `node:` specifiers must be explicit, and `Request`,
 * `Response` and WebCrypto are all its own implementations. That makes it the
 * runtime most likely to expose a portability mistake — and the least useful
 * one to reason about from a distance.
 *
 * As with Bun, vitest runs on Node, so this spawns the real `deno` binary
 * against `fixtures/deno-server.ts`, which starts real `Deno.serve` listeners
 * and drives real HTTP through them.
 *
 * Skips when Deno is absent, so contributors without it are not blocked. CI
 * installs it.
 */

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

const FIXTURE = resolve(__dirname, "fixtures/deno-server.ts");
const CLIENT_ENTRY = resolve(__dirname, "../client.ts");

/**
 * Deno may be installed to `~/.deno/bin` without being on a non-interactive
 * PATH, which is exactly how it behaves in a spawned test process.
 */
const DENO_PATH = `${process.env.PATH ?? ""}:${process.env.HOME}/.deno/bin`;
const env = { ...process.env, PATH: DENO_PATH };

async function denoAvailable(): Promise<boolean> {
  try {
    await run("deno", ["--version"], { env });
    return true;
  } catch {
    return false;
  }
}

const available = await denoAvailable();
if (!available) {
  console.warn(
    "[deno-runtime] `deno` not found on PATH — suite SKIPPED. Install from https://deno.land"
  );
}

type Check = { name: string; ok: boolean; detail?: string };

async function runFixture(): Promise<Check[]> {
  let stdout: string;

  try {
    ({ stdout } = await run(
      "deno",
      [
        "run",
        // Narrowly scoped on purpose. If the library ever needs a permission
        // it does not need today — filesystem writes, subprocesses — this
        // fails rather than quietly widening what pushduck requires of a Deno
        // Deploy user.
        "--allow-net",
        "--allow-env",
        "--allow-read",
        FIXTURE,
      ],
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024, env }
    ));
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    stdout = failure.stdout ?? "";
    if (!stdout.includes("__RESULTS__")) {
      throw new Error(
        `Deno fixture did not run: ${failure.stderr?.slice(0, 2000) ?? error}`
      );
    }
  }

  const line = stdout
    .split("\n")
    .find((candidate) => candidate.startsWith("__RESULTS__"));

  if (!line) {
    throw new Error(`Deno fixture produced no results. stdout:\n${stdout}`);
  }

  return JSON.parse(line.slice("__RESULTS__".length)) as Check[];
}

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

describe.skipIf(!available)("Deno runtime", () => {
  it("ran every check in the fixture", () => {
    expect(results.length).toBe(7);
  });

  it("serves a presign request through Deno.serve", () => {
    const result = check("Deno.serve — presign");
    expect(result.detail ?? "ok").toBe("ok");
    expect(result.ok).toBe(true);
  });

  it("serves route introspection through Deno.serve", () => {
    expect(check("Deno.serve — introspection").ok).toBe(true);
  });

  it("produces a valid SigV4 signature using Deno's WebCrypto", () => {
    // The check that most justifies running Deno at all: signing is the one
    // piece of real cryptography in the request path, and every runtime brings
    // its own WebCrypto.
    const result = check("Deno — SigV4 signature is well-formed");
    expect(result.ok, result.detail).toBe(true);
  });

  it("maps a rejecting middleware to 401 under Deno", () => {
    expect(check("Deno.serve — middleware rejection maps to 401").ok).toBe(
      true
    );
  });

  it("succeeds when credentials are supplied", () => {
    expect(check("Deno.serve — succeeds with credentials").ok).toBe(true);
  });
});

describe.skipIf(!available)("Fresh", () => {
  it("serves a presign request through Fresh's handler convention", () => {
    const result = check("Fresh handler — presign");
    expect(result.detail ?? "ok").toBe("ok");
    expect(result.ok).toBe(true);
  });

  it("serves route introspection through Fresh's handler convention", () => {
    expect(check("Fresh handler — introspection").ok).toBe(true);
  });
});

describe.skipIf(!available)("client bundle portability", () => {
  it("pulls in no Node built-ins anywhere in its module graph", async () => {
    // A `node:` import in the client entry does not fail under Deno, which
    // resolves them — it fails on Cloudflare Workers and Deno Deploy, where
    // there is no such module. That is a deployment-time failure for a user,
    // far from the commit that caused it.
    //
    // `deno info` resolves the whole transitive graph, so this catches an
    // import added three modules deep in a file nobody thought of as
    // client-side.
    const { stdout } = await run(
      "deno",
      ["info", "--json", CLIENT_ENTRY],
      { timeout: 120_000, maxBuffer: 20 * 1024 * 1024, env }
    );

    const graph = JSON.parse(stdout) as {
      modules?: Array<{ specifier: string }>;
    };

    const modules = graph.modules ?? [];
    // Guards the assertion itself: an empty graph would make the check below
    // vacuously true.
    expect(modules.length).toBeGreaterThan(20);

    const nodeImports = modules
      .map((module) => module.specifier)
      .filter((specifier) => specifier.startsWith("node:"));

    expect(nodeImports).toEqual([]);
  });
});
