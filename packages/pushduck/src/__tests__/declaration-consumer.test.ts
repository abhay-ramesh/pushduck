/**
 * @fileoverview A consumer that emits declarations can name every pushduck
 * type it exports.
 *
 * Monorepo packages and libraries compile with `declaration: true`, so every
 * exported binding's inferred type is printed into the consumer's own `.d.ts`.
 * pushduck's declarations are bundled into hashed chunks
 * (`dist/index-<hash>.d.mts`) that the exports map does not expose, so a type
 * declared in a chunk is only nameable if a public entry re-exports it. When
 * none does, the consumer gets
 *
 *   TS2742: The inferred type of 'config' cannot be named without a reference
 *   to '../node_modules/pushduck/dist/index-<hash>.mjs'. This is likely not
 *   portable. A type annotation is necessary.
 *
 * and the only annotation available is `any` — which is how a real app ended
 * up with `export const { s3, config }: { s3: any; config: any } = ...` and
 * two dozen lint suppressions downstream.
 *
 * Nothing inside this repo can see the failure: the library's own type-check
 * resolves source files, not the published chunks. So this compiles
 * `fixtures/declaration-consumer` the way an installed copy is compiled —
 * against `dist`, through the exports map, under each resolution mode a
 * consumer might use — and asserts the compiler reports nothing.
 *
 * Needs a build, so it skips when `dist` is absent, like `packaging.test.ts`.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(__dirname, "../..");
const FIXTURE = resolve(__dirname, "fixtures/declaration-consumer");
const built = existsSync(join(PACKAGE_ROOT, "dist"));

if (!built) {
  console.warn(
    "[declaration-consumer] dist/ not present — suite SKIPPED. Run `pnpm build` first.",
  );
}

/** The ways a consumer's compiler can resolve `pushduck/*`. */
const MODES = [
  {
    name: "ESM, moduleResolution bundler",
    type: "module",
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  },
  {
    name: "ESM, moduleResolution nodenext",
    type: "module",
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  },
  {
    name: "CommonJS, moduleResolution nodenext",
    type: "commonjs",
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  },
] as const;

const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A throwaway package with pushduck installed the way a package manager links
 * a workspace dependency: a symlink to the package root, so resolution goes
 * through its `package.json` exports exactly as it would from npm.
 */
function consumerPackage(type: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pushduck-declarations-"));
  dirs.push(dir);
  cpSync(FIXTURE, dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type }),
  );
  mkdirSync(join(dir, "node_modules"));
  symlinkSync(PACKAGE_ROOT, join(dir, "node_modules/pushduck"), "dir");
  return dir;
}

/** Compiles `files` with declaration emit and returns every diagnostic. */
function emitDeclarations(
  dir: string,
  files: string[],
  options: ts.CompilerOptions,
): string[] {
  const program = ts.createProgram({
    rootNames: [join(dir, "env.d.ts"), ...files.map((f) => join(dir, f))],
    options: {
      strict: true,
      noUncheckedIndexedAccess: true,
      declaration: true,
      emitDeclarationOnly: true,
      // Consumers routinely set this; with it on, only the emitter's own
      // diagnostics remain, which is what this suite is about.
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
      types: [],
      outDir: join(dir, "out"),
      ...options,
    },
  });
  const emitted = program.emit(undefined, () => {});
  return [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics].map(
    (d) =>
      `${d.file ? `${d.file.fileName.slice(dir.length + 1)}: ` : ""}TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
  );
}

// A full program over the published declarations takes a few seconds per
// compile, well past the default timeout.
describe.skipIf(!built)(
  "declaration emit in a consumer package",
  { timeout: 60_000 },
  () => {
    for (const mode of MODES) {
      describe(mode.name, () => {
        const dir = built ? consumerPackage(mode.type) : "";
        const options = {
          module: mode.module,
          moduleResolution: mode.moduleResolution,
        };

        it("names the build result, router and storage from pushduck/server", () => {
          expect(emitDeclarations(dir, ["server.ts"], options)).toEqual([]);
        });

        it("names the typed client from pushduck/client", () => {
          expect(emitDeclarations(dir, ["client.ts"], options)).toEqual([]);
        });

        it("names the build result from the root entry", () => {
          expect(emitDeclarations(dir, ["root.ts"], options)).toEqual([]);
        });

        it("lets every build-result type be written out under isolatedDeclarations", () => {
          expect(
            emitDeclarations(dir, ["annotated.ts"], {
              ...options,
              isolatedDeclarations: true,
            }),
          ).toEqual([]);
        });
      });
    }
  },
);
