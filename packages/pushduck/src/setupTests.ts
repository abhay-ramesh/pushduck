/**
 * Vitest setup.
 *
 * This file deliberately does NOT stub `File`, `Blob`, `fetch` or
 * `AbortController`. It used to, and the stubs were wrong in ways that let
 * real bugs pass: `MockFile.size` summed `parts.length`, so it reported
 * character counts instead of byte lengths and `NaN` for `Blob` parts —
 * and `NaN > limit` is `false`, so an oversized file silently passed
 * validation. `MockAbortController.abort()` never fired its listeners, so
 * cancellation could not be tested at all.
 *
 * Node 18 is the oldest version CI runs, and it provides native `Blob`,
 * `fetch`, `AbortController` and `crypto`. The single gap is `File`, which
 * only became a global in Node 20 — so it is filled from `node:buffer`,
 * which is the same spec implementation, not a hand-written imitation.
 *
 * Tests that need a fake `fetch` should stub it themselves, so the fake is
 * visible in the test that depends on it.
 */
import { File as NodeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, vi } from "vitest";

// Node 18 exposes File from node:buffer but not on globalThis (added in Node 20).
if (typeof globalThis.File === "undefined") {
  globalThis.File = NodeFile as unknown as typeof globalThis.File;
}

// Node 16 lacks the Web Crypto global. Node 18+ provides it natively.
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
