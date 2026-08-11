/**
 * @fileoverview Multipart part planning.
 *
 * These matter more than their simplicity suggests. A planning bug does not
 * throw — parts that overlap, leave a gap, or are misnumbered still upload
 * successfully and still complete. The provider stitches whatever it was given
 * and returns 200. The corruption is only discovered when someone opens the
 * file.
 *
 * So the central property is asserted exhaustively and randomly: **the parts
 * tile the file exactly**.
 */

import { describe, expect, it } from "vitest";
import {
  choosePartSize,
  FileTooLargeForMultipartError,
  planMultipart,
  partRange,
  shouldUseMultipart,
} from "../core/upload/multipart/plan";
import {
  DEFAULT_MULTIPART_THRESHOLD,
  GIB,
  MAX_OBJECT_SIZE,
  MIB,
  UNIVERSAL_LIMITS,
} from "../core/upload/multipart/limits";

describe("shouldUseMultipart", () => {
  it("keeps small files on the single-PUT path", () => {
    // Multipart is strictly worse below the threshold: more round trips, a
    // signature per part, and a session that can be abandoned and billed.
    expect(shouldUseMultipart(0)).toBe(false);
    expect(shouldUseMultipart(1024)).toBe(false);
    expect(shouldUseMultipart(5 * MIB)).toBe(false);
    expect(shouldUseMultipart(DEFAULT_MULTIPART_THRESHOLD - 1)).toBe(false);
  });

  it("switches at the threshold", () => {
    expect(shouldUseMultipart(DEFAULT_MULTIPART_THRESHOLD)).toBe(true);
  });

  it("honours a custom threshold", () => {
    expect(shouldUseMultipart(20 * MIB, { threshold: 10 * MIB })).toBe(true);
    expect(shouldUseMultipart(5 * MIB, { threshold: 10 * MIB })).toBe(false);
  });

  it("forces multipart above the single-PUT ceiling, whatever the threshold", () => {
    // A single PUT cannot exceed the maximum part size. Past that the
    // threshold is irrelevant — the provider would reject the request.
    const huge = UNIVERSAL_LIMITS.maxPartSize + 1;
    expect(shouldUseMultipart(huge, { threshold: Number.MAX_SAFE_INTEGER })).toBe(
      true
    );
  });
});

describe("choosePartSize", () => {
  it("uses the provider-safe floor for ordinary files", () => {
    // 5 MiB satisfies AWS, R2, GCS, Spaces, MinIO and Backblaze at once.
    expect(choosePartSize(200 * MIB)).toBe(5 * MIB);
  });

  it("grows the part size when the 10,000-part cap would be exceeded", () => {
    // At the 5 MiB floor the cap only reaches ~48.8 GiB. Beyond that the part
    // size must scale or the file simply cannot be represented.
    const fileSize = 100 * GIB;
    const partSize = choosePartSize(fileSize);

    expect(partSize).toBeGreaterThan(5 * MIB);
    expect(Math.ceil(fileSize / partSize)).toBeLessThanOrEqual(
      UNIVERSAL_LIMITS.maxParts
    );
  });

  it("never returns a part size below the provider minimum", () => {
    expect(choosePartSize(1024, { partSize: 1 })).toBe(
      UNIVERSAL_LIMITS.minPartSize
    );
  });

  it("never returns a part size above the provider maximum", () => {
    expect(
      choosePartSize(10 * GIB, { partSize: Number.MAX_SAFE_INTEGER })
    ).toBeLessThanOrEqual(UNIVERSAL_LIMITS.maxPartSize);
  });

  it("rounds to a whole mebibyte so boundaries stay stable", () => {
    // A resumed client recomputes boundaries from the part size alone; a
    // fractional size invites float drift between sessions.
    for (const size of [7 * GIB, 123 * GIB, 1000 * GIB]) {
      expect(choosePartSize(size) % MIB).toBe(0);
    }
  });

  it("honours a larger explicit part size", () => {
    expect(choosePartSize(500 * MIB, { partSize: 16 * MIB })).toBe(16 * MIB);
  });

  it("overrides an explicit part size that would exceed the part cap", () => {
    // The user asked for 5 MiB parts on a 100 GiB file: that is 20,480 parts,
    // which no provider accepts. Correctness wins over the request.
    const partSize = choosePartSize(100 * GIB, { partSize: 5 * MIB });
    expect(Math.ceil((100 * GIB) / partSize)).toBeLessThanOrEqual(
      UNIVERSAL_LIMITS.maxParts
    );
  });

  it("rejects a file larger than any provider accepts", () => {
    expect(() => choosePartSize(MAX_OBJECT_SIZE + MIB)).toThrow(
      FileTooLargeForMultipartError
    );
  });
});

