/**
 * Route-based React Hooks for next-s3-uploader
 *
 * This provides hooks that work with the router system for end-to-end type safety
 */

import { useCallback, useRef, useState } from "react";
import { S3UploadedFile } from "./hooks";

// ========================================
// Types for Route-based Uploads
// ========================================

export interface S3RouteUploadConfig {
  endpoint?: string;
  onSuccess?: (results: any[]) => void | Promise<void>;
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
// Route-based Upload Hook
// ========================================

export function useS3RouteUpload<TRouter = any>(
  routeName: keyof TRouter,
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

        // Prepare file metadata for server
        const fileMetadata = uploadFiles.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
        }));

        // Send request to router endpoint
        const endpoint = config.endpoint || "/api/s3";
        const response = await fetch(`${endpoint}?route=${String(routeName)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: fileMetadata,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || `Server error: ${response.statusText}`
          );
        }

        const responseData = await response.json();

        if (!responseData.success) {
          throw new Error(responseData.error || "Upload failed");
        }

        // Update files with results
        setFiles((prev) =>
          prev.map((file, index) => {
            const result = responseData.results[index];
            if (result.success) {
              return {
                ...file,
                status: "success" as const,
                progress: 100,
                url: result.url,
              };
            } else {
              return {
                ...file,
                status: "error" as const,
                error: result.error,
              };
            }
          })
        );

        // Call success callback if all uploads succeeded
        const allSuccessful = responseData.results.every((r: any) => r.success);
        if (allSuccessful && config.onSuccess) {
          await config.onSuccess(responseData.results);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        setErrors((prev) => [...prev, errorMessage]);

        // Update all files to error state
        setFiles((prev) =>
          prev.map((file) => ({
            ...file,
            status: "error" as const,
            error: errorMessage,
          }))
        );

        config.onError?.(
          error instanceof Error ? error : new Error(errorMessage)
        );
      } finally {
        setIsUploading(false);
        abortControllers.current.clear();
      }
    },
    [routeName, config]
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
// Type-safe Route Upload Hook
// ========================================

export function useS3UploadRoute<TRouter, TRouteName extends keyof TRouter>(
  routeName: TRouteName,
  config: S3RouteUploadConfig = {}
): S3RouteUploadResult {
  return useS3RouteUpload<TRouter>(routeName, config);
}

// ========================================
// Utility Types for Better DX
// ========================================

export type RouterRouteNames<TRouter> = keyof TRouter;
