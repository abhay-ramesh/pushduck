"use client";

/**
 * Fixed Route-based React Hooks for next-s3-uploader
 *
 * This implements the correct upload flow:
 * 1. Request presigned URLs from server
 * 2. Upload files directly to S3 using presigned URLs
 * 3. Track upload progress
 * 4. Notify server of completion
 */

import { useCallback, useRef, useState } from "react";

// ========================================
// Types
// ========================================

export interface S3UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  url?: string;
  key?: string;
  error?: string;
  file?: File;
  // ETA tracking
  uploadStartTime?: number;
  uploadSpeed?: number; // bytes per second
  eta?: number; // seconds remaining
}

export interface S3FileMetadata {
  name: string;
  size: number;
  type: string;
}

export interface S3RouteUploadConfig {
  endpoint?: string;
  onSuccess?: (results: S3UploadedFile[]) => void | Promise<void>;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
}

export interface S3RouteUploadResult {
  files: S3UploadedFile[];
  startUpload: (files: File[]) => Promise<void>;
  reset: () => void;
  isUploading: boolean;
  errors: string[];
}

// ========================================
// Utility Functions
// ========================================

function formatETA(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return "";

  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
}

function formatUploadSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return "";

  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let size = bytesPerSecond;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// ========================================
// Upload Progress Tracking
// ========================================

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

// ========================================
// S3 Direct Upload
// ========================================

async function uploadToS3(
  file: File,
  presignedUrl: string,
  onProgress?: (progress: number, uploadSpeed?: number, eta?: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();
    let lastLoaded = 0;
    let lastTime = startTime;

    // Track upload progress with ETA calculation
    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          const currentTime = Date.now();
          const timeElapsed = (currentTime - startTime) / 1000; // seconds
          const timeSinceLastUpdate = (currentTime - lastTime) / 1000;

          // Calculate upload speed (bytes per second)
          let uploadSpeed = 0;
          let eta = 0;

          if (timeElapsed > 0.5) {
            // Only calculate after 500ms to avoid initial spikes
            const bytesUploaded = event.loaded - lastLoaded;
            if (timeSinceLastUpdate > 0) {
              // Smooth the speed calculation using recent data
              uploadSpeed = bytesUploaded / timeSinceLastUpdate;

              // Calculate ETA based on remaining bytes and current speed
              const remainingBytes = event.total - event.loaded;
              if (uploadSpeed > 0 && remainingBytes > 0) {
                eta = remainingBytes / uploadSpeed;
              }
            }
          }

          lastLoaded = event.loaded;
          lastTime = currentTime;

          onProgress(progress, uploadSpeed, eta);
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed due to network error"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload was aborted"));
    });

    // Open connection and send file
    xhr.open("PUT", presignedUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

// ========================================
// Main Hook Implementation
// ========================================

export function useS3UploadRoute(
  routeName: string,
  config: S3RouteUploadConfig = {}
): S3RouteUploadResult {
  const [files, setFiles] = useState<S3UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const reset = useCallback(() => {
    // Cancel any ongoing uploads
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
        prev.map((file) => {
          if (file.id === fileId) {
            // Debug log for status transitions
            if (process.env.NODE_ENV === "development") {
              console.log(`📊 File ${file.name}: ${file.status} → ${status}`);
            }
            return { ...file, status, ...extra };
          }
          return file;
        })
      );
    },
    []
  );

  const startUpload = useCallback(
    async (uploadFiles: File[]) => {
      try {
        setIsUploading(true);
        setErrors([]);

        // Initialize file states
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

        // Step 1: Request presigned URLs
        const fileMetadata: S3FileMetadata[] = uploadFiles.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
        }));

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

        // Step 2: Upload files to S3 using presigned URLs
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
              // Update status to uploading
              updateFileStatus(fileState.id, "uploading", {
                uploadStartTime: Date.now(),
              });

              // Upload to S3
              await uploadToS3(
                file,
                result.presignedUrl,
                (progress, uploadSpeed, eta) =>
                  updateFileProgress(fileState.id, progress, uploadSpeed, eta)
              );

              // Update status to success
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

        // Step 3: Notify server of completion
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

              // Update files with final URLs
              if (completeData.success && completeData.results) {
                completeData.results.forEach((result: any) => {
                  if (result.success && result.key) {
                    // Find the file by matching the key
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
            // Don't fail the entire upload for this
          }
        }

        // Call success callback
        if (config.onSuccess) {
          // Use the current files state instead of stale closure
          setFiles((currentFiles) => {
            const finalFiles = currentFiles.filter(
              (f) => f.status === "success"
            );
            if (finalFiles.length > 0) {
              config.onSuccess?.(finalFiles);
            }
            return currentFiles; // Don't modify state, just access it
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        setErrors((prev) => [...prev, errorMessage]);

        // Only update files that are still in pending state (not those that succeeded)
        setFiles((prev) =>
          prev.map((file) => {
            // Don't change files that have already succeeded or failed
            if (file.status === "success" || file.status === "error") {
              return file;
            }
            // Only mark as error if still pending/uploading
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
    startUpload,
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
  return useS3UploadRoute(routeName, config);
}

// ========================================
// Utility Types for Better DX
// ========================================

export type RouterRouteNames<TRouter> = keyof TRouter;

// Export utility functions for UI components
export { formatETA, formatUploadSpeed };
