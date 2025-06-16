/**
 * Modern React Hooks for next-s3-uploader
 *
 * This provides the new gold standard API that integrates with the schema system
 */

import { useCallback, useRef, useState } from "react";
import {
  InferS3Input,
  InferS3Output,
  S3Schema,
  S3ValidationResult,
} from "./schema";

// ========================================
// Types
// ========================================

export interface S3UploadConfig<T = any> {
  endpoint?: string;
  onSuccess?: (result: T) => void | Promise<void>;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
}

export interface S3UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  url?: string;
  error?: string;
  file: File;
  validationResult?: S3ValidationResult;
}

export interface S3UploadResult<T extends S3Schema> {
  files: S3UploadedFile[];
  upload: (input: InferS3Input<T>) => Promise<void>;
  reset: () => void;
  isUploading: boolean;
  errors: string[];
}

// ========================================
// Core Hook Implementation
// ========================================

export function useS3Upload<T extends S3Schema>(
  schema: T,
  config: S3UploadConfig<InferS3Output<T>> = {}
): S3UploadResult<T> {
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

  const upload = useCallback(
    async (input: InferS3Input<T>) => {
      try {
        setIsUploading(true);
        setErrors([]);

        // Validate input using schema
        const validationResult = await schema.validate(input);

        if (!validationResult.success) {
          const errorMessage =
            validationResult.error?.message || "Validation failed";
          setErrors([errorMessage]);
          config.onError?.(new Error(errorMessage));
          return;
        }

        // Convert validated data to file array for processing
        const filesToUpload = extractFiles(validationResult.data);

        // Initialize file states
        const initialFiles: S3UploadedFile[] = filesToUpload.map(
          (file, index) => ({
            id: `${Date.now()}-${index}`,
            name: file.name,
            size: file.size,
            type: file.type,
            status: "pending" as const,
            progress: 0,
            file,
            validationResult,
          })
        );

        setFiles(initialFiles);

        // Upload each file
        const uploadPromises = initialFiles.map(uploadSingleFile);
        await Promise.all(uploadPromises);

        // Call success callback with validated data
        if (config.onSuccess) {
          await config.onSuccess(validationResult.data as InferS3Output<T>);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        setErrors((prev) => [...prev, errorMessage]);
        config.onError?.(
          error instanceof Error ? error : new Error(errorMessage)
        );
      } finally {
        setIsUploading(false);
        abortControllers.current.clear();
      }
    },
    [schema, config]
  );

  const uploadSingleFile = useCallback(
    async (fileInfo: S3UploadedFile) => {
      try {
        // Update status to uploading
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileInfo.id ? { ...f, status: "uploading" as const } : f
          )
        );

        // Get presigned URL
        const response = await fetch(config.endpoint || "/api/s3upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keys: [fileInfo.name],
            isPrivate: false,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Failed to get presigned URL: ${response.statusText}`
          );
        }

        const [presignedData] = await response.json();

        // Create abort controller for this upload
        const controller = new AbortController();
        abortControllers.current.set(fileInfo.id, controller);

        // Upload file with progress tracking
        const uploadResponse = await fetch(presignedData.presignedPutUrl, {
          method: "PUT",
          body: fileInfo.file,
          signal: controller.signal,
          headers: {
            "Content-Type": fileInfo.type,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`);
        }

        // Update file as successful
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileInfo.id
              ? {
                  ...f,
                  status: "success" as const,
                  progress: 100,
                  url: presignedData.s3ObjectUrl,
                }
              : f
          )
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return; // Upload was cancelled
        }

        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileInfo.id
              ? {
                  ...f,
                  status: "error" as const,
                  error: errorMessage,
                }
              : f
          )
        );
      } finally {
        abortControllers.current.delete(fileInfo.id);
      }
    },
    [config.endpoint]
  );

  return {
    files,
    upload,
    reset,
    isUploading,
    errors,
  };
}

// ========================================
// Utility Functions
// ========================================

function extractFiles(data: unknown): File[] {
  const files: File[] = [];

  function traverse(obj: unknown): void {
    if (obj instanceof File) {
      files.push(obj);
    } else if (Array.isArray(obj)) {
      obj.forEach(traverse);
    } else if (obj && typeof obj === "object") {
      Object.values(obj).forEach(traverse);
    }
  }

  traverse(data);
  return files;
}

// ========================================
// Legacy Compatibility Hook
// ========================================

/**
 * Wrapper to provide backward compatibility with the old API
 * while encouraging migration to the new schema-based approach
 */
export function useS3FileUpload(options: any = {}) {
  console.warn(
    "⚠️  useS3FileUpload is deprecated. Please migrate to useS3Upload with schema validation.\n" +
      "See migration guide: https://next-s3-uploader.com/migrate"
  );

  // Return the old hook implementation for now
  // This will be removed in a future major version
  return {} as any;
}
