/**
 * @fileoverview Executable architecture rules.
 *
 * These tests assert the *dependency direction* of the codebase rather than any
 * behaviour. They exist because layering that is not enforced by CI degrades
 * back into a tangle within a couple of quarters — a comment saying "this
 * module must not import React" is a wish; this file is a guarantee.
 *
 * Each rule below is a load-bearing architectural claim that the library makes
 * publicly. If one fails, either the code broke the claim or the claim changed
 * and the documentation needs to change with it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");

/** Recursively collects every TypeScript source file under a directory. */
function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      files.push(...collectSourceFiles(full));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) files.push(full);
  }

  return files;
}

/**
 * Extracts every module specifier imported or re-exported by a file.
 *
 * Covers `import x from "y"`, `import type { x } from "y"`,
 * `export { x } from "y"`, `export * from "y"`, and dynamic `import("y")`.
 */
function moduleSpecifiersOf(filePath: string): string[] {
  const source = readFileSync(filePath, "utf8");
  const specifiers: string[] = [];

  const staticPattern = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
  const bareImportPattern = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  const dynamicPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

  for (const pattern of [staticPattern, bareImportPattern, dynamicPattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) specifiers.push(match[1]);
  }

  return specifiers;
}

/** Resolves a relative specifier against its importer, for intra-package edges. */
function resolveLocal(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  return relative(SRC, resolve(join(fromFile, ".."), specifier));
}

const FRAMEWORK_PACKAGES = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "vue",
  "svelte",
  "solid-js",
  "next",
  "next/server",
  "express",
  "fastify",
  "@angular/core",
];

describe("architecture: pushduck/core is framework-agnostic", () => {
  const coreFiles = [
    join(SRC, "core.ts"),
    ...collectSourceFiles(join(SRC, "core", "upload")),
  ];

  it("covers the whole upload core", () => {
    // Guards against the rules below silently passing on an empty file set.
    expect(coreFiles.length).toBeGreaterThanOrEqual(5);
  });

  it.each(coreFiles)("%s imports no UI framework", (file) => {
    const offending = moduleSpecifiersOf(file).filter((spec) =>
      FRAMEWORK_PACKAGES.includes(spec)
    );

    expect(
      offending,
      `${relative(SRC, file)} imports ${offending.join(", ")}. ` +
        "The upload core must stay framework-agnostic — every binding depends on it."
    ).toEqual([]);
  });

  it.each(coreFiles)("%s carries no 'use client' directive", (file) => {
    // "use client" is a React Server Components marker. Its presence in the
    // core would make the engine unusable from Vue, Svelte, or plain Node.
    const source = readFileSync(file, "utf8");
    expect(source.trimStart().startsWith('"use client"')).toBe(false);
    expect(source.trimStart().startsWith("'use client'")).toBe(false);
  });

  it.each(coreFiles)("%s pulls in no server-side module", (file) => {
    const forbidden = ["aws4fetch"];
    const forbiddenLocalPrefixes = [
      "core/storage",
      "core/providers",
      "core/router",
      "core/handler",
      "core/config",
      "adapters",
    ];

    const specifiers = moduleSpecifiersOf(file);

    const offendingPackages = specifiers.filter((s) => forbidden.includes(s));
    expect(
      offendingPackages,
      `${relative(SRC, file)} imports ${offendingPackages.join(", ")}. ` +
        "The signing client must never reach a browser bundle."
    ).toEqual([]);

    const offendingLocal = specifiers
      .map((s) => resolveLocal(file, s))
      .filter((r): r is string => r !== null)
      .filter((r) => forbiddenLocalPrefixes.some((p) => r.startsWith(p)));

    expect(
      offendingLocal,
      `${relative(SRC, file)} reaches into ${offendingLocal.join(", ")}. ` +
        "The client core must not depend on the server half of the library."
    ).toEqual([]);
  });
});

