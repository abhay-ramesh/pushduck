/**
 * @fileoverview Runs the built CLI the way a user does: `node <bin> <args>`.
 *
 * The unit tests import the source through Vite, which resolves every
 * dependency itself, so they cannot see how the *bundle* loads its
 * dependencies. That gap shipped a CLI where every coloured line crashed with
 * `chalk.default.cyan is not a function`: a CommonJS bundle `require()`d
 * chalk, ora, execa and inquirer, which ship only ES modules, and the
 * interop helper mis-wrapped what came back. Only `--help` worked.
 *
 * These assertions execute the bundle named by `bin` in package.json, in a
 * scratch directory, with colour forced on so chalk actually runs. They need a
 * build, so they skip when it is absent; CI's compatibility job downloads the
 * build and runs them on every supported Node version.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(__dirname, "..");
const pkg = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")
) as { bin: Record<string, string> };

const BIN = join(PACKAGE_ROOT, pkg.bin.pushduck);
const built = existsSync(BIN);

if (!built) {
  console.warn(
    `[bin] ${pkg.bin.pushduck} not present — built-CLI checks SKIPPED. Run \`pnpm build\` first.`
  );
}

/** Errors that mean the bundle failed to load or wire up a dependency. */
const LOAD_FAILURES = [
  "is not a function",
  "ERR_REQUIRE_ESM",
  "ERR_MODULE_NOT_FOUND",
  "Cannot find module",
  "does not provide an export named",
];

let cwd: string;

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    // A clean environment, as a user's shell would have no pushduck config.
    env: { PATH: process.env.PATH, HOME: cwd, FORCE_COLOR: "1" },
    input: "",
    timeout: 30_000,
  });
  const output = `${result.stdout}${result.stderr}`;
  for (const failure of LOAD_FAILURES) {
    expect(output, `\`pushduck ${args.join(" ")}\` output`).not.toContain(
      failure
    );
  }
  return { status: result.status, output };
}

describe.skipIf(!built)("built CLI", () => {
  beforeAll(() => {
    cwd = mkdtempSync(join(tmpdir(), "pushduck-cli-"));
  });

  afterAll(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("starts with a node shebang", () => {
    expect(readFileSync(BIN, "utf8").startsWith("#!/usr/bin/env node\n")).toBe(
      true
    );
  });

  it("--version", () => {
    const { status, output } = run("--version");
    expect(status).toBe(0);
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("init --help", () => {
    const { status, output } = run("init", "--help");
    expect(status).toBe(0);
    expect(output).toContain("Usage: pushduck init");
  });

  it("prints a coloured error for an unknown command", () => {
    const { status, output } = run("not-a-command");
    expect(status).toBe(1);
    expect(output).toContain("Unknown command: not-a-command");
    expect(output).toContain("\u001b[");
  });

  it("test runs outside a project", () => {
    const { output } = run("test");
    expect(output).toContain("Testing your S3 upload configuration");
    expect(output).toContain("No package.json found");
  });

  it("test runs inside a Next.js project", () => {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "app", dependencies: { next: "15.0.0" } })
    );
    const { status, output } = run("test");
    expect(status).toBe(0);
    expect(output).toContain("No upload configuration found");
  });
});
