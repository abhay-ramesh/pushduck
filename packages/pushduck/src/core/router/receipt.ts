/**
 * @fileoverview Upload receipts — the server's sealed record of what it
 * authorised.
 *
 * An upload spans several requests: presign, the transfer itself, and
 * completion (for multipart, part signing in between). Only the first one runs
 * with the full picture — the caller's input, the middleware's decision, the
 * key derived from it. Everything after that has to act on *that* decision, and
 * the only party carrying state between the requests is the client.
 *
 * So the presign response carries a receipt: the route, the key, the file as
 * declared, the client's input exactly as received, the middleware's output,
 * and an expiry — sealed with an HMAC the client cannot forge. Later requests
 * present the receipt instead of restating any of it, and the server reads its
 * own record back.
 *
 * That one structure removes three classes of bug pushduck and its users kept
 * hitting:
 *
 * - **Trusted claims.** 0.6 handed `onUploadComplete` whatever metadata the
 *   completion request contained, so any caller could attach an upload to any
 *   record. The receipt's `metadata` is the middleware's own output.
 * - **Middleware re-run on its own output.** 0.7 re-ran middleware at
 *   completion over metadata the client echoed back — the middleware's output,
 *   not its input — so middleware that reads a field it does not return threw,
 *   and quota middleware counted twice. The receipt keeps `input`, so every
 *   later request runs middleware over the same input as presign did.
 * - **Lost decisions on long uploads.** Multipart calls after `init` ran
 *   middleware with an empty placeholder. The receipt carries the file and the
 *   input to every part request.
 *
 * Receipts are signed, not encrypted: the presign response already returns
 * `metadata` to the client, so sealing it exposes nothing new. Middleware
 * output must never contain secrets.
 *
 * The format is shared with the Go and Python servers.
 */

import { UploadError } from "../errors";
import {
  fromBase64Url,
  hmac,
  timingSafeEqual,
  toBase64Url,
} from "./token-crypto";

/** The file as the client declared it at presign. */
export interface ReceiptFile {
  name: string;
  type: string;
  size: number;
}

/** Present when the bytes travel as a multipart upload. */
export interface ReceiptMultipart {
  /** Provider-assigned multipart upload id. */
  uploadId: string;
  /** Uniform part size agreed at init; `file.size` bounds the part count. */
  partSize: number;
}

/** What the server authorised when it issued a presigned upload. */
export interface UploadReceipt {
  v: 2;
  /**
   * Random, unguessable, unique per upload. Stable across every request of one
   * upload, so `onUploadComplete` can use it as an idempotency key when a
   * completion is retried.
   */
  id: string;
  route: string;
  key: string;
  file: ReceiptFile;
  /** The client's metadata exactly as presign received it. */
  input: Record<string, unknown>;
  /** The middleware chain's output — the authoritative metadata. */
  metadata: Record<string, unknown>;
  multipart?: ReceiptMultipart;
  /** Unix seconds after which the receipt is refused. */
  exp: number;
}

/**
 * How long after a single-PUT URL expires its receipt can still complete it.
 * The PUT may start at the last moment and take a while; completion follows.
 */
export const COMPLETION_GRACE_SECONDS = 60 * 60;

/**
 * How long a multipart receipt lives. A large upload resumed after a network
 * loss can span days; R2 aborts abandoned multipart uploads after seven.
 */
export const MULTIPART_RECEIPT_SECONDS = 7 * 24 * 60 * 60;

const PURPOSE = "receipt";

/** A fresh upload id: 128 random bits, base64url. */
export function newUploadId(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

/** Seals a receipt into the opaque token handed to the client. */
export async function sealReceipt(
  secret: string,
  receipt: UploadReceipt
): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(receipt)));
  return `${payload}.${await hmac(`${PURPOSE}:${secret}`, payload)}`;
}

/**
 * Reads a receipt back, or returns `null` when the token is not a receipt at
 * all (so the caller can try an older token format).
 *
 * @throws {UploadError} `FORBIDDEN` for a receipt whose signature, shape or
 *   expiry is wrong — indistinguishable to the caller, so probing a token
 *   reveals nothing about which part failed.
 */
export async function openReceipt(
  secret: string,
  token: unknown,
  now: number = Date.now()
): Promise<UploadReceipt | null> {
  if (typeof token !== "string") return null;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  if (!timingSafeEqual(signature, await hmac(`${PURPOSE}:${secret}`, payload))) {
    return null;
  }

  // From here the token is genuinely ours: any further problem is a refusal,
  // not "some other format".
  const refuse = (): never => {
    throw new UploadError("FORBIDDEN", "Invalid or expired upload receipt", {
      meta: { reason: "receipt" },
    });
  };

  let receipt: UploadReceipt;
  try {
    receipt = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payload))
    ) as UploadReceipt;
  } catch {
    return refuse();
  }

  if (!isWellFormed(receipt)) refuse();
  if (receipt.exp * 1000 <= now) refuse();

  return receipt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWellFormed(receipt: unknown): receipt is UploadReceipt {
  if (!isRecord(receipt) || receipt.v !== 2) return false;
  const { id, route, key, file, input, metadata, multipart, exp } = receipt;

  return (
    typeof id === "string" &&
    typeof route === "string" &&
    typeof key === "string" &&
    isRecord(file) &&
    typeof file.name === "string" &&
    typeof file.type === "string" &&
    typeof file.size === "number" &&
    isRecord(input) &&
    isRecord(metadata) &&
    typeof exp === "number" &&
    (multipart === undefined ||
      (isRecord(multipart) &&
        typeof multipart.uploadId === "string" &&
        typeof multipart.partSize === "number"))
  );
}
