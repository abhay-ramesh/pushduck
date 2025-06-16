"use client";

/**
 * Modern Upload Route Hook
 *
 * Provides type-safe file upload functionality with route-based configuration.
 * Supports both type-safe usage with router types and legacy string-based usage.
 */

import { useCallback, useRef, useState } from "react";
import type {
  RouterRouteNames,
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3Router,
  S3UploadedFile,
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

function createProgressTracker(
  fileId: string,
  onProgress: (fileId: string, progress: number) => void
) {
  return (event: ProgressEvent) => {
    if (event.lengthComputable) {
      const progress = Math.round((event.loaded / event.total) * 100);
      onProgress(fileId, progress);
    }
  };
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
  config?: S3RouteUploadConfig
): S3RouteUploadResult;

export function useUploadRoute(
  routeName: string,
  config?: S3RouteUploadConfig
): S3RouteUploadResult;

export function useUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter> | string,
  config: S3RouteUploadConfig = {}
): S3RouteUploadResult {
  const [files, setFiles] = useState<S3UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const reset = useCallback(() => {
    abortControllers.current.forEach((controller) => controller.abort());
    abortControllers.current.clear();
    setFiles([]);
    setErrors([]);
    setIsUploading(false);
  }, []);

  const updateFileProgress = useCallback(
    (fileId: string, progress: number, uploadSpeed?: number, eta?: number) => {
      setFiles((prev) =>
        prev.map((file) =>
          file.id === fileId ? { ...file, progress, uploadSpeed, eta } : file
        )
      );
    },
    []
  );

  const updateFileStatus = useCallback(
    (
      fileId: string,
      status: S3UploadedFile["status"],
      extra: Partial<S3UploadedFile> = {}
    ) => {
      setFiles((prev) =>
        prev.map((file) =>
          file.id === fileId ? { ...file, status, ...extra } : file
        )
      );
    },
    []
  );

  const startUpload = useCallback(
    async (uploadFiles: File[]) => {
      if (!uploadFiles.length) return;

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
          throw new Error(
            errorData.error || `Server error: ${presignResponse.statusText}`
          );
        }

        const presignData = await presignResponse.json();

        if (!presignData.success) {
          throw new Error(presignData.error || "Failed to get presigned URLs");
        }

        const uploadPromises = presignData.results.map(
          async (result: any, index: number) => {
            const file = uploadFiles[index];
            const fileState = initialFiles[index];

            if (!result.success) {
              updateFileStatus(fileState.id, "error", {
                error: result.error || "Failed to get presigned URL",
              });
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
  };
}

// ========================================
// Backward Compatibility
// ========================================

export function useS3RouteUpload(
  routeName: string,
  config: S3RouteUploadConfig = {}
): S3RouteUploadResult {
  return useUploadRoute(routeName, config);
}

// Export utility functions for UI components
export { formatETA, formatUploadSpeed };
