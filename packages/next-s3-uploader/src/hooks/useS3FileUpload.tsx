"use client";

import { RefObject, useRef, useState } from "react";

type UploadOptions = {
  multiple?: boolean;
  maxFiles?: number;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  isPrivate?: boolean;
  onProgress?: (progress: number, file: File) => void;
  onError?: (error: Error, file: File) => void;
  onSuccess?: (url: string, file: File) => void;
  retryAttempts?: number;
  chunkSize?: number;
};

type PresignedUrlResponse = {
  key: string;
  presignedPutUrl: string;
  s3ObjectUrl: string;
};

type UploadError = {
  message: string;
  code: string;
  file?: File;
};

type UploadedFile = {
  key: string;
  status: "uploading" | "success" | "error";
  progress: number;
  url: string;
  timeLeft?: string;
  error?: UploadError;
  isPrivate: boolean;
  size: number;
  type: string;
  lastModified: number;
};

export const useS3FileUpload = (options: UploadOptions = {}) => {
  const {
    maxFiles,
    maxFileSize,
    multiple,
    allowedFileTypes,
    isPrivate = false,
    onProgress,
    onError,
    onSuccess,
    retryAttempts = 3,
    chunkSize = 5 * 1024 * 1024, // 5MB chunks
  } = options;

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const abortControllers = useRef<Record<string, AbortController>>({});

  const reset = (ref?: RefObject<HTMLInputElement>) => {
    // Cancel any ongoing uploads
    Object.values(abortControllers.current).forEach((controller) =>
      controller.abort()
    );
    abortControllers.current = {};

    ref?.current?.value ? (ref.current.value = "") : null;
    setUploadedFiles([]);
    setIsUploading(false);
  };

  const validateFile = (file: File): UploadError | null => {
    if (maxFileSize && file.size > maxFileSize) {
      return {
        message: `File ${file.name} exceeds the maximum file size of ${maxFileSize} bytes.`,
        code: "FILE_TOO_LARGE",
        file,
      };
    }

    if (allowedFileTypes && !allowedFileTypes.includes(file.type)) {
      return {
        message: `File type ${
          file.type
        } is not allowed. Allowed types: ${allowedFileTypes.join(", ")}`,
        code: "INVALID_FILE_TYPE",
        file,
      };
    }

    return null;
  };

  const uploadWithRetry = async (
    file: File,
    presignedUrl: string,
    retryCount = 0
  ): Promise<void> => {
    try {
      const controller = new AbortController();
      abortControllers.current[file.name] = controller;

      const response = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        signal: controller.signal,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      delete abortControllers.current[file.name];
    } catch (error: any) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }

      if (retryCount < retryAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, retryCount) * 1000)
        );
        return uploadWithRetry(file, presignedUrl, retryCount + 1);
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  };

  const uploadFiles = async (
    files: FileList | File[],
    customKeys?: string[],
    apiEndpoint: string = "/api/s3upload",
    requestOptions?: RequestInit
  ) => {
    if (!multiple && files.length > 1) {
      throw new Error("Only one file can be uploaded.");
    }

    if (maxFiles && files.length > maxFiles) {
      throw new Error(`Exceeded maximum allowed files. Limit is ${maxFiles}.`);
    }

    if (files.length === 0) {
      throw new Error("No files to upload.");
    }

    if (customKeys && customKeys.length !== files.length) {
      throw new Error(
        "Number of custom keys must match number of files to upload."
      );
    }

    setIsUploading(true);

    try {
      // Validate all files first
      const fileArray = Array.from(files);
      const validationErrors: UploadError[] = [];

      fileArray.forEach((file) => {
        const error = validateFile(file);
        if (error) validationErrors.push(error);
      });

      if (validationErrors.length > 0) {
        validationErrors.forEach((error) =>
          onError?.(new Error(error.message), error.file!)
        );
        throw new Error("File validation failed");
      }

      const response = await fetch(apiEndpoint, {
        method: requestOptions?.method || "POST",
        body:
          requestOptions?.body ||
          JSON.stringify({
            keys: customKeys || fileArray.map((file) => file.name),
            isPrivate,
          }),
        headers: requestOptions?.headers || {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get presigned URLs: ${response.statusText}`);
      }

      const data: PresignedUrlResponse[] = await response.json();

      const uploadPromises = data.map(async (presignedUrl, index) => {
        const file = fileArray[index];
        const uploadedFile: UploadedFile = {
          key: presignedUrl.key,
          status: "uploading",
          progress: 0,
          url: presignedUrl.s3ObjectUrl,
          isPrivate,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        };

        setUploadedFiles((prev) => [...prev, uploadedFile]);

        try {
          await uploadWithRetry(file, presignedUrl.presignedPutUrl);

          uploadedFile.status = "success";
          uploadedFile.progress = 100;
          onSuccess?.(presignedUrl.s3ObjectUrl, file);
        } catch (error: any) {
          uploadedFile.status = "error";
          uploadedFile.error = {
            message: error instanceof Error ? error.message : String(error),
            code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
            file,
          };
          onError?.(
            error instanceof Error ? error : new Error(String(error)),
            file
          );
        }

        setUploadedFiles((prev) =>
          prev.map((f) => (f.key === uploadedFile.key ? uploadedFile : f))
        );
      });

      await Promise.all(uploadPromises);
    } catch (error) {
      console.error("Upload failed:", error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const cancelUpload = (key: string) => {
    const controller = abortControllers.current[key];
    if (controller) {
      controller.abort();
      delete abortControllers.current[key];

      setUploadedFiles((prev) =>
        prev.map((file) =>
          file.key === key
            ? {
                ...file,
                status: "error",
                error: { message: "Upload cancelled", code: "CANCELLED" },
              }
            : file
        )
      );
    }
  };

  return {
    uploadedFiles,
    uploadFiles,
    reset,
    cancelUpload,
    isUploading,
  };
};
