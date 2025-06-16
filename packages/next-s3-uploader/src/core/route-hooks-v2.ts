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
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
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

  const updateFileProgress = useCallback((fileId: string, progress: number) => {
    setFiles((prev) =>
      prev.map((file) => (file.id === fileId ? { ...file, progress } : file))
    );
  }, []);

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
              updateFileStatus(fileState.id, "uploading");

              // Upload to S3
              await uploadToS3(file, result.presignedUrl, (progress) =>
                updateFileProgress(fileState.id, progress)
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
                  if (result.success) {
                    const fileToUpdate = initialFiles.find((f) =>
                      successfulUploads.some((u) => u?.key === result.key)
                    );
                    if (fileToUpdate) {
                      updateFileStatus(fileToUpdate.id, "success", {
                        url: result.url,
                        key: result.key,
                      });
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
          const finalFiles = files.filter((f) => f.status === "success");
          await config.onSuccess(finalFiles);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        setErrors((prev) => [...prev, errorMessage]);

        // Update all pending/uploading files to error state
        setFiles((prev) =>
          prev.map((file) =>
            file.status === "pending" || file.status === "uploading"
              ? { ...file, status: "error" as const, error: errorMessage }
              : file
          )
        );

        config.onError?.(
          error instanceof Error ? error : new Error(errorMessage)
        );
      } finally {
        setIsUploading(false);
        abortControllers.current.clear();
      }
    },
    [routeName, config, files, updateFileProgress, updateFileStatus]
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
