/**
 * @fileoverview Progress must never go backwards.
 *
 * A bar that retreats reads as "it broke" or "I lost my upload", and it is
 * filed as a bug in every library in this space — UploadThing #859
 * ("onUploadProgress going back to previous value"), UpChunk #146, rpldy #626.
 *
 * A single `PUT` gets this for free: one number that only grows. Multipart has
 * three ways to lose it:
 *
 * 1. **Double counting on commit.** A finished part is both "in flight at 5 MB"
 *    and "committed 5 MB". Count both and the total exceeds the file.
 * 2. **Out-of-order completion.** Parts finish in a different order than they
 *    started, so a naive sum jumps around.
 * 3. **Retry.** A part that fails at 4 of 5 MB must re-send those bytes, so its
 *    contribution resets to zero — and that reset is a real backward step.
 *
 * The first two were designed for. The third is what these tests pin down.
 *
 * ## The decision these tests encode
 *
 * The dip is *truthful*: those bytes really were wasted and really will be
 * re-sent. But truthfulness in the percentage is worth less than stability,
 * because a user reads the bar as "how close am I", not "how many bytes has my
 * radio moved".
 *
 * So `progress` is monotonic, while `uploadSpeed` and `eta` stay computed from
 * the real byte count. The bar holds steady during a re-transfer and the ETA
 * grows — which is exactly the truth a user needs, in the field that can
 * express it. Clamping the ETA too would be the actual lie.
 */

import { describe, expect, it, vi } from "vitest";
import { createUploadEngine } from "../core/upload";
import { MIB } from "../core/upload/multipart/limits";
import type { S3UploadedFile } from "../types";

function makeFile(size: number, name = "big.bin"): File {
  return new File([new Uint8Array(size)], name, {
    type: "application/octet-stream",
    lastModified: 0,
  });
}

/** Answers the multipart handshake; part transfer is left to the transport. */
function createServer(partSize = 5 * MIB) {
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
          partSize,
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
      case "presign":
        return reply({
          success: true,
          results: [
            {
              success: true,
              presignedUrl: "https://storage.example/single",
              key: "uploads/big.bin",
              requiredHeaders: {},
            },
          ],
        });
      default:
        return reply({ success: true });
    }
  });
}

/** Records every progress value the engine ever reported for a file. */
function trackProgress(engine: ReturnType<typeof createUploadEngine>) {
  const perFile = new Map<string, number[]>();
  const aggregate: number[] = [];

  engine.subscribe(() => {
    const state = engine.getSnapshot();
    aggregate.push(state.progress);
    for (const file of state.files) {
      const seen = perFile.get(file.id) ?? [];
      seen.push(file.progress);
      perFile.set(file.id, seen);
    }
  });

  return { perFile, aggregate };
}

/** Asserts a series never decreases, naming the exact step that did. */
function expectNonDecreasing(values: number[], label: string) {
  for (let i = 1; i < values.length; i++) {
    expect(
      values[i],
      `${label} went backwards at step ${i}: ${values[i - 1]} → ${values[i]}`
    ).toBeGreaterThanOrEqual(values[i - 1]);
  }
}

