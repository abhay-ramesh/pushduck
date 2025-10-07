"use client";

/**
 * @fileoverview Modern Upload Route Hook
 *
 * This module provides a React hook for type-safe file upload functionality with
 * route-based configuration. Supports progress tracking, error handling, cancellation,
 * and comprehensive upload state management.
 *
 * @example Basic Usage
 * ```typescript
 * import { useUploadRoute } from 'pushduck/client';
 * import type { AppRouter } from '@/lib/upload';
 *
 * function ImageUploader() {
 *   const { uploadFiles, files, isUploading, progress } = useUploadRoute<AppRouter>('imageUpload');
 *
 *   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const selectedFiles = Array.from(e.target.files || []);
 *     uploadFiles(selectedFiles);
 *   };
 *
 *   return (
 *     <div>
 *       <input type="file" multiple accept="image/*" onChange={handleFileSelect} />
 *       <progress value={progress} max={100} />
 *       {files.map(file => (
 *         <div key={file.id}>
 *           {file.name} - {file.status} ({file.progress}%)
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example Advanced Usage with Callbacks
 * ```typescript
 * const { uploadFiles, files, cancel, retry } = useUploadRoute('documentUpload', {
 *   onProgress: (progress) => console.log(`Overall progress: ${progress.percentage}%`),
 *   onSuccess: (results) => {
 *     console.log('Upload completed:', results);
 *     // Update UI, show success message, etc.
 *   },
 *   onError: (error) => {
 *     console.error('Upload failed:', error);
 *     // Show error message, retry logic, etc.
 *   },
 * });
 * ```
 *
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

/**
 * Formats estimated time remaining into a human-readable string.
 *
 * @param seconds - Time remaining in seconds
 * @returns Formatted time string (e.g., "30s", "2m", "1h")
 *
 * @example
 * ```typescript
 * formatETA(45);     // "45s"
 * formatETA(120);    // "2m"
 * formatETA(3600);   // "1h"
 * formatETA(7200);   // "2h"
 * ```
 */
function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

/**
 * Formats upload speed into a human-readable string with appropriate units.
 *
 * @param bytesPerSecond - Upload speed in bytes per second
 * @returns Formatted speed string (e.g., "1.5 MB/s", "500 KB/s")
 *
 * @example
 * ```typescript
 * formatUploadSpeed(1024);        // "1.0 KB/s"
 * formatUploadSpeed(1048576);     // "1.0 MB/s"
 * formatUploadSpeed(1073741824);  // "1.0 GB/s"
 * ```
 */
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

/**
 * Uploads a file to S3 using a presigned URL with progress tracking.
 *
 * @param file - The file to upload
 * @param presignedUrl - Presigned URL for the upload
 * @param onProgress - Optional progress callback
 * @returns Promise that resolves when upload completes
 * @throws {Error} If upload fails or is aborted
 *
 * @internal
 *
 * @example
 * ```typescript
 * await uploadToS3(file, presignedUrl, (progress, speed, eta) => {
 *   console.log(`Progress: ${progress}%, Speed: ${formatUploadSpeed(speed)}, ETA: ${formatETA(eta)}`);
 * });
 * ```
 */
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

