/**
 * Tests for the release-notes generator, run against a real throwaway repo.
 *
 * Each case here is a bug the generator actually had. It was written, looked
 * correct, and produced wrong output three separate ways — dependabot's
 * `chore(deps)(deps):` fell through to a published "Other" section, and an
 * argument-parsing slip silently shifted the commit range so the notes
 * described the wrong commits entirely. None of that is visible by reading it.
 *
 *   node --test scripts/release-notes.test.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

const SCRIPT = new URL("./release-notes.mjs", import.meta.url).pathname;
let repo;

const git = (...args) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" });

const commit = (subject, body = "") => {
  writeFileSync(join(repo, "file.txt"), String(Math.random()));
  git("add", "-A");
  git("commit", "-m", subject, ...(body ? ["-m", body] : []));
};

const generate = (...args) =>
  execFileSync("node", [SCRIPT, ...args], { cwd: repo, encoding: "utf8" });

before(() => {
  repo = mkdtempSync(join(tmpdir(), "release-notes-"));
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  commit("chore: initial");
  git("tag", "v1.0.0");

  commit("feat(client): add a thing (#10)");
  commit("fix(router): stop a crash (#11)");
  commit("chore(deps)(deps): bump something (#12)");
  commit("ci: tweak the matrix");
  commit("refactor!: rename a channel (#13)");
  commit("fix: quiet failure", "BREAKING CHANGE: it moved");
  commit("not a conventional commit at all");
});

after(() => rmSync(repo, { recursive: true, force: true }));

describe("release notes", () => {
  it("groups by type and links the PR", () => {
    const out = generate("v1.0.0", "HEAD");
    assert.match(out, /### ✨ Added\n\n- \*\*client:\*\* add a thing \(#10\)/);
    assert.match(out, /### 🐛 Fixed\n\n- \*\*router:\*\* stop a crash \(#11\)/);
  });

  it("suppresses chore and ci rather than publishing them", () => {
    const out = generate("v1.0.0", "HEAD");
    assert.doesNotMatch(out, /bump something/);
    assert.doesNotMatch(out, /tweak the matrix/);
    assert.match(out, /2 chore, CI, build and test commits omitted/);
  });

  it("suppresses dependabot's repeated scope", () => {
    // `chore(deps)(deps):` has two scope groups. A single-group pattern fails
    // to match it, and the commit is then published under "Other" — the exact
    // noise the suppression list exists to remove.
    const out = generate("v1.0.0", "HEAD");
    assert.doesNotMatch(out, /📦 Other[\s\S]*bump something/);
  });

  it("leads with breaking changes, by marker or by trailer", () => {
    const out = generate("v1.0.0", "HEAD");
    const breaking = out.indexOf("### ⚠️ Breaking changes");
    assert.ok(breaking >= 0, "no breaking section");
    assert.ok(breaking < out.indexOf("### ✨ Added"), "breaking must come first");
    assert.match(out, /rename a channel \(#13\)/);
    assert.match(out, /quiet failure/);
  });

  it("files a breaking change once, not twice", () => {
    const out = generate("v1.0.0", "HEAD");
    assert.equal(out.match(/rename a channel/g).length, 1);
  });

  it("keeps commits it cannot parse instead of dropping them", () => {
    const out = generate("v1.0.0", "HEAD");
    assert.match(out, /not a conventional commit at all/);
  });

  it("reads the range given, with and without --preamble", () => {
    // The regression: an argument-parsing slip dropped the first positional,
    // so the generator silently described a different range.
    const plain = generate("v1.0.0", "HEAD");
    const preambleFile = join(repo, "pre.md");
    writeFileSync(preambleFile, "### ⚠️ Breaking changes\n\n- hand written");

    const withPreamble = generate("--preamble", preambleFile, "v1.0.0", "HEAD");

    assert.match(plain, /add a thing/);
    assert.match(withPreamble, /add a thing/);
    assert.ok(withPreamble.startsWith("### ⚠️ Breaking changes"));
    assert.match(withPreamble, /- hand written/);
  });
});