describe("planMultipart — the tiling property", () => {
  /** Asserts the invariant that, if violated, silently corrupts the object. */
  function expectExactTiling(fileSize: number, options = {}) {
    const plan = planMultipart(fileSize, options);

    expect(plan.totalSize).toBe(fileSize);
    expect(plan.parts).toHaveLength(plan.partCount);

    let cursor = 0;
    plan.parts.forEach((part, index) => {
      // 1-based and ascending, as S3 requires.
      expect(part.partNumber).toBe(index + 1);
      // Contiguous: no gap, no overlap.
      expect(part.start).toBe(cursor);
      expect(part.end).toBeGreaterThanOrEqual(part.start);
      expect(part.size).toBe(part.end - part.start);
      cursor = part.end;
    });

    // Sums to exactly the file — no truncation, no overrun.
    expect(cursor).toBe(fileSize);
    expect(plan.parts.reduce((n, p) => n + p.size, 0)).toBe(fileSize);
  }

  it("tiles an exact multiple of the part size", () => {
    expectExactTiling(50 * MIB, { partSize: 5 * MIB, threshold: 0 });
  });

  it("tiles a file with a remainder", () => {
    expectExactTiling(52 * MIB + 1234, { partSize: 5 * MIB, threshold: 0 });
  });

  it("tiles a file one byte over a part boundary", () => {
    expectExactTiling(5 * MIB + 1, { partSize: 5 * MIB, threshold: 0 });
  });

  it("tiles a file one byte under a part boundary", () => {
    expectExactTiling(10 * MIB - 1, { partSize: 5 * MIB, threshold: 0 });
  });

  it("tiles hand-picked edge sizes", () => {
    const sizes = [
      1, 2, 4095, 5 * MIB - 1, 5 * MIB, 5 * MIB + 1,
      7_654_321, 100 * MIB + 7, 999_999_999, 3 * GIB + 12345,
    ];

    for (const size of sizes) {
      expectExactTiling(size, { threshold: 0 });
    }
  });

  it("tiles 5000 pseudo-random sizes", () => {
    // Genuinely randomised, because planning bugs hide in sizes nobody thinks
    // to enumerate — and the failure mode is a silently corrupt object, not an
    // error. Seeded so a failure reproduces exactly rather than being a flake.
    //
    // Validation is plain JavaScript rather than one `expect` per part: a
    // large file plans up to 10,000 parts, and asserting on each would mean
    // tens of millions of matcher calls. The invariant is checked just as
    // strictly; only the reporting is deferred to one assertion per case.
    let seed = 0x9e3779b9;
    const next = () => {
      // xorshift32: deterministic, uniform enough, no dependency.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 0x1_0000_0000;
    };

    /** Returns a description of the first violation, or null if it tiles. */
    const findTilingViolation = (fileSize: number): string | null => {
      const plan = planMultipart(fileSize, { threshold: 0 });

      if (plan.totalSize !== fileSize) return "totalSize mismatch";
      if (plan.parts.length !== plan.partCount) return "partCount mismatch";

      let cursor = 0;
      for (let i = 0; i < plan.parts.length; i++) {
        const part = plan.parts[i];
        if (part.partNumber !== i + 1) return `part ${i} misnumbered`;
        if (part.start !== cursor) return `gap or overlap at part ${i + 1}`;
        if (part.end < part.start) return `inverted range at part ${i + 1}`;
        if (part.size !== part.end - part.start) return `bad size at ${i + 1}`;
        // Only the final part may fall below the provider floor.
        if (
          i < plan.parts.length - 1 &&
          part.size !== plan.partSize
        ) {
          return `non-uniform part ${i + 1} (R2 rejects this)`;
        }
        cursor = part.end;
      }

      if (cursor !== fileSize) return "parts do not sum to the file size";
      if (plan.partCount > UNIVERSAL_LIMITS.maxParts) return "exceeds part cap";
      return null;
    };

    for (let i = 0; i < 5000; i++) {
      // Spread across magnitudes: bytes through gibibytes.
      const magnitude = Math.floor(next() * 5);
      const fileSize = Math.floor(next() * Math.pow(1024, magnitude)) + 1;

      const violation = findTilingViolation(fileSize);
      expect(violation, `fileSize=${fileSize}`).toBeNull();
    }
  });

  it("derives every part range from the part size, for random sizes", () => {
    // The resume path recomputes ranges instead of replaying a stored plan.
    // If the two ever disagree, a resumed upload writes the wrong bytes.
    let seed = 0x12345678;
    const next = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 0x1_0000_0000;
    };

    for (let i = 0; i < 500; i++) {
      const fileSize = Math.floor(next() * 500 * MIB) + 1;
      const plan = planMultipart(fileSize, { threshold: 0 });

      const mismatch = plan.parts.find((part) => {
        const derived = partRange(part.partNumber, plan.partSize, fileSize);
        return (
          derived.start !== part.start ||
          derived.end !== part.end ||
          derived.size !== part.size
        );
      });

      expect(mismatch, `fileSize=${fileSize}`).toBeUndefined();
    }
  });

  it("produces uniform parts, with only the last one smaller", () => {
    // Cloudflare R2 rejects a completion where non-final parts differ in size.
    // Emitting a uniform plan everywhere keeps one client valid on every
    // provider rather than branching per provider.
    const plan = planMultipart(53 * MIB, { partSize: 5 * MIB, threshold: 0 });

    const nonFinal = plan.parts.slice(0, -1);
    expect(new Set(nonFinal.map((p) => p.size)).size).toBe(1);
    expect(nonFinal[0].size).toBe(plan.partSize);

    const last = plan.parts[plan.parts.length - 1];
    expect(last.size).toBeLessThanOrEqual(plan.partSize);
    expect(last.size).toBeGreaterThan(0);
  });

  it("treats a zero-byte file as a single empty part", () => {
    // S3 requires at least one part; ceil(0 / n) would otherwise plan none.
    const plan = planMultipart(0, { threshold: 0 });

    expect(plan.partCount).toBe(1);
    expect(plan.parts[0]).toMatchObject({
      partNumber: 1,
      start: 0,
      end: 0,
      size: 0,
    });
  });

  it("stays within the part cap for a very large file", () => {
    const plan = planMultipart(2 * 1024 * GIB, { threshold: 0 });
    expect(plan.partCount).toBeLessThanOrEqual(UNIVERSAL_LIMITS.maxParts);
  });

  it("rejects a file larger than any provider accepts", () => {
    expect(() => planMultipart(MAX_OBJECT_SIZE + MIB)).toThrow(
      FileTooLargeForMultipartError
    );
  });
});

