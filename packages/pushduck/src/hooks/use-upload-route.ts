"use client";

/**
 * Modern Upload Route Hook
 *
 * Provides type-safe file upload functionality with route-based configuration.
 * Supports both type-safe usage with router types and string-based usage.
 */

import { useCallback, useRef, useState } from "react";
import type {
  RouterRouteNames,
  S3FileMetadata,
  S3RouteUploadResult,
  S3Router,
  S3UploadedFile,
  UploadRouteConfig,
} from "../types";

// ========================================
// Utility Functions
// ========================================

function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function formatUploadSpeed(bytesPerSecond: number): string {
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let size = bytesPerSecond;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

async function uploadToS3(
  file: File,
  presignedUrl: string,
  onProgress?: (progress: number, uploadSpeed?: number, eta?: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const uploadSpeed = event.loaded / elapsed;
        const remainingBytes = event.total - event.loaded;
        const eta = remainingBytes / uploadSpeed;

        onProgress(progress, uploadSpeed, eta);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new Error("Upload aborted"));

    xhr.open("PUT", presignedUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

// ========================================
// Main Hook Implementation
// ========================================

export function useUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter>,
  config?: UploadRouteConfig
): S3RouteUploadResult;

export function useUploadRoute(
  routeName: string,
  config?: UploadRouteConfig
): S3RouteUploadResult;

export function useUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter> | string,
  config: UploadRouteConfig = {}
): S3RouteUploadResult {
  const [files, setFiles] = useState<S3UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [uploadSpeed, setUploadSpeed] = useState<number>(0);
  const [eta, setEta] = useState<number>(0);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  // Calculate overall progress metrics
  const calculateOverallMetrics = useCallback(
    (currentFiles: S3UploadedFile[]) => {
      if (currentFiles.length === 0) {
        setProgress(0);
        setUploadSpeed(0);
        setEta(0);
        return;
      }

      const activeFiles = currentFiles.filter(
        (f) => f.status === "uploading" || f.status === "success"
      );

      if (activeFiles.length === 0) {
        setProgress(0);
        setUploadSpeed(0);
        setEta(0);
        return;
      }

      // Calculate total progress: weighted by file size
      const totalBytes = activeFiles.reduce((sum, file) => sum + file.size, 0);
      const totalLoadedBytes = activeFiles.reduce((sum, file) => {
        const fileProgress =
          file.status === "success" ? 100 : file.progress || 0;
        return sum + (file.size * fileProgress) / 100;
      }, 0);

      const overallProgressPercent =
        totalBytes > 0 ? (totalLoadedBytes / totalBytes) * 100 : 0;

      // Calculate total transfer rate: sum of all active file speeds
      const currentTransferRate = activeFiles.reduce((sum, file) => {
        return sum + (file.uploadSpeed || 0);
      }, 0);

      // Calculate total time remaining: based on remaining bytes and current speed
      const remainingBytes = totalBytes - totalLoadedBytes;
      const timeRemaining =
        currentTransferRate > 0 ? remainingBytes / currentTransferRate : 0;

      const finalProgress = Math.min(100, Math.max(0, overallProgressPercent));
      setProgress(finalProgress);
      setUploadSpeed(currentTransferRate);
      setEta(timeRemaining);

      // Call the onProgress callback with the overall progress
      config.onProgress?.(finalProgress);
    },
    [config.onProgress]
  );

  const reset = useCallback(() => {
    abortControllers.current.forEach((controller) => controller.abort());
    abortControllers.current.clear();
    setFiles([]);
    setErrors([]);
    setIsUploading(false);
    setProgress(0);
    setUploadSpeed(0);
    setEta(0);
  }, []);

  const updateFileProgress = useCallback(
    (fileId: string, progress: number, uploadSpeed?: number, eta?: number) => {
      setFiles((prev) => {
        const updatedFiles = prev.map((file) =>
          file.id === fileId ? { ...file, progress, uploadSpeed, eta } : file
        );

        // Recalculate overall metrics with updated files
        calculateOverallMetrics(updatedFiles);

        return updatedFiles;
      });
    },
    [calculateOverallMetrics]
  );

  const updateFileStatus = useCallback(
    (
      fileId: string,
      status: S3UploadedFile["status"],
      extra: Partial<S3UploadedFile> = {}
    ) => {
      setFiles((prev) => {
        const updatedFiles = prev.map((file) =>
          file.id === fileId ? { ...file, status, ...extra } : file
        );

        // Recalculate overall metrics with updated files
        calculateOverallMetrics(updatedFiles);

        return updatedFiles;
      });
    },
    [calculateOverallMetrics]
  );

  const startUpload = useCallback(
    async (uploadFiles: File[]) => {
      if (!uploadFiles.length) {
        setIsUploading(false);
        return;
      }

      try {
        setIsUploading(true);
        setErrors([]);

        const fileMetadata: S3FileMetadata[] = uploadFiles.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
        }));

        const initialFiles: S3UploadedFile[] = uploadFiles.map(
          (file, index) => ({
            id: `${Date.now()}-${index}`,
            name: file.name,
            size: file.size,
            type: file.type,
            status: "pending" as const,
            progress: 0,
            file,
          })
        );

        setFiles(initialFiles);

        const endpoint = config.endpoint || "/api/s3-upload";
        const presignResponse = await fetch(
          `${endpoint}?route=${String(routeName)}&action=presign`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: fileMetadata }),
          }
        );

        if (!presignResponse.ok) {
          const errorData = await presignResponse.json();
          const errorMessage =
            errorData.error || `Server error: ${presignResponse.statusText}`;

          // Update all files with error status
          setFiles((prev) =>
            prev.map((file) => ({
              ...file,
              status: "error" as const,
              error: errorMessage,
            }))
          );

          // Call onError callback for server errors
          config.onError?.(new Error(errorMessage));
          return;
        }

        const presignData = await presignResponse.json();

        if (!presignData.success) {
          const errorMessage =
            presignData.error || "Failed to get presigned URLs";

          // Update all files with error status
          setFiles((prev) =>
            prev.map((file) => ({
              ...file,
              status: "error" as const,
              error: errorMessage,
            }))
          );

          // Call onError callback for presigned URL failures
          config.onError?.(new Error(errorMessage));
          return;
        }

        // Upload validation passed - call onStart callback and initialize progress
        if (config.onStart) {
          await config.onStart(fileMetadata);
        }

        // Initialize progress at 0% after validation passes
        config.onProgress?.(0);

        const uploadPromises = presignData.results.map(
          async (result: any, index: number) => {
            const file = uploadFiles[index];
            const fileState = initialFiles[index];

            if (!result.success) {
              const errorMessage =
                result.error || "Failed to get presigned URL";
              updateFileStatus(fileState.id, "error", {
                error: errorMessage,
              });

              // Call onError callback for presigned URL failures (including validation errors)
              config.onError?.(new Error(errorMessage));

              return null;
            }

            try {
              updateFileStatus(fileState.id, "uploading", {
                uploadStartTime: Date.now(),
              });

              await uploadToS3(
                file,
                result.presignedUrl,
                (progress, uploadSpeed, eta) =>
                  updateFileProgress(fileState.id, progress, uploadSpeed, eta)
              );

              updateFileStatus(fileState.id, "success", {
                progress: 100,
                key: result.key,
              });

              return {
                key: result.key,
                file: {
                  name: file.name,
                  size: file.size,
                  type: file.type,
                },
                metadata: result.metadata,
              };
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Upload failed";
              updateFileStatus(fileState.id, "error", { error: errorMessage });

              // Call onError callback for individual file failures
              config.onError?.(
                error instanceof Error ? error : new Error(errorMessage)
              );

              return null;
            }
          }
        );

        const uploadResults = await Promise.all(uploadPromises);
        const successfulUploads = uploadResults.filter(Boolean);

        if (successfulUploads.length > 0) {
          try {
            const completeResponse = await fetch(
              `${endpoint}?route=${String(routeName)}&action=complete`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ completions: successfulUploads }),
              }
            );

            if (completeResponse.ok) {
              const completeData = await completeResponse.json();

              if (completeData.success && completeData.results) {
                completeData.results.forEach((result: any) => {
                  if (result.success && result.key) {
                    const matchingUpload = successfulUploads.find(
                      (u) => u?.key === result.key
                    );
                    if (matchingUpload) {
                      const fileToUpdate = initialFiles.find(
                        (f) =>
                          f.name === matchingUpload.file.name &&
                          f.size === matchingUpload.file.size
                      );
                      if (fileToUpdate) {
                        updateFileStatus(fileToUpdate.id, "success", {
                          url: result.url,
                          key: result.key,
                          presignedUrl: result.presignedUrl,
                          progress: 100,
                        });
                      }
                    }
                  }
                });
              }
            }
          } catch (error) {
            console.warn(
              "Failed to notify server of upload completion:",
              error
            );
          }
        }

        if (config.onSuccess) {
          setFiles((currentFiles) => {
            const finalFiles = currentFiles.filter(
              (f) => f.status === "success"
            );
            if (finalFiles.length > 0) {
              config.onSuccess?.(finalFiles);
            }
            return currentFiles;
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        setErrors((prev) => [...prev, errorMessage]);

        setFiles((prev) =>
          prev.map((file) => {
            if (file.status === "success" || file.status === "error") {
              return file;
            }
            return { ...file, status: "error" as const, error: errorMessage };
          })
        );

        config.onError?.(
          error instanceof Error ? error : new Error(errorMessage)
        );
      } finally {
        setIsUploading(false);
        abortControllers.current.clear();
      }
    },
    [routeName, config, updateFileProgress, updateFileStatus]
  );

  return {
    files,
    uploadFiles: startUpload,
    reset,
    isUploading,
    errors,
    progress,
    uploadSpeed,
    eta,
  };
}

// Backward compatibility removed - use useUploadRoute directly

// Export utility functions for UI components
export { formatETA, formatUploadSpeed };