/**
 * React hook for managing file uploads with type-safe route configuration.
 * Provides comprehensive upload state management, progress tracking, and error handling.
 *
 * @template TRouter - The router type for type-safe route names
 * @param routeName - Name of the upload route (type-safe when TRouter is provided)
 * @param config - Optional configuration for upload behavior and callbacks
 * @returns Upload state and control functions
 *
 * @overload
 * @template TRouter - Router type extending S3Router
 * @param routeName - Type-safe route name from the router
 * @param config - Optional upload configuration
 * @returns Upload result object with type-safe route handling
 *
 * @overload
 * @param routeName - Route name as string (for dynamic usage)
 * @param config - Optional upload configuration
 * @returns Upload result object with standard route handling
 *
 * @example Type-Safe Usage
 * ```typescript
 * import type { AppRouter } from '@/lib/upload';
 *
 * function TypedUploader() {
 *   // TypeScript will validate 'imageUpload' exists in AppRouter
 *   const { uploadFiles, files, isUploading, progress, cancel } =
 *     useUploadRoute<AppRouter>('imageUpload', {
 *       onProgress: (progress) => {
 *         console.log(`Upload progress: ${progress.percentage}%`);
 *         console.log(`Speed: ${formatUploadSpeed(progress.speed)}`);
 *         console.log(`ETA: ${formatETA(progress.eta)}`);
 *       },
 *       onSuccess: (results) => {
 *         console.log('All uploads completed:', results);
 *         // Handle successful uploads
 *       },
 *       onError: (error) => {
 *         console.error('Upload error:', error);
 *         // Handle upload errors
 *       },
 *     });
 *
 *   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const files = Array.from(e.target.files || []);
 *     uploadFiles(files);
 *   };
 *
 *   return (
 *     <div>
 *       <input
 *         type="file"
 *         multiple
 *         accept="image/*"
 *         onChange={handleFileSelect}
 *         disabled={isUploading}
 *       />
 *
 *       <div>Overall Progress: {progress}%</div>
 *
 *       {files.map((file) => (
 *         <div key={file.id}>
 *           <span>{file.name}</span>
 *           <progress value={file.progress} max={100} />
 *           <span>{file.status}</span>
 *           {file.status === 'uploading' && (
 *             <button onClick={() => cancel(file.id)}>Cancel</button>
 *           )}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example Dynamic Route Usage
 * ```typescript
 * function DynamicUploader({ routeName }: { routeName: string }) {
 *   const { uploadFiles, files, retry, reset } = useUploadRoute(routeName, {
 *     onError: (error) => {
 *       console.error(`Upload to ${routeName} failed:`, error);
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <input
 *         type="file"
 *         onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
 *       />
 *
 *       {files.filter(f => f.status === 'error').length > 0 && (
 *         <button onClick={retry}>Retry Failed Uploads</button>
 *       )}
 *
 *       <button onClick={reset}>Clear All</button>
 *     </div>
 *   );
 * }
 * ```
 */
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

  /**
   * Initiates file upload with optional client-side metadata.
   *
   * This function handles the complete upload workflow:
   * 1. Validates files array
   * 2. Requests presigned URLs from server (sends metadata)
   * 3. Uploads files directly to S3 using presigned URLs
   * 4. Notifies server of upload completion
   * 5. Calls success/error callbacks
   *
   * @param uploadFiles - Array of File objects to upload
   * @param metadata - Optional metadata object to pass to server
   *
   * @remarks
   * The metadata parameter allows passing client-side context to the server,
   * where it can be accessed in middleware, lifecycle hooks, and path generation.
   * Common use cases include:
   * - Multi-tenant context (workspaceId, projectId)
   * - User selections (albumId, categoryId)
   * - Form data (tags, description, visibility)
   * - UI state (sortOrder, featured flag)
   *
   * @security
   * ⚠️ SECURITY WARNING: Client metadata is untrusted user input.
   *
   * The server MUST validate and sanitize all client metadata in middleware.
   * Never trust client-provided identity claims (userId, isAdmin, role, etc.).
   * Always extract identity from authenticated session/token on the server.
   *
   * @example Basic upload without metadata
   * ```typescript
   * const { uploadFiles } = useUploadRoute('imageUpload');
   *
   * // Simple upload
   * await uploadFiles(selectedFiles);
   * ```
   *
   * @example Upload with metadata
   * ```typescript
   * const { uploadFiles } = useUploadRoute('imageUpload');
   *
   * // Upload with contextual metadata
   * await uploadFiles(selectedFiles, {
   *   albumId: selectedAlbum.id,
   *   tags: ['vacation', 'beach'],
   *   visibility: 'private',
   *   description: 'Summer vacation photos'
   * });
   * ```
   *
   * @example Multi-tenant upload
   * ```typescript
   * const { uploadFiles } = useUploadRoute('documentUpload');
   *
   * await uploadFiles(documents, {
   *   workspaceId: currentWorkspace.id,
   *   projectId: activeProject.id,
   *   folder: selectedFolder.path
   * });
   * ```
   *
   * @example E-commerce product images
   * ```typescript
   * const { uploadFiles } = useUploadRoute('productImages');
   *
   * await uploadFiles(images, {
   *   productId: product.id,
   *   variantId: variant.id,
   *   imageType: 'gallery', // 'main' | 'gallery' | 'thumbnail'
   *   sortOrder: displayOrder
   * });
   * ```
   */
  const startUpload = useCallback(
    async (uploadFiles: File[], metadata?: any) => {
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
            body: JSON.stringify({ files: fileMetadata, metadata }),
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
