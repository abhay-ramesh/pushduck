/**
 * @fileoverview Primitives shared by every token the router issues.
 *
 * Receipts, multipart sessions and v1 completion tokens are all the same
 * construction — `base64url(JSON) "." base64url(HMAC-SHA256)` — keyed from the
 * provider's secret access key with a per-purpose prefix, so a token minted
 * for one purpose never verifies as another. The key derivation
 * (`pushduck-multipart:<purpose>:<secret>`) is shared with the Go and Python
 * servers; change it in all three or not at all.
 */

/** Base64url without padding — safe in a JSON body and in a URL. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function hmac(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`pushduck-multipart:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message)
  );

  return toBase64Url(new Uint8Array(signature));
}

/**
 * Compares two strings without leaking their difference through timing.
 *
 * A naive `===` returns as soon as bytes differ, which over many attempts
 * reveals how much of a forged signature was correct.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}
