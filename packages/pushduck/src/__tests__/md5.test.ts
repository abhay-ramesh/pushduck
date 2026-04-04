/**
 * Tests for the pure-JS MD5 implementation.
 *
 * Test vectors are taken directly from RFC 1321 §A.5, cross-checked
 * against Node.js crypto to ensure byte-for-byte correctness.
 */

import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { md5Base64 } from "../core/utils/md5";

// Convert hex string to base64 for readable assertions
function hexToBase64(hex: string): string {
  const bytes = Buffer.from(hex, "hex");
  return bytes.toString("base64");
}

// Cross-check: compute base64 MD5 via Node.js crypto as ground truth
function nodemd5Base64(input: string): string {
  return createHash("md5").update(input, "utf8").digest("base64");
}

// RFC 1321 §A.5 test vectors (input → expected hex digest)
const RFC_VECTORS: [string, string][] = [
  ["",                                                "d41d8cd98f00b204e9800998ecf8427e"],
  ["a",                                               "0cc175b9c0f1b6a831c399e269772661"],
  ["abc",                                             "900150983cd24fb0d6963f7d28e17f72"],
  ["message digest",                                  "f96b697d7cb7938d525a2f31aaf161d0"],
  ["abcdefghijklmnopqrstuvwxyz",                      "c3fcd3d76192e4007dfb496cca67e13b"],
  ["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", "d174ab98d277d9f5a5611c2c9f419d9f"],
  ["12345678901234567890123456789012345678901234567890123456789012345678901234567890", "57edf4a22be3c955ac49da2e2107b67a"],
];

describe("md5Base64 — RFC 1321 test vectors", () => {
  it.each(RFC_VECTORS)(
    'MD5("%s") === %s',
    (input, expectedHex) => {
      expect(md5Base64(input)).toBe(hexToBase64(expectedHex));
    }
  );
});

describe("md5Base64 — cross-check against Node.js crypto", () => {
  const INPUTS = [
    "",
    "hello",
    "The quick brown fox jumps over the lazy dog",
    "The quick brown fox jumps over the lazy dog.",
    // 55 bytes — last byte before padding boundary
    "a".repeat(55),
    // 56 bytes — first byte that spills into a second block
    "a".repeat(56),
    // 64 bytes — exactly one full block
    "a".repeat(64),
    // 128 bytes — exactly two full blocks
    "a".repeat(128),
    // Multi-byte UTF-8 characters
    "こんにちは",
    "🦆",
    // Realistic S3 batch-delete XML payload
    `<?xml version="1.0" encoding="UTF-8"?>\n<Delete>\n  <Object><Key>uploads/photo.jpg</Key></Object>\n  <Object><Key>uploads/doc.pdf</Key></Object>\n</Delete>`,
  ];

  it.each(INPUTS)('matches Node.js crypto for input: "%s"', (input) => {
    expect(md5Base64(input)).toBe(nodemd5Base64(input));
  });
});

describe("md5Base64 — properties", () => {
  it("is deterministic", () => {
    const xml = `<?xml version="1.0"?><Delete><Object><Key>file.jpg</Key></Object></Delete>`;
    expect(md5Base64(xml)).toBe(md5Base64(xml));
  });

  it("produces different digests for different inputs", () => {
    expect(md5Base64("foo")).not.toBe(md5Base64("bar"));
  });

  it("returns a 24-character base64 string (128-bit digest)", () => {
    // 16 bytes → 24 base64 chars (with padding)
    expect(md5Base64("hello")).toHaveLength(24);
    expect(md5Base64("hello")).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("is sensitive to a single bit change", () => {
    expect(md5Base64("hello")).not.toBe(md5Base64("Hello"));
    expect(md5Base64("hello")).not.toBe(md5Base64("hello "));
  });
});
