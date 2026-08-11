/**
 * @fileoverview Aggregate progress computation.
 *
 * Extracted from the React hook's `calculateOverallMetrics`, which computed
 * these values as a side effect *inside* a `setState` updater. As a pure
 * function over the file list it is directly unit-testable without a renderer,
 * and safe under React StrictMode and concurrent rendering.
 */

import type { S3UploadedFile } from "../../types";

/**
 * Aggregate telemetry across every file in a batch.
 */
export interface AggregateProgress {
  /** Overall completion percentage across the batch, 0-100. */
  progress: number;
  /** Combined transfer rate across in-flight files, in bytes per second. */
  uploadSpeed: number;
  /** Estimated seconds until the whole batch completes. */
  eta: number;
}

const IDLE: AggregateProgress = { progress: 0, uploadSpeed: 0, eta: 0 };

/**
 * Computes batch-level progress, transfer rate, and ETA from per-file state.
 *
 * Progress is **byte-weighted**, not file-count-weighted: a 100 MB file at 50%
 * contributes far more than a 1 KB file at 100%. Pending files are excluded
 * from the denominator entirely — they have not started, so counting them would
 * make progress lurch backwards as each new file begins.
 *
 * @param files - Current per-file upload state
 * @returns Aggregate progress, clamped to 0-100
 *
 * @example
 * ```typescript
 * computeAggregateProgress([
 *   { size: 1000, status: 'success',   progress: 100, uploadSpeed: 0 },
 *   { size: 1000, status: 'uploading', progress: 50,  uploadSpeed: 500 },
 * ]);
 * // => { progress: 75, uploadSpeed: 500, eta: 1 }
 * ```
 */
export function computeAggregateProgress(
  files: readonly S3UploadedFile[]
): AggregateProgress {
  if (files.length === 0) return IDLE;

  const activeFiles = files.filter(
    (f) => f.status === "uploading" || f.status === "success"
  );

  if (activeFiles.length === 0) return IDLE;

  const totalBytes = activeFiles.reduce((sum, file) => sum + file.size, 0);

  const totalLoadedBytes = activeFiles.reduce((sum, file) => {
    const fileProgress = file.status === "success" ? 100 : file.progress || 0;
    return sum + (file.size * fileProgress) / 100;
  }, 0);

  const overallProgressPercent =
    totalBytes > 0 ? (totalLoadedBytes / totalBytes) * 100 : 0;

  // Combined rate is the sum of every in-flight file's current rate.
  const currentTransferRate = activeFiles.reduce(
    (sum, file) => sum + (file.uploadSpeed || 0),
    0
  );

  const remainingBytes = totalBytes - totalLoadedBytes;
  const timeRemaining =
    currentTransferRate > 0 ? remainingBytes / currentTransferRate : 0;

  return {
    progress: Math.min(100, Math.max(0, overallProgressPercent)),
    uploadSpeed: currentTransferRate,
    eta: timeRemaining,
  };
}

/**
 * Derives per-file transfer rate and ETA from a progress event.
 *
 * @param loadedBytes - Bytes transferred so far
 * @param totalBytes - Total bytes to transfer
 * @param elapsedSeconds - Seconds since this file's transfer began
 */
export function computeFileTelemetry(
  loadedBytes: number,
  totalBytes: number,
  elapsedSeconds: number
): { progress: number; uploadSpeed: number; eta: number } {
  const progress =
    totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0;

  // A zero elapsed time yields no meaningful rate; report the progress alone
  // rather than an Infinity that would poison the aggregate.
  if (elapsedSeconds <= 0) return { progress, uploadSpeed: 0, eta: 0 };

  const uploadSpeed = loadedBytes / elapsedSeconds;
  const remainingBytes = totalBytes - loadedBytes;
  const eta = uploadSpeed > 0 ? remainingBytes / uploadSpeed : 0;

  return { progress, uploadSpeed, eta };
}
