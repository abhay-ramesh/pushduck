/**
 * @fileoverview Object keys: the filename sanitiser and the key chokepoint.
 *
 * Every key a route produces passes through {@link resolveKey}, the same
 * chokepoint the Python (`resolve_key`) and Go (`resolveKey`) servers have.
 * The library, not each application, guarantees that a key is legal and stays
 * where it was put. Cases all three languages must agree on live in
 * `__tests__/fixtures/key-cases.json`.
 */

import { UploadError } from "../errors";

/**
 * Control characters, and the invisible formatting characters used for
 * bidirectional-text spoofing. Neither belongs in a key or a header.
 */
const DANGEROUS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;
const DANGEROUS_GLOBAL = new RegExp(DANGEROUS.source, "g");

/**
 * Leaves room below S3's 1024-byte limit for a prefix. The limit is on
 * *bytes*: a CJK character costs three, so a name far shorter than 1024
 * characters can exceed it.
 */
const MAX_NAME_BYTES = 900;

/** S3's hard limit on a whole key. */
export const MAX_KEY_BYTES = 1024;

/**
 * The part of a filename before its extension.
 *
 * A dot at index 0 means the whole name *is* the extension-like tail —
 * `.gitignore`, or the `.pdf` left behind when a name is stripped away — so
 * the basename is empty rather than the entire string. That distinction is
 * what separates a legitimately dot-leading name from an erased one.
 */
function basenameOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return name;
  if (dot === 0) return "";
  return name.slice(0, dot);
}

/**
 * A short, stable identifier for a filename.
 *
 * Used only when sanitising removes every character, so that two such names do
 * not land on the same key. FNV-1a: not cryptographic, and does not need to be
 * — it exists to keep keys distinct, not to resist an attacker.
 */
