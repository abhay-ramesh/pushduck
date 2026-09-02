/**
 * @fileoverview The package's resolution surface.
 *
 * Packaging is where libraries in this category bleed. A survey of upload
 * libraries turned up 29 issues in this class alone, including
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` in both UploadThing (#974, #275) and Better
 * Upload (#127). pushduck ships more entry points than any of them, so it has
 * more exposure, not less.
 *
 * What makes these bugs expensive is *when* they surface. Nothing here fails in
 * development: the repo resolves through workspace links and TypeScript paths,
 * so every import works right up until someone installs the published tarball
 * with a different package manager. The failure lands on a user, in an
 * unrelated project, as a resolution error with no obvious cause.
 *
 * So these assertions read the real `package.json` and check the properties a
 * consumer's resolver will check:
 *
 * 1. Every export resolves to a file that is actually shipped.
 * 2. Every export carries types for both module systems.
 * 3. `typesVersions` covers every subpath, for TypeScript's older
 *    `node10`/`node` resolution, which ignores `exports` entirely.
 * 4. `files` includes everything the exports point at.
 *
 * The file-existence checks need a build, so they skip when `dist` is absent —
 * the consistency checks above them do not, and catch the common drift of
 * adding an entry point to one map but not the others.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(__dirname, "../..");
const pkg = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")
) as {
  name: string;
  files: string[];
  types?: string;
  exports: Record<string, unknown>;
  typesVersions?: Record<string, Record<string, string[]>>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  dependencies?: Record<string, string>;
};

const DIST = join(PACKAGE_ROOT, "dist");
const built = existsSync(DIST);

if (!built) {
  console.warn(
    "[packaging] dist/ not present — file-existence checks SKIPPED. Run `pnpm build` first."
  );
}

/** Subpath exports, excluding the bare `./package.json` passthrough. */
const codeEntries = Object.entries(pkg.exports).filter(
  ([subpath]) => subpath !== "./package.json"
) as Array<[string, { import?: Record<string, string>; require?: Record<string, string> }]>;

describe("exports map", () => {
  it("exposes package.json, which tooling resolves directly", () => {
    // Vite, Next and several bundler plugins read a dependency's package.json
    // through the module graph. Without this they fail with
    // ERR_PACKAGE_PATH_NOT_EXPORTED — a real failure found by installing the
    // packed tarball with yarn, not by any test that existed before.
    expect(pkg.exports["./package.json"]).toBe("./package.json");
  });

  it("gives every entry point both an import and a require condition", () => {
    // A dual package that omits one condition breaks for exactly half its
    // users, and the half it breaks depends on their bundler.
    for (const [subpath, conditions] of codeEntries) {
      expect(conditions.import, `${subpath} is missing "import"`).toBeDefined();
      expect(conditions.require, `${subpath} is missing "require"`).toBeDefined();
    }
  });

  it("declares types before the implementation in every condition", () => {
    // `types` must come first in each condition block: Node and TypeScript
    // both take the first match, so a `default` listed ahead of `types` wins
    // and the entry point resolves with no types at all.
    for (const [subpath, conditions] of codeEntries) {
      for (const mode of ["import", "require"] as const) {
        const block = conditions[mode];
        if (!block) continue;
        expect(
          Object.keys(block)[0],
          `${subpath}.${mode} must list "types" first`
        ).toBe("types");
        expect(block.default, `${subpath}.${mode} has no default`).toBeDefined();
      }
    }
  });

  it("points ESM and CJS at distinct files", () => {
    // Serving the same file to both conditions is the classic dual-package
    // mistake: a CJS consumer gets ESM syntax and fails at require time.
    for (const [subpath, conditions] of codeEntries) {
      expect(
        conditions.import?.default,
        `${subpath} serves one file to both conditions`
      ).not.toBe(conditions.require?.default);
    }
  });
});

describe("typesVersions", () => {
  /**
   * TypeScript's `node10`/`node` resolution ignores `exports` entirely and
   * looks only at `typesVersions` and `types`. Plenty of consumers are still
   * on it, so a subpath missing here type-checks in this repo and resolves to
   * `any` — or errors — in theirs.
   */
  it("covers every subpath except the root", () => {
    const mapped = Object.keys(pkg.typesVersions?.["*"] ?? {});

    const expected = codeEntries
      .map(([subpath]) => subpath.replace(/^\.\//, ""))
      .filter((subpath) => subpath !== ".");

    expect([...mapped].sort()).toEqual([...expected].sort());
  });

  it("agrees with the exports map about where the types live", () => {
    for (const [subpath, target] of Object.entries(
      pkg.typesVersions?.["*"] ?? {}
    )) {
      const fromExports = (
        pkg.exports[`./${subpath}`] as { require?: { types?: string } }
      )?.require?.types;

      expect(target[0], `typesVersions["${subpath}"] disagrees with exports`).toBe(
        fromExports
      );
    }
  });
});

describe("published files", () => {
  it("ships everything the exports point at", () => {
    // `files` is the allowlist npm packs. An export pointing outside it
    // produces a package that resolves in the repo and 404s once installed.
    const patterns = pkg.files.map((entry) => entry.split("/")[0]);

    for (const [subpath, conditions] of codeEntries) {
      for (const target of [
        conditions.import?.default,
        conditions.require?.default,
        conditions.import?.types,
        conditions.require?.types,
      ].filter(Boolean) as string[]) {
        const top = target.replace(/^\.\//, "").split("/")[0];
        expect(patterns, `${subpath} → ${target} is not in "files"`).toContain(
          top
        );
      }
    }
  });

  it.skipIf(!built)("has a real file behind every export", () => {
    for (const [subpath, conditions] of codeEntries) {
      for (const target of [
        conditions.import?.default,
        conditions.require?.default,
        conditions.import?.types,
        conditions.require?.types,
      ].filter(Boolean) as string[]) {
        expect(
          existsSync(join(PACKAGE_ROOT, target)),
          `${subpath} → ${target} does not exist`
        ).toBe(true);
      }
    }
  });

  it.skipIf(!built)("has a real file behind every typesVersions entry", () => {
    for (const [subpath, target] of Object.entries(
      pkg.typesVersions?.["*"] ?? {}
    )) {
      expect(
        existsSync(join(PACKAGE_ROOT, target[0])),
        `typesVersions["${subpath}"] → ${target[0]} does not exist`
      ).toBe(true);
    }
  });
});

describe("dependencies", () => {
  it("marks every peer optional", () => {
    // pushduck supports React, Vue, Svelte, Solid, Express, Fastify and Next
    // from one package. A peer that is not optional makes a Vue user install
    // React to silence their package manager — and under some resolvers, to
    // install at all.
    for (const peer of Object.keys(pkg.peerDependencies ?? {})) {
      expect(
        pkg.peerDependenciesMeta?.[peer]?.optional,
        `peer "${peer}" is not marked optional`
      ).toBe(true);
    }
  });

  it("keeps runtime dependencies to the minimum", () => {
    // Not a style rule: every runtime dependency is one a consumer's resolver
    // has to satisfy, and one more chance of a version conflict. Anything
    // added here should be a deliberate decision, so it fails loudly.
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(["aws4fetch"]);
  });

  it("declares no dependency on a framework", () => {
    // A framework in `dependencies` rather than `peerDependencies` installs a
    // second copy for every consumer — which for React means "Invalid hook
    // call" in an app that did nothing wrong.
    const frameworks = ["react", "react-dom", "vue", "svelte", "solid-js", "next"];
    for (const framework of frameworks) {
      expect(pkg.dependencies ?? {}).not.toHaveProperty(framework);
    }
  });
});
