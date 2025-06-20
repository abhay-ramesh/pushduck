// Storage exports - clean separation of concerns

// High-level Storage API (recommended for most use cases)
export { createStorage, StorageInstance } from "./storage-api";

// Low-level S3 client (for advanced usage)
export { createS3Client, resetS3Client } from "./client";

// Types (shared across all APIs)
export type {
  DeleteByPrefixResult,
  DeleteError,
  DeleteFilesResult,
  FileInfo,
  FileInfoResult,
  FileKeyOptions,
  FileValidationResult,
  ListFilesOptions,
  ListFilesResult,
  PaginatedListOptions,
  PresignedUrlOptions,
  PresignedUrlResult,
  ProgressCallback,
  UploadProgress,
  ValidationRules,
} from "./client";
