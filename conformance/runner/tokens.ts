/**
 * @fileoverview Minting and tampering with the reference servers' receipts.
 *
 * The protocol makes `completionToken` opaque, and a conforming server may use
 * any token it likes. The TypeScript, Go and Python servers share one: the
 * receipt, `base64url(JSON) "." base64url(HMAC-SHA256)`, keyed
 * `pushduck-multipart:receipt:<secret>` (see `protocol.mdx`, "The reference
 * servers' token: a receipt").
 *
 * Fixtures that build tokens stay meaningful for any server: a server that
 * issues some other token has never seen these and refuses them, which is the
 * same `403` the fixture asserts. For the reference servers they test the
 * specific rule — expiry, signature — rather than only "unknown token".
 */

import { createHmac } from "node:crypto";

const toBase64Url = (bytes: Buffer) =>
  bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** `{ "$seal": claim }`: a receipt sealed with the server's secret. */
export function sealReceipt(secret: string, claim: unknown): string {
  const payload = toBase64Url(Buffer.from(JSON.stringify(claim)));
  const signature = toBase64Url(
    createHmac("sha256", `pushduck-multipart:receipt:${secret}`).update(payload).digest()
  );
  return `${payload}.${signature}`;
}

/**
 * `{ "$tamper": { "token": …, "set": { … } } }`: the token's claim with fields
 * replaced, presented under the original signature — what a client that edits
 * its own receipt sends.
 */
export function tamperToken(token: string, set: Record<string, unknown>): string {
  const [payload, signature] = token.split(".");
  const claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const edited = toBase64Url(Buffer.from(JSON.stringify({ ...claim, ...set })));
  return `${edited}.${signature}`;
}