describe("architecture: each binding imports only its own framework", () => {
  /**
   * A Vue user must never end up resolving React, and vice versa. Each entry
   * point may reach for exactly one framework; anything else means the optional
   * peer dependencies no longer protect consumers from installing frameworks
   * they do not use.
   */
  const BINDINGS: Array<{ entry: string; allowed: string[] }> = [
    { entry: "client.ts", allowed: ["react"] },
    { entry: "hooks/use-upload-route.ts", allowed: ["react"] },
    { entry: "client/upload-client.ts", allowed: ["react"] },
    { entry: "vue.ts", allowed: ["vue"] },
    { entry: "svelte.ts", allowed: [] }, // structural store contract; no import
    { entry: "solid.ts", allowed: ["solid-js"] },
    { entry: "core.ts", allowed: [] },
  ];

  it.each(BINDINGS)("$entry imports no foreign framework", ({
    entry,
    allowed,
  }) => {
    const file = join(SRC, entry);
    const foreign = moduleSpecifiersOf(file)
      .filter((spec) => FRAMEWORK_PACKAGES.includes(spec))
      .filter((spec) => !allowed.some((a) => spec === a || spec.startsWith(`${a}/`)));

    expect(
      foreign,
      `${entry} imports ${foreign.join(", ")}, but may only use ${
        allowed.join(", ") || "no framework"
      }.`
    ).toEqual([]);
  });

  it("the Svelte binding depends on Svelte structurally, not by import", () => {
    // Declaring the store contract as an interface rather than importing
    // `svelte/store` keeps Svelte a genuinely optional peer: a React-only
    // consumer never resolves it, even transitively.
    const source = readFileSync(join(SRC, "svelte.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["']svelte/);
    expect(source).toMatch(/interface Readable<T>/);
  });
});

describe("architecture: bindings expose the same capabilities", () => {
  /**
   * The library's promise is "same API, framework-native shape". State field
   * *shapes* legitimately differ — React returns plain values, Vue returns
   * refs, Solid returns a store — but the set of **actions** must not, or a
   * capability silently becomes framework-specific.
   *
   * This caught `cancel`/`cancelAll` shipping in Vue and Svelte while React
   * lacked them.
   */
  const REQUIRED_ACTIONS = [
    "uploadFiles",
    "uploadFilesAsync",
    "cancel",
    "cancelAll",
    "reset",
  ];

  const BINDING_SOURCES = [
    "hooks/use-upload-route.ts",
    "vue.ts",
    "svelte.ts",
    "solid.ts",
  ];

  it.each(BINDING_SOURCES)("%s exposes every shared action", (entry) => {
    const source = readFileSync(join(SRC, entry), "utf8");

    const missing = REQUIRED_ACTIONS.filter(
      (action) => !new RegExp(`\\b${action}\\b`).test(source)
    );

    expect(
      missing,
      `${entry} is missing ${missing.join(", ")}. Every binding wraps the same ` +
        "engine, so a capability in one must exist in all."
    ).toEqual([]);
  });
});

describe("architecture: adapters stay decoupled from core", () => {
  const adapterFiles = collectSourceFiles(join(SRC, "adapters"));

  it("covers every adapter", () => {
    expect(adapterFiles.length).toBeGreaterThanOrEqual(4);
  });

  it.each(adapterFiles)("%s does not import the library internals", (file) => {
    // Adapters receive handlers as a parameter. This inversion is precisely why
    // two shims cover seventeen frameworks; an adapter that imports core would
    // couple every framework to the router's internals.
    const reachesInternals = moduleSpecifiersOf(file)
      .map((s) => resolveLocal(file, s))
      .filter((r): r is string => r !== null)
      .filter((r) => r.startsWith("core/"));

    expect(
      reachesInternals,
      `${relative(SRC, file)} imports ${reachesInternals.join(", ")}. ` +
        "Adapters must depend only on the Web-standard handler signature."
    ).toEqual([]);
  });
});

describe("architecture: transports are lazily bound", () => {
  it("references XMLHttpRequest only inside a function body", () => {
    // A module-scope reference would crash during server-side rendering in
    // Nuxt, SvelteKit, Remix, and Astro — exactly the frameworks the engine
    // exists to serve.
    const source = readFileSync(
      join(SRC, "core", "upload", "transport.ts"),
      "utf8"
    );

    const moduleScopeLines = source
      .split("\n")
      .filter((line) => /^(?:const|let|var|export)\s/.test(line))
      .filter((line) => line.includes("XMLHttpRequest"));

    expect(moduleScopeLines).toEqual([]);
  });
});

describe("architecture: bindings feel like one library", () => {
  /**
   * Consistency rules. pushduck's promise is that moving between frameworks
   * means learning a *return shape*, never a new vocabulary. These assert that
   * the vocabulary really is shared.
   */

  const BINDINGS = [
    { entry: "hooks/use-upload-route.ts", verb: "use" },
    { entry: "vue.ts", verb: "use" },
    { entry: "svelte.ts", verb: "create" },
    { entry: "solid.ts", verb: "create" },
  ];

  it.each(BINDINGS)(
    "$entry names its route entry point ${verb}UploadRoute",
    ({ entry, verb }) => {
      // Same noun everywhere; only the verb changes, matching each ecosystem's
      // convention (`use*` for hooks and composables, `create*` for factories
      // and primitives).
      const source = readFileSync(join(SRC, entry), "utf8");
      const expected = `${verb}UploadRoute`;

      expect(
        source.includes(`export function ${expected}`),
        `${entry} should export \`${expected}\`.`
      ).toBe(true);
    }
  );

  it.each(["vue.ts", "svelte.ts", "solid.ts", "client.ts"])(
    "%s exposes createUploadClient",
    (entry) => {
      // The property-per-route client shipped only for React at first, which
      // made the other bindings quietly second-class.
      const source = readFileSync(join(SRC, entry), "utf8");
      expect(source).toMatch(/createUploadClient/);
    }
  );

  it.each(["hooks/use-upload-route.ts", "vue.ts", "svelte.ts", "solid.ts"])(
    "%s accepts the shared UploadClientConfig",
    (entry) => {
      // React briefly accepted a narrower config than the others, so the same
      // options object was not portable between frameworks.
      const source = readFileSync(join(SRC, entry), "utf8");
      expect(source).toMatch(/UploadClientConfig/);
    }
  );

  it.each(["vue.ts", "svelte.ts", "solid.ts"])(
    "%s uses the shared client proxy rather than its own",
    (entry) => {
      // Four hand-rolled Proxies would drift; one shared implementation cannot.
      const source = readFileSync(join(SRC, entry), "utf8");
      expect(source).toMatch(/createClientProxy/);
    }
  );
});
