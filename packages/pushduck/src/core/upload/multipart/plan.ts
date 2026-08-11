/**
 * @fileoverview Deciding *whether* to use multipart, and *how* to split a file.
 *
 * Pure functions with no I/O, no framework, and no provider client — the whole
 * module is a calculation over a file size. That matters because part planning
 * is where an off-by-one corrupts an object rather than failing loudly: parts
 * that overlap or leave a gap still upload successfully and still complete;
 * the resulting object is simply wrong.
 *
 * The plan is uniform by construction — every part the same size except a
 * smaller final one. See `./limits.ts` for why (Cloudflare R2 requires it, and
 * uniformity is what makes resume derivable from the part size alone).
 */

import {
  DEFAULT_MULTIPART_THRESHOLD,
  MAX_OBJECT_SIZE,
  MIB,
  UNIVERSAL_LIMITS,
  type MultipartLimits,
} from "./limits";

/** One part's position in the file. `end` is exclusive, like `Blob.slice`. */
export interface PartPlan {
  /** 1-based, as S3 requires. Part 0 does not exist. */
  partNumber: number;
  /** Inclusive start offset. */
  start: number;
  /** Exclusive end offset. */
  end: number;
  /** Convenience: `end - start`. */
  size: number;
}

/** The complete split of one file. */
export interface MultipartPlan {
  /** Uniform size of every part except the last. */
  partSize: number;
  /** Total number of parts. */
  partCount: number;
  /** Total bytes, equal to the file size. */
  totalSize: number;
  /** The parts, in ascending order, tiling the file exactly. */
  parts: PartPlan[];
}

/** Options for {@link shouldUseMultipart} and {@link planMultipart}. */
export interface MultipartPlanOptions {
  /**
   * Size at or above which multipart is used.
   * @default 100 MiB
   */
  threshold?: number;
  /**
   * Force a specific uniform part size, in bytes.
   *
   * Clamped into the provider-safe range and raised if it would exceed the
   * 10,000-part cap, so an unreasonable value degrades rather than failing.
   */
  partSize?: number;
  /** Provider constraints. Defaults to the universally safe intersection. */
  limits?: MultipartLimits;
}

/**
 * Thrown when a file cannot be uploaded under any valid plan.
 *
 * Only reachable for objects above ~48.8 TiB, which no provider accepts.
 */
export class FileTooLargeForMultipartError extends Error {
  override readonly name = "FileTooLargeForMultipartError";
  constructor(readonly fileSize: number) {
    super(
      `File of ${fileSize} bytes exceeds the maximum object size of ${MAX_OBJECT_SIZE} bytes`
    );
  }
}

/**
 * Whether a file should be uploaded as multiple parts.
 *
 * Small files must keep using a single `PUT`: it is one request and one
 * signature, with no session that can be abandoned and billed. Multipart is
 * strictly worse below the threshold.
 *
 * A file above the single-`PUT` ceiling (5 GiB) **must** use multipart
 * regardless of the configured threshold — otherwise the provider rejects it.
 */
export function shouldUseMultipart(
  fileSize: number,
  options: MultipartPlanOptions = {}
): boolean {
  const limits = options.limits ?? UNIVERSAL_LIMITS;
  const threshold = options.threshold ?? DEFAULT_MULTIPART_THRESHOLD;

  // A single PUT cannot exceed the maximum part size, so past that point the
  // threshold is irrelevant — multipart is the only legal option.
  if (fileSize > limits.maxPartSize) return true;

  return fileSize >= threshold;
}

/**
 * Chooses a uniform part size for a file.
 *
 * The binding constraint is the 10,000-part cap: at the 5 MiB floor that only
 * reaches ~48.8 GiB, so beyond that the part size must grow with the file.
 * Sizes are rounded up to a whole mebibyte, which keeps offsets readable in
 * logs and keeps a resumed client computing identical boundaries.
 *
 * @throws {FileTooLargeForMultipartError} If no valid part size exists.
 */
export function choosePartSize(
  fileSize: number,
  options: MultipartPlanOptions = {}
): number {
  const limits = options.limits ?? UNIVERSAL_LIMITS;

  if (fileSize > limits.maxParts * limits.maxPartSize) {
    throw new FileTooLargeForMultipartError(fileSize);
  }

  // Smallest part size that keeps the count within the cap.
  const required = Math.ceil(fileSize / limits.maxParts);

  const requested = options.partSize ?? limits.minPartSize;

  // An explicit partSize is honoured only where it remains legal: too small
  // and the provider rejects the part, too few parts and the upload cannot
  // represent the file.
  const chosen = Math.max(requested, required, limits.minPartSize);

  // Round up to a whole MiB so boundaries are stable and human-readable.
  const rounded = Math.ceil(chosen / MIB) * MIB;

  return Math.min(Math.max(rounded, limits.minPartSize), limits.maxPartSize);
}

/**
 * Splits a file into parts.
 *
 * The returned parts **tile the file exactly**: contiguous, non-overlapping,
 * ascending, and summing to the file size. Every one of those properties is
 * asserted in the tests, because violating any of them produces a corrupt
 * object rather than an error — the upload succeeds and the bytes are wrong.
 *
 * @throws {FileTooLargeForMultipartError} If the file exceeds every provider's maximum.
 */
export function planMultipart(
  fileSize: number,
  options: MultipartPlanOptions = {}
): MultipartPlan {
  const partSize = choosePartSize(fileSize, options);

  // A zero-byte file is still one (empty) part: S3 requires at least one, and
  // `Math.ceil(0 / n)` would otherwise yield a plan with no parts at all.
  const partCount = Math.max(1, Math.ceil(fileSize / partSize));

  const parts: PartPlan[] = [];
  for (let index = 0; index < partCount; index++) {
    const start = index * partSize;
    // The final part is the remainder, and is the only one allowed to be
    // smaller than the provider minimum.
    const end = Math.min(start + partSize, fileSize);

    parts.push({
      partNumber: index + 1, // S3 part numbers are 1-based
      start,
      end,
      size: end - start,
    });
  }

  return { partSize, partCount, totalSize: fileSize, parts };
}

/**
 * Recomputes a single part's byte range from the plan's parameters.
 *
 * Resume needs this: a client returning to an interrupted upload knows the
 * `partSize` and total size from its persisted token, but not the original
 * part list. Because the plan is uniform, part N's range is derivable — which
 * is the practical payoff of the uniformity that R2 requires anyway.
 */
export function partRange(
  partNumber: number,
  partSize: number,
  totalSize: number
): PartPlan {
  const start = (partNumber - 1) * partSize;
  const end = Math.min(start + partSize, totalSize);

  return { partNumber, start, end, size: Math.max(0, end - start) };
}
