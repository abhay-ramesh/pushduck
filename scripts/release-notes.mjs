#!/usr/bin/env node
/**
 * Group a release's commits into notes someone can act on.
 *
 * The previous generator emitted `git log --pretty="- %s (%h)"` verbatim. That
 * is adequate for a handful of patches and useless at the scale this project
 * actually releases: the run that prompted this had 49 commits, and the single
 * entry that would break a user's build — `.paths()` becoming immutable — sat
 * at line 31 of an undifferentiated list, indistinguishable from a dependency
 * bump.
 *
 * So: parse Conventional Commits, lead with what breaks, group the rest by what
 * a reader is looking for, and drop the noise. Anything unparseable is kept
 * under "Other" rather than discarded — a release note that silently omits a
 * change is worse than an untidy one.
 *
 *   node scripts/release-notes.mjs <previous-tag> [head]
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);

let preambleFile;
const positional = [];

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--preamble") {
    preambleFile = args[index + 1];
    index += 1;
    continue;
  }
  positional.push(args[index]);
}

const [previousTag, head = "HEAD"] = positional;

if (!previousTag) {
  console.error("usage: release-notes.mjs <previous-tag> [head]");
  process.exit(2);
}

const RECORD = "\x1e";
const FIELD = "\x1f";

const raw = execFileSync(
  "git",
  [
    "log",
    `${previousTag}..${head}`,
    "--no-merges",
    `--pretty=format:%H${FIELD}%s${FIELD}%b${RECORD}`,
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
);

const commits = raw
  .split(RECORD)
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [sha, subject, body = ""] = entry.split(FIELD);
    return { sha: sha.slice(0, 8), subject, body };
  });

/**
 * Sections in the order a reader needs them, not the order git emits them.
 * Breaking first because it is the only part that can cost someone an outage.
 */
const SECTIONS = [
  { key: "breaking", title: "⚠️ Breaking changes" },
  { key: "feat", title: "✨ Added" },
  { key: "fix", title: "🐛 Fixed" },
  { key: "perf", title: "⚡ Performance" },
  { key: "refactor", title: "♻️ Changed" },
  { key: "docs", title: "📚 Documentation" },
  { key: "other", title: "📦 Other" },
];

const grouped = new Map(SECTIONS.map((section) => [section.key, []]));

/** Types that are real work for a maintainer and noise for a reader. */
const SUPPRESSED = new Set(["chore", "ci", "build", "test", "style"]);
let suppressed = 0;

for (const commit of commits) {
  // Scope is repeated by some tooling — dependabot emits `chore(deps)(deps):`
  // — so match any number of scope groups and keep the first.
  const parsed = /^(\w+)((?:\([^)]*\))*)(!)?:\s*(.+)$/.exec(commit.subject);
  const breaking =
    parsed?.[4] === "!" || /^BREAKING[ -]CHANGE:/m.test(commit.body);

  if (!parsed) {
    grouped.get("other").push(render(commit, commit.subject));
    continue;
  }

  const [, type, scopes, , description] = parsed;
  const scope = /^\(([^)]*)\)/.exec(scopes ?? "")?.[1];
  const line = render(commit, description, scope);

  if (breaking) {
    // Deliberately not also filed under its own type: a breaking change that
    // appears twice reads as two changes.
    grouped.get("breaking").push(line);
    continue;
  }

  if (SUPPRESSED.has(type)) {
    suppressed += 1;
    continue;
  }

  grouped.get(grouped.has(type) ? type : "other").push(line);
}

function render(commit, description, scope) {
  // A trailing "(#123)" is how squash-merged PRs arrive; turn it into a link
  // and take the number out of the prose.
  const pr = /\(#(\d+)\)\s*$/.exec(description);
  const text = pr ? description.slice(0, pr.index).trim() : description;
  const prefix = scope ? `**${scope}:** ` : "";
  const suffix = pr ? ` (#${pr[1]})` : ` (${commit.sha})`;
  return `- ${prefix}${text}${suffix}`;
}

const out = [];

/**
 * A hand-written preamble, prepended verbatim.
 *
 * Not a convenience. A squash merge collapses a branch into one commit, so a
 * breaking change made inside one — `.paths()` becoming immutable, which landed
 * inside the beta redesign — is simply not present in the history this script
 * reads, at any granularity. No amount of parsing recovers it. The generator
 * covers what the log knows and leaves a place for what it cannot know.
 */
if (preambleFile && existsSync(preambleFile)) {
  out.push(readFileSync(preambleFile, "utf8").trim(), "");
}

for (const section of SECTIONS) {
  const lines = grouped.get(section.key);
  if (lines.length === 0) continue;
  out.push(`### ${section.title}`, "", ...lines, "");
}

if (out.length === 0) {
  out.push("_No user-facing changes._", "");
}

if (suppressed > 0) {
  out.push(
    `<sub>${suppressed} chore, CI, build and test commit${
      suppressed === 1 ? "" : "s"
    } omitted.</sub>`,
    ""
  );
}

process.stdout.write(out.join("\n"));
