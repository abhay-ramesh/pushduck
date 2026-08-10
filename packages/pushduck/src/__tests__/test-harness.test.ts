/**
 * Guards the integrity of the test harness itself.
 *
 * `setupTests.ts` previously replaced File, Blob, fetch and AbortController
 * with hand-written stubs. Those stubs were wrong in ways that let real bugs
 * pass — most importantly `MockFile.size` summed `parts.length`, producing
 * character counts for strings and NaN for ArrayBuffer/Blob parts. Since
 * `NaN > limit` is false, an oversized file passed a maxFileSize check.
 *
 * Every assertion here fails under those stubs. If someone reintroduces a
 * global stub, this file goes red rather than the suite quietly lying.
 */
import { describe, expect, it } from "vitest";

describe("test harness integrity", () => {
  describe("File reports real byte lengths", () => {
    it("counts UTF-8 bytes, not characters", () => {
      // Old MockFile: 5 (string length). Real: 6 (é is two bytes).
      expect(new File(["héllo"], "a.txt").size).toBe(6);
      // Old MockFile: 2 (UTF-16 code units). Real: 4.
      expect(new File(["👋"], "b.txt").size).toBe(4);
    });

    it("handles ArrayBuffer parts", () => {
      // Old MockFile: NaN — ArrayBuffer has byteLength, not length.
      expect(new File([new ArrayBuffer(1024)], "c.bin").size).toBe(1024);
    });

    it("handles Blob parts", () => {
      // Old MockFile: NaN — Blob has size, not length.
      expect(new File([new Blob(["12345"])], "d.bin").size).toBe(5);
    });

    it("sums mixed parts", () => {
      const f = new File(["ab", new ArrayBuffer(3), new Blob(["cd"])], "e.bin");
      expect(f.size).toBe(2 + 3 + 2);
    });

    it("does not let an oversized file pass a size check", () => {
      const limit = 1_000_000;
      const oversized = new File([new ArrayBuffer(2_000_000)], "big.bin");
      // The bug this guards: NaN > limit === false, so this read as "under limit".
      expect(Number.isNaN(oversized.size)).toBe(false);
      expect(oversized.size > limit).toBe(true);
    });
  });

  describe("globals are the real implementations", () => {
    it("exposes the real File API surface", async () => {
      const f = new File(["abc"], "f.txt", { type: "text/plain" });
      expect(typeof f.arrayBuffer).toBe("function");
      expect(typeof f.text).toBe("function");
      expect(await f.text()).toBe("abc");
      expect(f.type).toBe("text/plain");
    });

    it("Blob exposes its real API", async () => {
      const b = new Blob(["hello"], { type: "text/plain" });
      expect(b.size).toBe(5);
      expect(await b.text()).toBe("hello");
    });

    it("AbortController actually notifies listeners", () => {
      // Old MockAbortController: addEventListener was vi.fn(), so this stayed false.
      const ac = new AbortController();
      let fired = false;
      ac.signal.addEventListener("abort", () => {
        fired = true;
      });
      ac.abort();
      expect(fired).toBe(true);
      expect(ac.signal.aborted).toBe(true);
    });

    it("fetch is not globally stubbed", () => {
      // Old setup: `global.fetch = vi.fn()` for every test, unconditionally.
      // Tests that need a fake fetch should stub it themselves.
      expect((globalThis.fetch as unknown as { _isMockFunction?: boolean })._isMockFunction).toBeUndefined();
    });
  });
});
