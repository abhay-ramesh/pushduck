/**
 * @fileoverview A request that cannot succeed must not be retried.
 *
 * The transport rejected every non-2xx response with a bare
 * `new Error("Upload failed with status: 403")`. The multipart retry loop
 * guards on `error instanceof UploadError && !error.retryable`, so a bare Error
 * never matched and **every** storage failure was retried to `maxAttempts`.
 *
 * That is wasted time and bandwidth on a request whose outcome is already
 * decided. An expired presigned URL returns 403 and will return 403 again three
 * seconds later; a malformed part returns 400 for ever. The user waits out the
 * full exponential backoff to reach the failure they were always going to get,
 * and on a metered connection pays for the re-sent bytes as well.
 *
 * The same bug is filed repeatedly upstream — tus #196 ("should not retry on
 * 409 or 423"), #723 ("infinite retry loop"), #66 ("abort retry on
 * BadRequests"), #636.
 *
 * The classification also reaches the caller: with a bare Error there is no
 * `errorCode` on the file, so an application cannot tell "your session expired,
 * sign in again" from "the network dropped, try again" — the distinction the
 * typed error layer exists to provide.
 */

import { describe, expect, it, vi } from "vitest";
import { UploadError } from "../core/errors";
import { MIB } from "../core/upload/multipart/limits";
import { createUploadEngine } from "../core/upload";
import { xhrTransport } from "../core/upload/transport";

/** An `XMLHttpRequest` double that answers with a fixed status. */
function installXHR(status: number) {
  class FakeXHR {
    upload = { onprogress: null as unknown };
    status = status;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    open() {}
    setRequestHeader() {}
    getResponseHeader() {
      return null;
    }
    send() {
      queueMicrotask(() => this.onload?.());
    }
    abort() {}
  }
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
}

const body = new Blob([new Uint8Array(10)]);

async function transferWithStatus(status: number) {
  installXHR(status);
  return xhrTransport({
    url: "https://storage.example/put",
    body,
    headers: {},
    stallTimeoutMs: 0,
  }).catch((error) => error as UploadError);
}

describe("storage failures are typed, not bare Errors", () => {
  it.each([
    [400, "BAD_REQUEST", false],
    [401, "UNAUTHORIZED", false],
    [403, "FORBIDDEN", false],
    [404, "NOT_FOUND", false],
    [413, "PAYLOAD_TOO_LARGE", false],
    [429, "RATE_LIMITED", true],
    [500, "STORAGE_UNAVAILABLE", true],
    [502, "STORAGE_UNAVAILABLE", true],
    [503, "STORAGE_UNAVAILABLE", true],
    [504, "TIMEOUT", true],
  ])("maps %i to %s (retryable: %s)", async (status, code, retryable) => {
    const error = await transferWithStatus(status);

    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).code).toBe(code);
    expect((error as UploadError).retryable).toBe(retryable);
  });

  it("keeps the status on the error for diagnosis", async () => {
    const error = (await transferWithStatus(403)) as UploadError;
    expect(error.meta).toMatchObject({ status: 403 });
  });

  it("treats a transport-level failure as a retryable network error", async () => {
    // `onerror` fires with no status at all — DNS failure, connection refused,
    // CORS rejection. Genuinely worth retrying.
    class FailingXHR {
      upload = { onprogress: null as unknown };
      status = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      getResponseHeader() {
        return null;
      }
      send() {
        queueMicrotask(() => this.onerror?.());
      }
      abort() {}
    }
    vi.stubGlobal("XMLHttpRequest", FailingXHR);

    const error = (await xhrTransport({
      url: "https://storage.example/put",
      body,
      headers: {},
      stallTimeoutMs: 0,
    }).catch((e) => e)) as UploadError;

    expect(error).toBeInstanceOf(UploadError);
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.retryable).toBe(true);
  });
});

/** Multipart server that answers the handshake. */
function createServer() {
  return vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const action =
      new URL(String(input), "http://x").searchParams.get("action") ?? "presign";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const reply = (payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    switch (action) {
      case "multipart-init":
        return reply({
          success: true,
          session: "s",
          key: "uploads/big.bin",
          partSize: 5 * MIB,
          metadata: {},
        });
      case "multipart-parts":
        return reply({ success: true, parts: [] });
      case "multipart-sign":
        return reply(
          body.partNumbers.map((partNumber: number) => ({
            partNumber,
            url: `https://storage.example/part/${partNumber}`,
          }))
        );
      case "multipart-complete":
        return reply({
          success: true,
          key: "uploads/big.bin",
          url: "https://cdn.example/uploads/big.bin",
        });
      default:
        return reply({ success: true });
    }
  });
}

function makeFile(size: number) {
  return new File([new Uint8Array(size)], "big.bin", {
    type: "application/octet-stream",
    lastModified: 0,
  });
}

function buildEngine(transport: unknown, maxAttempts = 4) {
  return createUploadEngine({
    route: "upload",
    endpoint: "/api/upload",
    fetcher: createServer(),
    transport: transport as never,
    multipart: {
      threshold: 6 * MIB,
      partSize: 5 * MIB,
      concurrency: 1,
      maxAttempts,
      sleep: async () => undefined,
    } as never,
  });
}

describe("multipart stops retrying what cannot succeed", () => {
  it("attempts a part exactly once when storage rejects it as a 4xx", async () => {
    // An expired presigned URL returns 403, and will return 403 again after
    // every backoff. Retrying spends the user's time and bandwidth to reach
    // the same failure.
    const attempts = vi.fn();
    const transport = async () => {
      attempts();
      throw new UploadError("FORBIDDEN", "Access denied by storage", {
        meta: { status: 403 },
      });
    };

    const engine = buildEngine(transport);
    await engine.upload([makeFile(12 * MIB)]);

    expect(engine.getSnapshot().files[0].status).toBe("error");
    expect(attempts).toHaveBeenCalledTimes(1);
  });

  it("still retries a 5xx, which may well succeed", async () => {
    // The counterpart: a transient provider failure must not be turned into a
    // permanent one by an over-eager classification.
    let calls = 0;
    const transport = async ({ body, onProgress }: any) => {
      calls++;
      if (calls < 3) {
        throw new UploadError("STORAGE_UNAVAILABLE", "503 from provider");
      }
      onProgress?.(body.size, body.size);
      return { etag: '"e"' };
    };

    const engine = buildEngine(transport);
    await engine.upload([makeFile(12 * MIB)]);

    expect(engine.getSnapshot().files[0].status).toBe("success");
    expect(calls).toBeGreaterThan(2);
  });

  it("retries a rate limit rather than failing the upload", async () => {
    let calls = 0;
    const transport = async ({ body, onProgress }: any) => {
      calls++;
      if (calls === 1) throw new UploadError("RATE_LIMITED", "429 slow down");
      onProgress?.(body.size, body.size);
      return { etag: '"e"' };
    };

    const engine = buildEngine(transport);
    await engine.upload([makeFile(12 * MIB)]);

    expect(engine.getSnapshot().files[0].status).toBe("success");
  });

  it("surfaces the storage error code on the file", async () => {
    // Without a code an application cannot distinguish "sign in again" from
    // "try again", which is the entire point of the typed error layer.
    const transport = async () => {
      throw new UploadError("FORBIDDEN", "Access denied by storage", {
        meta: { status: 403 },
      });
    };

    const engine = buildEngine(transport);
    await engine.upload([makeFile(12 * MIB)]);

    expect(engine.getSnapshot().files[0].errorCode).toBe("FORBIDDEN");
  });
});
