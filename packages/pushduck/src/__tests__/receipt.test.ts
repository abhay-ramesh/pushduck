/**
 * @fileoverview Upload receipts: what the server sealed is what it reads back.
 */

import { describe, expect, it } from "vitest";
import { UploadError } from "../core/errors";
import {
  newUploadId,
  openReceipt,
  sealReceipt,
  type UploadReceipt,
} from "../core/router/receipt";
import { signCompletion, signSession } from "../core/router/multipart-session";

const SECRET = "server-secret";
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);

function receipt(overrides: Partial<UploadReceipt> = {}): UploadReceipt {
  return {
    v: 2,
    id: "upload-1",
    route: "avatar",
    key: "users/u1/photo.jpg",
    file: { name: "photo.jpg", type: "image/jpeg", size: 1000 },
    input: { slug: "abc" },
    metadata: { userId: "u1", slug: "abc" },
    exp: NOW / 1000 + 3600,
    ...overrides,
  };
}

async function refusal(promise: Promise<unknown>) {
  const error = await promise.catch((caught) => caught);
  expect(error).toBeInstanceOf(UploadError);
  expect(error).toMatchObject({ code: "FORBIDDEN" });
}

describe("upload receipts", () => {
  it("reads back exactly what was sealed", async () => {
    const sealed = receipt({ multipart: { uploadId: "mp-1", partSize: 5 * 1024 * 1024 } });
    const token = await sealReceipt(SECRET, sealed);

    expect(await openReceipt(SECRET, token, NOW)).toEqual(sealed);
  });

  it("refuses a receipt whose payload was edited", async () => {
    const token = await sealReceipt(SECRET, receipt());
    const [payload, signature] = token.split(".");
    const edited = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    edited.metadata.userId = "victim";
    const forged = `${btoa(JSON.stringify(edited)).replace(/=+$/, "")}.${signature}`;

    // Not ours (the signature no longer matches), so it is not a receipt.
    expect(await openReceipt(SECRET, forged, NOW)).toBeNull();
  });

  it("refuses an expired receipt", async () => {
    const token = await sealReceipt(SECRET, receipt({ exp: NOW / 1000 - 1 }));

    await refusal(openReceipt(SECRET, token, NOW));
  });

  it("does not verify under another server's secret", async () => {
    const token = await sealReceipt(SECRET, receipt());

    expect(await openReceipt("other-secret", token, NOW)).toBeNull();
  });

  it("is not confused with the older token formats", async () => {
    // Same construction, different purpose key: never interchangeable.
    const completion = await signCompletion(SECRET, { key: "k", route: "r" });
    const session = await signSession(SECRET, {
      key: "k",
      uploadId: "u",
      route: "r",
      partSize: 1,
      totalSize: 1,
    });

    expect(await openReceipt(SECRET, completion, NOW)).toBeNull();
    expect(await openReceipt(SECRET, session, NOW)).toBeNull();
  });

  it("ignores values that are not tokens", async () => {
    for (const value of [undefined, null, 42, "", "no-dot", "a.b.c"]) {
      expect(await openReceipt(SECRET, value, NOW)).toBeNull();
    }
  });

  it("issues unguessable, distinct upload ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newUploadId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
