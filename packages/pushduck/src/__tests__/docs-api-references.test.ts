/**
 * @fileoverview Guards the documentation against referencing APIs that do not exist.
 *
 * The docs site once advertised `useUpload`, `UploadButton`, and
 * `UploadDropzone` across six framework guides. None of the three had ever been
 * exported — they were another library's API. Separately, five guides called
 * `uploadRouter.handlers(request)`, which threw, because `handlers` is an
 * object.
 *
 * Both classes of error survived for a long time because nothing checked the
 * docs against the package. This test does. It is intentionally about *symbols
 * imported from pushduck* rather than full type-checking of every snippet:
 * cheap, fast, and it catches the failure mode that actually occurred.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DOCS = resolve(__dirname, "../../../../docs/content/docs");

/** Symbols each entry point is allowed to export, gathered from source. */
const ENTRY_SOURCES: Record<string, string> = {
  "pushduck/client": "client.ts",
  "pushduck/core": "core.ts",
  "pushduck/vue": "vue.ts",
  "pushduck/svelte": "svelte.ts",
  "pushduck/solid": "solid.ts",
  "pushduck/react-native": "react-native.ts",
};

function collectMdx(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectMdx(full));
    else if (entry.endsWith(".mdx")) out.push(full);
  }
  return out;
}

/**
 * Reads the exported value/type names of an entry point from its source.
 *
 * Deliberately source-based rather than importing the built package, so the
 * check runs without a prior build step in CI.
 */
function exportedNames(entryFile: string): Set<string> {
  const source = readFileSync(resolve(__dirname, "..", entryFile), "utf8");
  const names = new Set<string>();

  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, "");
      if (name) names.add(name.trim());
    }
  }
  for (const match of source.matchAll(
    /export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/g
  )) {
    names.add(match[1]);
  }

  return names;
}

/** Every `import { … } from "pushduck/…"` appearing in a docs file. */
function pushduckImports(
  file: string
): Array<{ entry: string; symbols: string[] }> {
  const source = readFileSync(file, "utf8");
  const found: Array<{ entry: string; symbols: string[] }> = [];

  const pattern = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["'](pushduck(?:\/[\w-]+)?)["']/g;
  for (const match of source.matchAll(pattern)) {
    const symbols = match[1]
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "").trim())
      .filter(Boolean);
    found.push({ entry: match[2], symbols });
  }

  return found;
}

const docFiles = collectMdx(DOCS);

describe("docs reference only real pushduck APIs", () => {
  it("finds the documentation tree", () => {
    // Guards against the suite silently passing if the docs move.
    expect(docFiles.length).toBeGreaterThan(10);
  });

  it("every imported client symbol exists in its entry point", () => {
    const violations: string[] = [];

    for (const file of docFiles) {
      for (const { entry, symbols } of pushduckImports(file)) {
        const sourceFile = ENTRY_SOURCES[entry];
        if (!sourceFile) continue; // server entries carry a large re-export surface

        const available = exportedNames(sourceFile);
        for (const symbol of symbols) {
          if (!available.has(symbol)) {
            violations.push(
              `${relative(DOCS, file)}: "${symbol}" is not exported by ${entry}`
            );
          }
        }
      }
    }

    expect(
      violations,
      `Documentation references APIs that do not exist:\n  ${violations.join("\n  ")}`
    ).toEqual([]);
  });

  it("never calls the handlers object as a function", () => {
    // `handlers` is an object of per-method handlers; `handler` is the callable
    // one. Calling the former throws "handlers is not a function".
    const violations: string[] = [];

    for (const file of docFiles) {
      const source = readFileSync(file, "utf8");
      source.split("\n").forEach((line, index) => {
        if (/\.handlers\s*\(/.test(line)) {
          violations.push(`${relative(DOCS, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      violations,
      `Use \`.handler(request)\` (callable) or \`.handlers.GET\` / \`.handlers.POST\`:\n  ${violations.join("\n  ")}`
    ).toEqual([]);
  });

  it("does not advertise the UploadButton / UploadDropzone components", () => {
    // pushduck ships no prebuilt components. These names came from a different
    // library and misled users into an import that could never resolve.
    const violations: string[] = [];

    for (const file of docFiles) {
      const source = readFileSync(file, "utf8");
      // Only flag them when presented as pushduck exports.
      const pattern = /\}\s*=\s*(?:pushduck\.)?useUpload[<(]|from\s+["']pushduck[^"']*["'][^\n]*Upload(?:Button|Dropzone)/;
      if (pattern.test(source)) {
        violations.push(relative(DOCS, file));
      }
    }

    expect(violations).toEqual([]);
  });
});
