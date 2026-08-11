/**
 * @fileoverview An upload that stops moving must fail, not hang forever.
 *
 * `XMLHttpRequest.timeout` defaults to `0`, which means no timeout at all. A
 * client that enters a tunnel, or a proxy that accepts the connection and then
 * never responds, produces a request that never errors, never retries and never
 * resolves. The progress bar freezes and nothing else happens — ever. This is
 * tus #773 verbatim, plus Uppy #621/#622 and UpChunk #149.
 *
 * ## Why not simply set `xhr.timeout`
 *
 * Because it is a *total request* timeout, not an idle one. Setting it to any
 * value large enough to permit a legitimate multi-gigabyte upload is far too
 * large to catch a stall, and any value small enough to catch a stall will kill
 * healthy long uploads — the exact case multipart exists to serve.
 *
 * The distinction that matters is "slow" versus "dead", and only a **stall
 * watchdog** can draw it: reset a timer on every progress event and fail when
 * no bytes have moved for N seconds. A transfer crawling at 10 kB/s keeps
 * resetting the timer and survives; a transfer moving nothing trips it.
 *
 * These tests drive the timer explicitly rather than waiting on wall-clock
 * time, so they assert the mechanism rather than the durations.
 */

import { describe, expect, it, vi } from "vitest";
import { UploadError } from "../core/errors";
import { xhrTransport } from "../core/upload/transport";

/**
 * A scriptable `XMLHttpRequest` double.
 *
 * The real class cannot express "accepted the connection, then went silent",
 * which is the only state worth testing here.
 */
class FakeXHR {
  static instances: FakeXHR[] = [];

  upload = { onprogress: null as ((event: unknown) => void) | null };
  status = 200;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  aborted = false;
  sent = false;

  constructor() {
    FakeXHR.instances.push(this);
  }

  open() {}
  setRequestHeader() {}
  getResponseHeader() {
    return '"etag"';
  }
  send() {
    this.sent = true;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  /** Simulates bytes arriving, which must reset the watchdog. */
  emitProgress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }

  finish() {
    this.onload?.();
  }
}

function install() {
  FakeXHR.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  return () => FakeXHR.instances[0];
}

const body = new Blob([new Uint8Array(1000)]);

describe("stall watchdog", () => {
  it("fails an upload that never moves a byte", async () => {
    vi.useFakeTimers();
    const xhr = install();

    const transfer = xhrTransport({
      url: "https://storage.example/put",
      body,
      headers: {},
      stallTimeoutMs: 30_000,
    });

    // The server accepted the connection and then said nothing at all.
    expect(xhr().sent).toBe(true);

    await vi.advanceTimersByTimeAsync(30_001);

    await expect(transfer).rejects.toThrow(/stall|no data|timed out/i);
    // The socket must actually be released, not merely reported as failed.
    expect(xhr().aborted).toBe(true);

    vi.useRealTimers();
  });

  it("reports a retryable TIMEOUT, so the part is attempted again", async () => {
    // A stall is transient by nature. Classifying it as permanent would turn a
    // tunnel into a failed upload.
    vi.useFakeTimers();
    install();

    const transfer = xhrTransport({
      url: "https://storage.example/put",
      body,
      headers: {},
      stallTimeoutMs: 10_000,
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(10_001);
    const error = await transfer;

    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).code).toBe("TIMEOUT");
    expect((error as UploadError).retryable).toBe(true);

    vi.useRealTimers();
  });

  it("does not fail a slow upload that keeps making progress", async () => {
    // The regression this guards: a 4 GB upload over a poor connection must
    // survive, which is precisely what `xhr.timeout` would break.
    vi.useFakeTimers();
    const xhr = install();

    const transfer = xhrTransport({
      url: "https://storage.example/put",
      body,
      headers: {},
      stallTimeoutMs: 10_000,
    });

    // Ten intervals, each just short of the limit, with a trickle of bytes.
    for (let i = 1; i <= 10; i++) {
      await vi.advanceTimersByTimeAsync(9_000);
      xhr().emitProgress(i * 10, 1000);
    }

    // Far past the timeout in total, but never idle for long enough.
    xhr().finish();
    await expect(transfer).resolves.toBeDefined();
    expect(xhr().aborted).toBe(false);

    vi.useRealTimers();
  });

  it("stops watching once the request completes", async () => {
    // A timer left running would fire after a successful upload and, at best,
    // abort an XHR that has already finished.
    vi.useFakeTimers();
    const xhr = install();

    const transfer = xhrTransport({
      url: "https://storage.example/put",
      body,
      headers: {},
      stallTimeoutMs: 5_000,
    });

    xhr().emitProgress(1000, 1000);
    xhr().finish();
    await expect(transfer).resolves.toBeDefined();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(xhr().aborted).toBe(false);

    vi.useRealTimers();
  });

  it("is disabled when the timeout is zero", async () => {
    // An escape hatch for a caller who genuinely wants to wait indefinitely,
    // and the behaviour every existing deployment has today.
    vi.useFakeTimers();
    const xhr = install();

    const transfer = xhrTransport({
      url: "https://storage.example/put",
      body,
      headers: {},
      stallTimeoutMs: 0,
    });

    await vi.advanceTimersByTimeAsync(600_000);
    expect(xhr().aborted).toBe(false);

    xhr().finish();
    await expect(transfer).resolves.toBeDefined();

    vi.useRealTimers();
  });

  it("prefers the caller's abort signal over the watchdog", async () => {
    // A user pressing cancel must produce a cancellation, not a timeout, or
    // the multipart layer will helpfully retry what they asked to stop.
    vi.useFakeTimers();
    const xhr = install();
    const controller = new AbortController();

    const transfer = xhrTransport({
      url: "https://storage.example/put",
      body,
      headers: {},
      stallTimeoutMs: 30_000,
      signal: controller.signal,
    }).catch((error) => error);

    controller.abort();
    const error = await transfer;

    expect(error).not.toBeInstanceOf(UploadError);
    expect((error as Error).name).toBe("UploadAbortedError");
    expect(xhr().aborted).toBe(true);

    vi.useRealTimers();
  });

  it("applies a default timeout when none is given", async () => {
    // The point of the change: existing callers who pass nothing must stop
    // hanging forever. A default that had to be opted into would leave every
    // current deployment exposed.
    vi.useFakeTimers();
    const xhr = install();

    const transfer = xhrTransport({
      url: "https://storage.example/put",
      body,
      headers: {},
    }).catch((error) => error);

    await vi.advanceTimersByTimeAsync(120_001);
    const error = await transfer;

    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).code).toBe("TIMEOUT");
    expect(xhr().aborted).toBe(true);

    vi.useRealTimers();
  });
});
