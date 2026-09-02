/**
 * @fileoverview Tamper-proof multipart session tokens.
 *
 * A multipart upload spans four requests, and the last three have to name the
 * object they act on. If the client simply sent `{ key, uploadId }`, anyone
 * could sign parts for — or abort — someone else's upload by guessing or
 * observing that pair. The route's middleware authenticates the *caller*, but
 * nothing would tie the caller to the object.
 *
 * So `init` returns an opaque token binding the key, uploadId and route
 * together under an HMAC, and the later calls present the token instead of raw
 * identifiers. The server re-derives the values from it rather than trusting
 * anything the client sent.
 *
 * The signing key is derived from the provider's secret access key, which the
 * server already holds and never discloses. No new configuration, no new
 * secret to rotate.
 */

import { UploadError } from "../errors";

/** What a session token asserts, once verified. */
export interface MultipartSession {
  /** Object key the parts assemble into. */
  key: string;
  /** Provider-assigned multipart session id. */
  uploadId: string;
  /** Route that created the session. */
  route: string;
  /** Uniform part size agreed at init, needed to validate part numbers. */
  partSize: number;
  /** Total object size, so a part number beyond the end can be rejected. */
  totalSize: number;
}

/** Base64url without padding — safe in a JSON body and in a URL. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(secret: string, message: string): Promise<string> {
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
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

/** Issues a signed token for a newly created multipart session. */
export async function signSession(
  secret: string,
  session: MultipartSession
): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(session)));
  return `${payload}.${await hmac(secret, payload)}`;
}

/**
 * Verifies a token and returns the session it asserts.
 *
 * @throws {UploadError} `FORBIDDEN` if the token is missing, malformed, or
 *   its signature does not match — all indistinguishable to the caller, so a
 *   probe learns nothing about which part was wrong.
 */
export async function verifySession(
  secret: string,
  token: unknown
): Promise<MultipartSession> {
  const reject = () => {
    throw new UploadError(
      "FORBIDDEN",
      "Invalid or expired multipart session",
      { meta: { reason: "session-token" } }
    );
  };

  if (typeof token !== "string" || !token.includes(".")) reject();

  const [payload, signature] = (token as string).split(".");
  if (!payload || !signature) reject();

  if (!timingSafeEqual(signature, await hmac(secret, payload))) reject();

  try {
    const decoded = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payload))
    ) as MultipartSession;

    // A valid signature over a malformed payload should still not proceed.
    if (
      typeof decoded.key !== "string" ||
      typeof decoded.uploadId !== "string" ||
      typeof decoded.route !== "string" ||
      typeof decoded.partSize !== "number" ||
      typeof decoded.totalSize !== "number"
    ) {
      reject();
    }

    return decoded;
  } catch {
    return reject() as never;
  }
}


// ========================================
// Completion tokens
// ========================================

/** What a completion token asserts, once verified. */
export interface CompletionClaim {
  /** Object key this completion is allowed to name. */
  key: string;
  /** Route the key was presigned on. */
  route: string;
}

/**
 * Issues a token binding a presigned key to the route that issued it.
 *
 * Completion runs the route's middleware, so an anonymous caller cannot forge
 * one. But the key arrives in the request body, and middleware authenticates
 * the *caller*, not the *object* — so an authenticated user can complete
 * against a key belonging to someone else. Default keys are frequently
 * predictable, and `onUploadComplete` is where applications attach a file to a
 * record and grant access to it.
 *
 * The token is the same construction as a multipart session and exists for the
 * same reason: the server re-derives the key from something it signed rather
 * than trusting what it was sent.
 */
export async function signCompletion(
  secret: string,
  claim: CompletionClaim
): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(claim)));
  return `${payload}.${await hmac(`completion:${secret}`, payload)}`;
}

/**
 * Verifies a completion token and returns what it asserts.
 *
 * @throws {UploadError} `FORBIDDEN` if the token is missing, malformed or
 *   unsigned — indistinguishable to the caller, so probing reveals nothing.
 */
export async function verifyCompletion(
  secret: string,
  token: unknown
): Promise<CompletionClaim> {
  const reject = (): never => {
    throw new UploadError("FORBIDDEN", "Invalid completion token", {
      meta: { reason: "completion-token" },
    });
  };

  if (typeof token !== "string" || !token.includes(".")) reject();

  const [payload, signature] = (token as string).split(".");
  if (!payload || !signature) reject();

  if (!timingSafeEqual(signature, await hmac(`completion:${secret}`, payload))) {
    reject();
  }

  try {
    const decoded = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payload))
    ) as CompletionClaim;

    if (typeof decoded.key !== "string" || typeof decoded.route !== "string") {
      reject();
    }

    return decoded;
  } catch {
    return reject();
  }
}
