/**
 * @fileoverview Human-readable formatting for upload telemetry.
 *
 * Pure functions with no dependencies. Shared by every framework binding so
 * that a Vue app and a React app render "1.5 MB/s" identically.
 */

/**
 * Formats estimated time remaining into a human-readable string.
 *
 * @param seconds - Time remaining in seconds
 * @returns Formatted time string (e.g. "45s", "2m", "1h")
 *
 * @example
 * ```typescript
 * formatETA(45);   // "45s"
 * formatETA(120);  // "2m"
 * formatETA(3600); // "1h"
 * ```
 */
export function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

/**
 * Formats upload speed into a human-readable string with appropriate units.
 *
 * @param bytesPerSecond - Upload speed in bytes per second
 * @returns Formatted speed string (e.g. "1.5 MB/s", "500.0 KB/s")
 *
 * @example
 * ```typescript
 * formatUploadSpeed(1024);       // "1.0 KB/s"
 * formatUploadSpeed(1048576);    // "1.0 MB/s"
 * formatUploadSpeed(1073741824); // "1.0 GB/s"
 * ```
 */
export function formatUploadSpeed(bytesPerSecond: number): string {
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let size = bytesPerSecond;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