describe("partRange — resume without the original plan", () => {
  it("recomputes a part's range from the part size alone", () => {
    // A resumed client has only { partSize, totalSize } from its persisted
    // token. Uniformity is what makes the range derivable.
    const fileSize = 53 * MIB;
    const plan = planMultipart(fileSize, { partSize: 5 * MIB, threshold: 0 });

    for (const part of plan.parts) {
      expect(partRange(part.partNumber, plan.partSize, fileSize)).toEqual(part);
    }
  });

  it("clamps the final part to the file size", () => {
    const range = partRange(11, 5 * MIB, 53 * MIB);
    expect(range.end).toBe(53 * MIB);
    expect(range.size).toBe(3 * MIB);
  });

  it("returns an empty range beyond the end of the file", () => {
    // A stale token claiming more parts than the file has must not produce a
    // negative size that would be read as a huge unsigned length downstream.
    const range = partRange(99, 5 * MIB, 10 * MIB);
    expect(range.size).toBe(0);
  });
});

describe("provider compatibility", () => {
  it("plans within every documented provider's limits", () => {
    // The limits used are the intersection of AWS, R2, GCS, Spaces, MinIO and
    // Backblaze, so a plan valid here is valid on all of them. Exploiting one
    // provider's extra headroom would make the same config succeed on one and
    // fail on another.
    for (const fileSize of [100 * MIB, 5 * GIB, 500 * GIB]) {
      const plan = planMultipart(fileSize, { threshold: 0 });

      expect(plan.partCount).toBeLessThanOrEqual(UNIVERSAL_LIMITS.maxParts);
      expect(plan.partSize).toBeGreaterThanOrEqual(UNIVERSAL_LIMITS.minPartSize);
      expect(plan.partSize).toBeLessThanOrEqual(UNIVERSAL_LIMITS.maxPartSize);

      // Every part except the last must clear the provider floor.
      for (const part of plan.parts.slice(0, -1)) {
        expect(part.size).toBeGreaterThanOrEqual(UNIVERSAL_LIMITS.minPartSize);
      }
    }
  });

  it("defaults to a part size that survives the DigitalOcean CDN cap", () => {
    // Spaces caps presigned PUT through its CDN endpoint at 7.91 MiB. The
    // 5 MiB default stays under it; a larger default would fail there only.
    expect(choosePartSize(200 * MIB)).toBeLessThan(7.91 * MIB);
  });
});
