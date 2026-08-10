/**
 * Runtime checks for recipe code — the half type-checking can't cover.
 *
 * Type-checking proves a block compiles. It does not prove Sharp produces the
 * widths the prose claims, that a key-derivation expression handles dotfiles,
 * or that a web stream can be handed to a Node stream API. Each of those has
 * already been wrong once.
 *
 * Run from the repo root, after `./scripts/check-recipe-code.sh` has installed
 * the harness:
 *   node scripts/recipe-runtime/run.mjs
 *
 * Needs sharp, which the type-check harness installs. Not wired into CI.
 */
import { Readable } from "node:stream";
import http from "node:http";
import assert from "node:assert/strict";

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push([true, name]); }
  catch (e) { results.push([false, `${name} — ${e.message.split("\n")[0]}`]); }
};

// --- image-thumbnails: key derivation ------------------------------------
const thumbnailKey = (key, width) => {
  const dot = key.lastIndexOf(".");
  const slash = key.lastIndexOf("/");
  const base = dot > slash + 1 ? key.slice(0, dot) : key;
  return `${base}-${width}w.webp`;
};

await check("thumbnailKey swaps a normal extension", () => {
  assert.equal(thumbnailKey("uploads/photo.jpg", 320), "uploads/photo-320w.webp");
});
await check("thumbnailKey handles dotted directories", () => {
  assert.equal(thumbnailKey("up/my.folder.v2/photo.jpg", 768), "up/my.folder.v2/photo-768w.webp");
});
await check("thumbnailKey handles no extension", () => {
  assert.equal(thumbnailKey("uploads/raw", 320), "uploads/raw-320w.webp");
});
await check("thumbnailKey preserves dotfiles (regression)", () => {
  // The first version produced "uploads/-320w.webp", losing the basename.
  assert.equal(thumbnailKey("uploads/.hidden", 320), "uploads/.hidden-320w.webp");
});

// --- image-thumbnails: the Sharp pipeline actually resizes ---------------
await check("sharp pipeline produces the documented widths and format", async () => {
  const { default: sharp } = await import("sharp");
  const src = await sharp({
    create: { width: 2000, height: 1200, channels: 3, background: { r: 30, g: 90, b: 160 } },
  }).jpeg().toBuffer();

  for (const width of [320, 768, 1600]) {
    const out = await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const meta = await sharp(out).metadata();
    assert.equal(meta.width, width, `expected ${width}px, got ${meta.width}`);
    assert.equal(meta.format, "webp");
  }
});

await check("withoutEnlargement does not upscale past the source", async () => {
  const { default: sharp } = await import("sharp");
  const src = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#123456" } }).jpeg().toBuffer();
  const out = await sharp(src).resize({ width: 4000, withoutEnlargement: true }).webp().toBuffer();
  assert.equal((await sharp(out).metadata()).width, 800);
});

// --- virus-scanning: the web -> Node stream bridge -----------------------
await check("Readable.fromWeb bridges a fetch body to a Node stream (regression)", async () => {
  const server = http.createServer((_, res) => { res.writeHead(200); res.end("PAYLOAD"); });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    const response = await fetch(url);
    // The original recipe passed response.body straight into a Node stream API.
    assert.equal(response.body instanceof Readable, false, "fetch body should be a web stream");
    const stream = Readable.fromWeb(response.body);
    assert.ok(stream instanceof Readable, "bridge should yield a Node Readable");
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    assert.equal(Buffer.concat(chunks).toString(), "PAYLOAD");
  } finally { server.close(); }
});

// --- the recipe wiring: middleware -> metadata -> onUploadComplete -------
await check("onUploadComplete fires with key/url/metadata and can enqueue", async () => {
  const { createUploadConfig } = await import("pushduck/server");
  const { s3 } = createUploadConfig().provider("aws", {
    bucket: "test-bucket", region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  }).build();

  const enqueued = [];
  const router = s3.createRouter({
    videoUpload: s3.file().accept(["video/*"])
      .middleware(async () => ({ userId: "user_123" }))
      .onUploadComplete(async ({ key, url, metadata }) => {
        assert.ok(key, "key must be present");
        assert.ok(url, "url must be present");
        enqueued.push({ key, userId: metadata.userId });
      }),
  });

  const [res] = await router.handleUploadComplete("videoUpload", new Request("http://localhost"), [
    { key: "uploads/user_123/clip.mp4", file: { name: "clip.mp4", size: 1048576, type: "video/mp4" }, metadata: { userId: "user_123" } },
  ]);

  assert.equal(res.success, true);
  assert.deepEqual(enqueued, [{ key: "uploads/user_123/clip.mp4", userId: "user_123" }]);
  assert.equal(new URL(res.presignedUrl).host, "test-bucket.s3.us-east-1.amazonaws.com");
});

const failed = results.filter(([ok]) => !ok);
for (const [ok, name] of results) console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} runtime checks passed`);
process.exit(failed.length ? 1 : 0);