describe("multipart progress never retreats", () => {
  it("holds steady when a part fails midway and is retried", async () => {
    // The exact scenario: part 2 reaches 80% of its 5 MiB, dies, and starts
    // over. Those 4 MiB really are lost, but the bar must not un-fill.
    const failedOnce = new Set<number>();

    const transport = vi.fn(async ({ url, body, onProgress }: any) => {
      const partNumber = Number(url.split("/part/")[1]);

      if (partNumber === 2 && !failedOnce.has(partNumber)) {
        failedOnce.add(partNumber);
        // Report most of the part, then fail — the worst case for the bar.
        onProgress?.(Math.floor(body.size * 0.8), body.size);
        throw new Error("connection reset");
      }

      onProgress?.(body.size, body.size);
      return { etag: `"etag-${partNumber}"` };
    });

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: createServer(),
      transport,
      multipart: {
        threshold: 6 * MIB,
        partSize: 5 * MIB,
        concurrency: 1,
        maxAttempts: 3,
        sleep: async () => undefined,
      } as never,
    });

    const seen = trackProgress(engine);
    await engine.upload([makeFile(15 * MIB)]);

    expect(engine.getSnapshot().files[0].status).toBe("success");

    const [values] = [...seen.perFile.values()];
    expectNonDecreasing(values, "file progress");
    expect(values.at(-1)).toBe(100);
  });

  it("never exceeds 100, even though a retried part re-sends bytes", async () => {
    // The mirror failure: counting the abandoned attempt *and* the retry.
    const failedOnce = new Set<number>();
    const transport = vi.fn(async ({ url, body, onProgress }: any) => {
      const partNumber = Number(url.split("/part/")[1]);
      if (partNumber === 2 && !failedOnce.has(partNumber)) {
        failedOnce.add(partNumber);
        onProgress?.(body.size, body.size);
        throw new Error("reset after full transfer");
      }
      onProgress?.(body.size, body.size);
      return { etag: `"e"` };
    });

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: createServer(),
      transport,
      multipart: {
        threshold: 6 * MIB,
        partSize: 5 * MIB,
        concurrency: 1,
        maxAttempts: 3,
        sleep: async () => undefined,
      } as never,
    });

    const seen = trackProgress(engine);
    await engine.upload([makeFile(15 * MIB)]);

    const [values] = [...seen.perFile.values()];
    expect(Math.max(...values)).toBeLessThanOrEqual(100);
  });

  it("stays monotonic with parts completing out of order", async () => {
    // Concurrency is where a naive sum jumps about: part 3 can finish before
    // part 1, and each reports independently.
    const transport = vi.fn(async ({ url, body, onProgress }: any) => {
      const partNumber = Number(url.split("/part/")[1]);
      // Later parts finish first.
      const ticks = partNumber % 2 === 0 ? 1 : 4;
      for (let i = 1; i <= ticks; i++) {
        onProgress?.(Math.floor((body.size * i) / ticks), body.size);
        await Promise.resolve();
      }
      return { etag: `"etag-${partNumber}"` };
    });

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: createServer(),
      transport,
      multipart: {
        threshold: 6 * MIB,
        partSize: 5 * MIB,
        concurrency: 4,
        sleep: async () => undefined,
      } as never,
    });

    const seen = trackProgress(engine);
    await engine.upload([makeFile(30 * MIB)]);

    const [values] = [...seen.perFile.values()];
    expectNonDecreasing(values, "file progress");
    expect(values.at(-1)).toBe(100);
  });

  it("keeps the batch aggregate monotonic across several files", async () => {
    // Byte-weighted aggregation can regress even when each file is monotonic,
    // because a file entering the denominator changes the weighting.
    const failed = new Set<string>();
    const transport = vi.fn(async ({ url, body, onProgress }: any) => {
      const key = url;
      if (url.includes("/part/2") && !failed.has(key)) {
        failed.add(key);
        onProgress?.(Math.floor(body.size * 0.9), body.size);
        throw new Error("drop");
      }
      onProgress?.(body.size, body.size);
      return { etag: '"e"' };
    });

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: createServer(),
      transport,
      multipart: {
        threshold: 6 * MIB,
        partSize: 5 * MIB,
        concurrency: 2,
        maxAttempts: 3,
        sleep: async () => undefined,
      } as never,
    });

    const seen = trackProgress(engine);
    await engine.upload([makeFile(12 * MIB, "a.bin"), makeFile(20 * MIB, "b.bin")]);

    expectNonDecreasing(seen.aggregate, "batch progress");
  });
});

