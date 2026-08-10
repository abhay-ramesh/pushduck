#!/usr/bin/env bash
#
# Type-check every code block in docs/content/docs/recipes/ against the real
# built package and real third-party types.
#
# Recipes are copy-paste code. If a block doesn't compile, we are shipping a bug
# to everyone who trusts it — this catches that before they do.
#
# What it does:
#   1. builds and packs the pushduck package, so blocks are checked against what
#      users actually install, not against src/
#   2. installs real types for the libraries the recipes hand off to (sharp,
#      clamscan), so those calls are genuinely verified rather than stubbed
#   3. extracts every ```typescript / ```tsx block from the recipe docs
#   4. compiles each block as its own module under strict mode
#
# `s3` and `storage` are declared with the real exported pushduck types, so
# recipe usage of the library API is checked for real. Only application-level
# things a reader supplies (their db, queue, redis, auth) are stubbed.
#
# Usage:  ./scripts/check-recipe-code.sh
# Exit:   0 if every block compiles
#
# Not wired into CI: it installs sharp, which is a heavy native dependency.
# Run it whenever recipes change, or when the public API changes shape.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export WORK="${TMPDIR:-/tmp}/pushduck-recipe-check"
RECIPES="$REPO_ROOT/docs/content/docs/recipes"

if [ ! -d "$RECIPES" ]; then
  echo "No recipes directory at $RECIPES"
  exit 1
fi

echo "==> Building and packing pushduck"
( cd "$REPO_ROOT/packages/pushduck" && pnpm build >/dev/null 2>&1 ) || {
  echo "package build failed"; exit 1;
}
rm -rf "$WORK" && mkdir -p "$WORK/blocks" "$WORK/app-stubs/lib"
( cd "$REPO_ROOT/packages/pushduck" && npm pack --pack-destination "$WORK" >/dev/null 2>&1 )
TARBALL="$(ls "$WORK"/pushduck-*.tgz | head -1)"

echo "==> Installing harness dependencies (this takes a minute)"
cd "$WORK"
echo '{"name":"recipe-check","version":"1.0.0","private":true}' > package.json
npm i "$TARBALL" typescript react @types/react @types/node @types/clamscan sharp \
  >/dev/null 2>&1 || { echo "dependency install failed"; exit 1; }

cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2023", "dom"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["react", "node", "clamscan"],
    "paths": { "@/*": ["./app-stubs/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
JSON

cat > app-stubs/lib/upload-client.ts <<'TS'
import { createUploadClient } from "pushduck/client";
export const upload = createUploadClient<any>({ endpoint: "/api/upload" });
TS

# `s3` and `storage` use the real exported types. Everything else is an
# application concern the reader supplies, typed as the recipe prose implies.
cat > globals.d.ts <<'TS'
import type { StorageInstance, UploadInitResult } from "pushduck/server";

declare global {
  const s3: UploadInitResult["s3"];
  const storage: StorageInstance;

  const queue: { enqueue(job: string, payload: Record<string, unknown>): Promise<void> };
  const redis: { incr(k: string): Promise<number>; expire(k: string, s: number): Promise<void> };
  const db: {
    uploads: {
      create(row: Record<string, unknown>): Promise<{ id: string }>;
      update(row: Record<string, unknown>): Promise<void>;
    };
    attachments: {
      create(row: Record<string, unknown>): Promise<void>;
      update(row: Record<string, unknown>): Promise<void>;
      findMany(q: Record<string, unknown>): Promise<unknown[]>;
    };
    videos: { update(row: Record<string, unknown>): Promise<void> };
    usage: { bytesFor(userId: string): Promise<number> };
  };
  const mux: { video: { assets: { create(o: Record<string, unknown>): Promise<void> } } };

  function authenticate(req: Request): Promise<{ id: string; plan: string; quotaBytes: number }>;
  function transcode(file: File): Promise<File>;
  function runFfmpeg(src: string, opts: { height: number; codec: string }): Promise<Buffer>;
  function publicUrl(key: string): string;
  function thumbnailKey(key: string, width: number): string;
  function endOfDay(): string;

  const row: { key: string };
  const userId: string;
  const user: { id: string; plan: string; quotaBytes: number };
  const file: File & { key: string };
  const limit: number;
}
export {};
TS

echo "==> Extracting code blocks"
python3 - "$RECIPES" <<'PY'
import pathlib, re, sys, os
recipes = pathlib.Path(sys.argv[1])
out = pathlib.Path(os.environ["WORK"]) / "blocks"
count = 0
for f in sorted(recipes.glob("*.mdx")):
    for i, (lang, body) in enumerate(re.findall(r"```(\w+)\n(.*?)```", f.read_text(), re.S)):
        if lang not in ("typescript", "ts", "tsx"):
            continue
        code, stripped = body.rstrip(), body.strip()
        # Chain fragments (".middleware(...)") attach to a route.
        if stripped.startswith("."):
            code = "const __route = s3.file()\n" + code + ";"
        # A bare JSX expression needs to be inside something.
        elif lang == "tsx" and stripped.startswith("<"):
            code = "export const __el = (\n" + code + "\n);"
        ext = "tsx" if lang == "tsx" else "ts"
        (out / f"{f.stem.replace('-', '_')}__{i}.{ext}").write_text(code + "\nexport {};\n")
        count += 1
if count == 0:
    raise SystemExit("no code blocks extracted — refusing to report a pass")
print(f"    {count} blocks from {len(list(recipes.glob('*.mdx')))} files")
PY
# Without this, a failed extraction leaves stale blocks behind and tsc happily
# reports success on last run's content — a false pass, worse than no check.
if [ $? -ne 0 ]; then
  echo "Extraction failed — aborting rather than reporting a pass."
  exit 1
fi

echo "==> Type-checking"
if ! npx tsc; then
  echo
  echo "Recipe code failed to compile — see errors above."
  echo "Blocks are in $WORK/blocks (filename maps to <recipe>__<block index>)."
  exit 1
fi
echo "    all blocks compile"

# Type-checking proves a block compiles; it does not prove Sharp produces the
# widths the prose claims, or that a web stream can be passed to a Node stream
# API. Both of those have already been wrong once, so run them for real.
echo "==> Runtime checks"
cp "$REPO_ROOT/scripts/recipe-runtime/run.mjs" "$WORK/runtime.mjs"
if ! node "$WORK/runtime.mjs"; then
  echo
  echo "Recipe runtime checks failed — see above."
  exit 1
fi

echo
echo "Recipes verified: all blocks compile and runtime checks pass."
exit 0