function fingerprintName(name: string): string {
  let hash = 0x811c9dc5;
  for (const codeUnit of name) {
    hash ^= codeUnit.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Sanitises one filename (or one key segment) into a safe key segment.
 *
 * This used to replace everything outside `[a-zA-Z0-9.-]`, which erased any
 * name written in a non-Latin script: `文档.pdf`, `写真.pdf` and `Отчёт.pdf`
 * all became `.pdf`, so the second upload silently overwrote the first. A
 * non-Latin name with no extension threw outright.
 *
 * S3 object keys are UTF-8 strings — `文档.pdf` is a legal key on S3, R2,
 * MinIO and Spaces alike. The breakage that motivated the old ASCII-only rule
 * lives in *HTTP headers* (`x-amz-meta-*` and `Content-Disposition` are
 * Latin-1), not in the key, so it is fixed by encoding those headers rather
 * than by destroying the name.
 *
 * What is still removed is the set of characters that are dangerous in a key
 * rather than merely unfamiliar:
 *
 * - path separators, which would silently move the object
 * - control characters, which are invalid in a header and unprintable
 * - the URL delimiters `? # %`, which change how a key parses in a URL
 *
 * ASCII names are unaffected — `my photo.jpg` is still `my_photo.jpg` — so
 * objects stored by earlier versions keep the same key.
 */
export function sanitizeFilename(
  originalName: string,
  { preserveExtension = true }: { preserveExtension?: boolean } = {}
): string {
  let filename = originalName
    .replace(DANGEROUS_GLOBAL, "")
    // Every *ASCII* character outside the old allow-list still becomes an
    // underscore, byte for byte as before — so `my photo.jpg`, `file(1).pdf`
    // and `a,b.csv` keep the keys they have today and no stored object becomes
    // unreachable. Characters above U+007F are left alone: that is the fix.
    .replace(/[^a-zA-Z0-9.\-\u0080-\u{10FFFF}]/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!preserveExtension) {
    filename = filename.replace(/\.[^/.]+$/, "").replace(/^_+|_+$/g, "");
  }

  /**
   * The name is truncated on a byte boundary that does not split a character,
   * and the tail is kept as well as the head — the end of a filename carries
   * the extension and the part that usually distinguishes two similar names.
   */
  const encoded = new TextEncoder().encode(filename);

  if (encoded.length > MAX_NAME_BYTES) {
    const head = new TextDecoder().decode(encoded.slice(0, MAX_NAME_BYTES - 64));
    // A truncated head alone would collide for names sharing a long prefix, so
    // the tail is appended to keep distinct names distinct.
    const tail = filename.slice(-24);
    filename = `${head.replace(/�/g, "")}${tail}`;
  }

  /**
   * A name whose every character was stripped must not collapse onto a shared
   * key. `///.pdf` and `???.pdf` both sanitise to `.pdf`, which is the same
   * distinct-names-one-key failure that motivated this function's rewrite,
   * just with pathological ASCII instead of ordinary CJK.
   *
   * Only the case where the *basename* is emptied is treated this way, so a
   * legitimately dot-leading name like `.gitignore` — whose basename was empty
   * to begin with — keeps the key it has today.
   */
  if (!basenameOf(filename) && basenameOf(originalName)) {
    filename = `file-${fingerprintName(originalName)}${filename}`;
  }

  if (!filename || /^[_.]+$/.test(filename)) {
    /**
     * Every character was stripped — a name made only of separators or
     * punctuation. Throwing here would reject a file the user considers
     * perfectly ordinary, and the old code did exactly that for `日本語`.
     * A stable placeholder derived from the original keeps the upload working
     * and keeps two such names apart.
     */
    filename = `file-${fingerprintName(originalName)}`;
  }

  return filename;
}

/** Crockford base32, lowercase: no `i l o u`, and safe on case-insensitive disks. */
const BASE32 = "0123456789abcdefghjkmnpqrstvwxyz";

/**
 * The sanitised filename with a random id before its extension:
 * `Q3 report.pdf` → `Q3_report-k3x9m2a7qp.pdf`.
 *
 * Ten base32 characters are 50 random bits: a collision within one prefix is
 * not a practical concern. The name stays readable in a bucket listing and the
 * extension stays last, where content-type sniffing and downloads look for it.
 */
export function uniqueName(originalName: string): string {
  const id = Array.from(
    crypto.getRandomValues(new Uint8Array(10)),
    (byte) => BASE32[byte & 31]
  ).join("");

  const safe = sanitizeFilename(originalName);
  const dot = safe.lastIndexOf(".");
  // A dot at 0 is a dotfile (`.env`), not an extension.
  return dot > 0 ? `${safe.slice(0, dot)}-${id}${safe.slice(dot)}` : `${safe}-${id}`;
}

/**
 * Whether `key` lies inside the folder `prefix`: the check behind "may this
 * user act on this key?", for a key that came back from a client.
 *
 * Segment-aware, so `users/1` does not contain `users/10/a.png`, which a
 * `startsWith` check gets wrong. Each segment of the prefix is sanitised the
 * way `.paths()` sanitises a computed prefix, so the prefix a route builds
 * from `metadata` is the one to check against.
 *
 * Fails closed. `false` for a key that is not one pushduck would produce
 * (a `..` segment, an unsanitised segment, anything {@link resolveKey}
 * refuses), for a key equal to the prefix itself, and for a prefix that
 * cannot be resolved. That includes a trailing `/`: `users/${id}/` with an
 * empty `id` must not be read as `users`, which would contain every user.
 *
 * @example
 * ```ts
 * storage.keys.inScope("users/1/a.png", "users/1");     // true
 * storage.keys.inScope("users/10/a.png", "users/1");    // false
 * storage.keys.inScope("users/1/../2/a.png", "users/1"); // false
 * ```
 */
export function inScope(key: string, prefix: string): boolean {
  let scope: string;
  try {
    if (resolveKey(key) !== key) return false;
    scope = resolveKey(prefix);
  } catch {
    return false;
  }
  return key.startsWith(`${scope}/`);
}

/** A lone UTF-16 surrogate: a string that has no UTF-8 encoding. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/**
 * Turns a path fragment into an object key, or refuses it.
 *
 * Every key a route produces comes through here: the default, a prefix, and a
 * `generateKey` escape hatch alike. Two halves, both required:
 *
 * 1. **Refuse** what cannot be made safe: an empty or absolute key, `? # %`,
 *    control and bidi characters, and empty, `.` or `..` segments. A
 *    `generateKey` that interpolates `metadata.folder` would otherwise write
 *    `../../other-tenant/x` wherever the caller pointed it.
 * 2. **Re-sanitise** every segment with {@link sanitizeFilename}. Without it,
 *    the Unicode handling protects only the default key, and `文档.pdf` and
 *    `写真.pdf` start colliding again for exactly the apps that customised
 *    their keys.
 *
 * Refusal, rather than silent repair, for the dangerous characters: in a key
 * the application chose, storing something other than what was asked for is
 * the worse failure. Django (CVE-2024-39330) and Rails (CVE-2026-33173) both
 * learned to put this check where no override can skip it.
 *
 * The failure is `VALIDATION_FAILED`, which presign reports against the one
 * file whose key it was, like any other per-file rejection.
 *
 * @throws {UploadError} `VALIDATION_FAILED` naming the fragment and the rule.
 */
export function resolveKey(fragment: string): string {
  const reject = (why: string) =>
    new UploadError(
      "VALIDATION_FAILED",
      `Object key ${JSON.stringify(fragment)} ${why}. ` +
        "Keys are relative paths; pushduck sanitises each segment.",
      { meta: { key: fragment } }
    );

  if (typeof fragment !== "string") {
    throw new UploadError(
      "VALIDATION_FAILED",
      `Object key must be a string, got ${fragment === null ? "null" : typeof fragment}`
    );
  }

  if (!fragment) throw reject("is empty");

  // Legal in S3 — it creates an object whose name begins with a slash — but
  // almost never intended, and it breaks every URL built by concatenation.
  if (fragment.startsWith("/")) throw reject("is absolute");

  if (LONE_SURROGATE.test(fragment)) throw reject("is not well-formed Unicode");

  for (const char of fragment) {
    if (char === "?" || char === "#" || char === "%") {
      throw reject(`contains "${char}", which changes how the key parses in a URL`);
    }
    if (DANGEROUS.test(char)) {
      const code = char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
      throw reject(`contains U+${code}, a control or bidi character`);
    }
  }

  const segments = fragment.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw reject("contains an empty, '.' or '..' segment");
  }

  const key = segments.map((segment) => sanitizeFilename(segment)).join("/");

  if (new TextEncoder().encode(key).length > MAX_KEY_BYTES) {
    throw reject(`exceeds S3's ${MAX_KEY_BYTES}-byte key limit once sanitised`);
  }

  return key;
}