describe("truthfulness is preserved where it belongs", () => {
  it("holds the bar steady while the ETA grows during a re-transfer", async () => {
    // The counterpart to clamping the bar, and the reason clamping is honest
    // rather than a lie. When a part is re-sent the percentage must not move —
    // no work has been completed — but the estimate must get worse, because
    // there is now more work to do. A run that clamped the ETA too would be
    // indistinguishable from a clean upload, which is the actual deception.
    const failedOnce = new Set<number>();
    const samples: Array<{ progress: number; eta: number }> = [];

    let clock = 0;
    const transport = vi.fn(async ({ url, body, onProgress }: any) => {
      const partNumber = Number(url.split("/part/")[1]);
      clock += 1000;

      if (partNumber === 2 && !failedOnce.has(partNumber)) {
        failedOnce.add(partNumber);
        onProgress?.(body.size, body.size);
        throw new Error("drop");
      }

      onProgress?.(body.size, body.size);
      return { etag: '"e"' };
    });

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: createServer(),
      transport,
      now: () => clock,
      multipart: {
        threshold: 6 * MIB,
        partSize: 5 * MIB,
        concurrency: 1,
        maxAttempts: 3,
        sleep: async () => undefined,
      } as never,
    });

    engine.subscribe(() => {
      const file = engine.getSnapshot().files[0];
      if (file?.status === "uploading" && typeof file.eta === "number") {
        samples.push({ progress: file.progress, eta: file.eta });
      }
    });

    await engine.upload([makeFile(15 * MIB)]);

    expect(engine.getSnapshot().files[0].status).toBe("success");
    expect(samples.length).toBeGreaterThan(0);

    // Somewhere in the run the percentage repeats while the ETA rises: that
    // pair is the re-transfer, visible in the only field that can express it.
    const heldSteadyWhileEtaGrew = samples.some(
      (sample, i) =>
        i > 0 &&
        sample.progress === samples[i - 1].progress &&
        sample.eta > samples[i - 1].eta
    );

    expect(
      heldSteadyWhileEtaGrew,
      `no sample held progress while the ETA grew: ${JSON.stringify(samples)}`
    ).toBe(true);

    // And the percentage itself still never retreated.
    expectNonDecreasing(
      samples.map((sample) => sample.progress),
      "file progress"
    );
  });

  it("reports a monotonic single-PUT upload unchanged", async () => {
    // The regression guard: the clamp must not alter the strategy that was
    // already correct, and must not stop a normal upload reaching 100.
    const transport = vi.fn(async ({ body, onProgress }: any) => {
      for (const fraction of [0.25, 0.5, 0.75, 1]) {
        onProgress?.(Math.floor(body.size * fraction), body.size);
      }
      return {};
    });

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: createServer(),
      transport,
      multipart: { enabled: false } as never,
    });

    const seen = trackProgress(engine);
    await engine.upload([makeFile(1000, "small.bin")]);

    const [values] = [...seen.perFile.values()];
    expectNonDecreasing(values, "file progress");
    expect(values.at(-1)).toBe(100);
  });

  it("does not carry a high-water mark into the next upload", async () => {
    // The mark is per file. If it leaked — shared state, or seeded from the
    // previous run — a later upload would open at the previous peak and appear
    // frozen until it caught up. That still looks monotonic, so it has to be
    // caught by asserting the *value*, not the shape.
    const transport = vi.fn(async ({ body, onProgress }: any) => {
      onProgress?.(Math.floor(body.size * 0.25), body.size);
      onProgress?.(body.size, body.size);
      return {};
    });

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: createServer(),
      transport,
      multipart: { enabled: false } as never,
    });

    await engine.upload([makeFile(1000, "first.bin")]);
    expect(engine.getSnapshot().files[0].progress).toBe(100);

    engine.reset();
    expect(engine.getSnapshot().progress).toBe(0);

    const seen = trackProgress(engine);
    await engine.upload([makeFile(1000, "second.bin")]);

    const [values] = [...seen.perFile.values()];
    // The quarter-way report must be visible as 25, not swallowed by a
    // inherited peak of 100 from the first upload.
    expect(values).toContain(25);
    expect(values.at(-1)).toBe(100);
    expectNonDecreasing(values, "file progress");
  });

  it("keeps each file's mark independent within one batch", async () => {
    // Two files upload concurrently; a shared mark would let the faster one
    // drag the slower one's percentage up to its own.
    const transport = vi.fn(async ({ body, onProgress }: any) => {
      // The small file completes immediately; the large one reports a quarter.
      if (body.size < 2000) {
        onProgress?.(body.size, body.size);
      } else {
        onProgress?.(Math.floor(body.size * 0.25), body.size);
        onProgress?.(body.size, body.size);
      }
      return {};
    });

    const engine = createUploadEngine({
      route: "upload",
      endpoint: "/api/upload",
      fetcher: vi.fn(async (input: RequestInfo) => {
        const isPresign = String(input).includes("action=presign");
        return new Response(
          JSON.stringify({
            success: true,
            results: [
              {
                success: true,
                presignedUrl: "https://storage.example/a",
                key: "uploads/a",
                requiredHeaders: {},
              },
              {
                success: true,
                presignedUrl: "https://storage.example/b",
                key: "uploads/b",
                requiredHeaders: {},
              },
            ].slice(0, isPresign ? 2 : 2),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }),
      transport,
      multipart: { enabled: false } as never,
    });

    const seen = trackProgress(engine);
    await engine.upload([makeFile(1000, "small.bin"), makeFile(8000, "large.bin")]);

    const series = [...seen.perFile.values()];
    expect(series).toHaveLength(2);

    // The larger file must show its own quarter-way value.
    const large = series.find((values) => values.includes(25));
    expect(large, "the large file's 25% report was lost").toBeDefined();

    for (const values of series) expectNonDecreasing(values, "file progress");
  });
});

describe("monotonicity under adversarial event sequences", () => {
  /** Deterministic PRNG, so a failure is reproducible from its seed. */
  function xorshift32(seed: number) {
    let state = seed || 1;
    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 0xffffffff;
    };
  }

  it("survives randomised part failures without ever retreating", async () => {
    // Hand-written cases cover the failures we thought of. This covers the
    // interleavings we did not: random parts failing at random fractions,
    // with concurrency, across many seeds.
    for (let seed = 1; seed <= 25; seed++) {
      const random = xorshift32(seed);
      const failed = new Set<number>();

      const transport = vi.fn(async ({ url, body, onProgress }: any) => {
        const partNumber = Number(url.split("/part/")[1]);

        if (random() < 0.35 && !failed.has(partNumber)) {
          failed.add(partNumber);
          onProgress?.(Math.floor(body.size * random()), body.size);
          throw new Error("transient");
        }

        const ticks = 1 + Math.floor(random() * 3);
        for (let i = 1; i <= ticks; i++) {
          onProgress?.(Math.floor((body.size * i) / ticks), body.size);
          await Promise.resolve();
        }
        return { etag: '"e"' };
      });

      const engine = createUploadEngine({
        route: "upload",
        endpoint: "/api/upload",
        fetcher: createServer(),
        transport,
        multipart: {
          threshold: 6 * MIB,
          partSize: 5 * MIB,
          concurrency: 3,
          maxAttempts: 5,
          sleep: async () => undefined,
        } as never,
      });

      const values: number[] = [];
      engine.subscribe(() => {
        const file = engine.getSnapshot().files[0] as S3UploadedFile | undefined;
        if (file) values.push(file.progress);
      });

      await engine.upload([makeFile(25 * MIB)]);

      // Validated in plain JS, with a single assertion per seed: one matcher
      // call per progress event across 25 seeds would dominate the runtime.
      let regression: string | null = null;
      for (let i = 1; i < values.length; i++) {
        if (values[i] < values[i - 1]) {
          regression = `seed ${seed}: ${values[i - 1]} → ${values[i]} at ${i}`;
          break;
        }
      }

      expect(regression).toBeNull();
      expect(Math.max(...values)).toBeLessThanOrEqual(100);
    }
  });
});
