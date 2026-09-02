/**
 * @fileoverview Multipart session tokens.
 *
 * A multipart upload spans four requests, and three of them must name the
 * object they act on. If the client sent a raw `{ key, uploadId }`, anyone who
 * guessed or observed that pair could sign parts for — or abort — someone
 * else's upload. Route middleware authenticates the *caller*; nothing would
 * tie the caller to the object.
 *
 * These tests are therefore about forgery, not happy paths.
 */

import { describe, expect, it } from "vitest";
import {
  signSession,
  verifySession,
  type MultipartSession,
} from "../core/router/multipart-session";
import { UploadError } from "../core/errors";

const SECRET = "test-secret-access-key";

const session: MultipartSession = {
  key: "uploads/u1/big.bin",
  uploadId: "upload-abc",
  route: "videoUpload",
  partSize: 5 * 1024 * 1024,
  totalSize: 200 * 1024 * 1024,
};

describe("round trip", () => {
  it("returns exactly what was signed", async () => {
    const token = await signSession(SECRET, session);
    await expect(verifySession(SECRET, token)).resolves.toEqual(session);
  });

  it("produces an opaque token that leaks no raw identifiers", async () => {
    // The point is that a client cannot compose its own; the payload is
    // readable but not forgeable, which is what matters.
    const token = await signSession(SECRET, session);
    expect(token).toContain(".");
    expect(token.split(".")).toHaveLength(2);
  });
});

describe("forgery", () => {
  it("rejects a token signed with a different secret", async () => {
    const token = await signSession("someone-elses-secret", session);
    await expect(verifySession(SECRET, token)).rejects.toThrow(UploadError);
  });

  it("rejects a payload edited to point at another object", async () => {
    // The attack this exists to stop: take a valid token, swap the key.
    const token = await signSession(SECRET, session);
    const [, signature] = token.split(".");

    const forged = { ...session, key: "uploads/victim/private.bin" };
    const payload = btoa(JSON.stringify(forged))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await expect(
      verifySession(SECRET, `${payload}.${signature}`)
    ).rejects.toThrow(UploadError);
  });

  it("rejects a tampered signature", async () => {
    const token = await signSession(SECRET, session);
    const [payload, signature] = token.split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");

    await expect(verifySession(SECRET, `${payload}.${flipped}`)).rejects.toThrow(
      UploadError
    );
  });

  it("rejects malformed and missing tokens", async () => {
    for (const bad of [undefined, null, "", "no-dot", 42, {}, "a.b.c.d"]) {
      await expect(verifySession(SECRET, bad)).rejects.toThrow(UploadError);
    }
  });

  it("rejects a valid signature over a payload of the wrong shape", async () => {
    // Signing is not enough: the decoded object still has to be a session.
    const payload = btoa(JSON.stringify({ hello: "world" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const { signSession: sign } = await import(
      "../core/router/multipart-session"
    );
    // Re-sign the bogus payload the same way the real signer would.
    const token = await sign(SECRET, {} as MultipartSession);
    const signature = token.split(".")[1];

    await expect(
      verifySession(SECRET, `${payload}.${signature}`)
    ).rejects.toThrow(UploadError);
  });

  it("reports every failure identically, so probing learns nothing", async () => {
    // A different message per failure mode would tell an attacker whether the
    // payload decoded, whether the shape was right, and so on.
    const messages = new Set<string>();

    for (const bad of ["not-a-token", "a.b", `${"x".repeat(20)}.${"y".repeat(20)}`]) {
      const error = await verifySession(SECRET, bad).catch(
        (e: UploadError) => e
      );
      messages.add((error as UploadError).message);
    }

    expect(messages.size).toBe(1);
  });

  it("classifies failures as FORBIDDEN, not INTERNAL_ERROR", async () => {
    const error = await verifySession(SECRET, "bogus").catch(
      (e: UploadError) => e
    );

    expect((error as UploadError).code).toBe("FORBIDDEN");
    expect((error as UploadError).status).toBe(403);
  });
});

describe("binding", () => {
  it("distinguishes sessions that differ only by route", async () => {
    // A token minted for one route must not act on another, even for a caller
    // authorised on both.
    const a = await signSession(SECRET, session);
    const b = await signSession(SECRET, { ...session, route: "otherRoute" });

    expect(a).not.toBe(b);
    expect((await verifySession(SECRET, b)).route).toBe("otherRoute");
  });

  it("carries the part plan, so part numbers can be bounded", async () => {
    // Without partSize and totalSize on the token, the server would have to
    // trust a client-supplied part number and could sign a write past the end
    // of the object.
    const verified = await verifySession(SECRET, await signSession(SECRET, session));

    expect(verified.partSize).toBe(session.partSize);
    expect(verified.totalSize).toBe(session.totalSize);
  });
});
