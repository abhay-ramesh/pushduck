"use client";

/**
 * Modern React Hooks for next-s3-uploader
 *
 * This provides the new gold standard API that integrates with the schema system
 */

import { InferS3Input, S3Schema, S3ValidationResult } from "./schema";

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

// useS3Upload function removed - use useUploadRoute instead

// ========================================
// Legacy Hook Removed
// ========================================

// useS3FileUpload has been removed.
// Please migrate to useUploadRoute for enhanced type safety:
//
// Before: const { uploadedFiles, uploadFiles } = useS3FileUpload(options);
// After:  const { files, uploadFiles } = useUploadRoute("routeName");
//
// See API_STYLE_GUIDE.md for migration instructions.
