/**
 * Object-Style Storage API
 *
 * Provides a clean, discoverable API for S3 operations.
 * Usage: storage.list.files(), storage.metadata.getInfo(), etc.
 */

import type { UploadConfig } from "../config/upload-config";
import * as client from "./client";

// Types re-export for convenience
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

export class StorageInstance {
  private readonly config: UploadConfig;

  constructor(config: UploadConfig) {
    if (!config) {
      throw new Error("StorageInstance requires a valid configuration");
    }
    this.config = Object.freeze(config); // Prevent accidental mutations
  }

  /**
   * Get the current configuration (read-only)
   */
  getConfig(): Readonly<UploadConfig> {
    return this.config;
  }

  /**
   * Get provider information
   */
  getProviderInfo() {
    return {
      provider: this.config.provider.provider,
      bucket: this.config.provider.bucket,
      region: this.config.provider.region,
    };
  }

  // List operations - grouped under 'list' namespace
  list = {
    files: (options?: client.ListFilesOptions) =>
      client.listFiles(this.config, options),

    paginated: (options?: client.PaginatedListOptions) =>
      client.listFilesPaginated(this.config, options),

    byExtension: (extension: string, prefix?: string) =>
      client.listFilesByExtension(this.config, extension, prefix),

    bySize: (minSize?: number, maxSize?: number, prefix?: string) =>
      client.listFilesBySize(this.config, minSize, maxSize, prefix),

    byDate: (fromDate?: Date, toDate?: Date, prefix?: string) =>
      client.listFilesByDate(this.config, fromDate, toDate, prefix),

    directories: (prefix?: string) =>
      client.listDirectories(this.config, prefix),

    paginatedGenerator: (options?: client.PaginatedListOptions) =>
      client.listFilesPaginatedGenerator(this.config, options),
  };

  // Metadata operations - grouped under 'metadata' namespace
  metadata = {
    getInfo: (key: string) => client.getFileInfo(this.config, key),

    getBatch: (keys: string[]) => client.getFilesInfo(this.config, keys),

    getSize: (key: string) => client.getFileSize(this.config, key),

    getContentType: (key: string) =>
      client.getFileContentType(this.config, key),

    getLastModified: (key: string) =>
      client.getFileLastModified(this.config, key),

    getCustom: (key: string) => client.getFileMetadata(this.config, key),

    setCustom: (key: string, metadata: Record<string, string>) =>
      client.setFileMetadata(this.config, key, metadata),
  };

  // Download operations - grouped under 'download' namespace
  download = {
    presignedUrl: (key: string, expiresIn?: number) =>
      client.generatePresignedDownloadUrl(this.config, key, expiresIn),

    url: (key: string) => client.getFileUrl(this.config, key),
  };

  // Upload operations - grouped under 'upload' namespace
  upload = {
    file: (file: File | Buffer, key: string, options?: any) =>
      client.uploadFileToS3(this.config, file, key, options),

    presignedUrl: (options: client.PresignedUrlOptions) =>
      client.generatePresignedUploadUrl(this.config, options),

    presignedBatch: (requests: client.PresignedUrlOptions[]) =>
      client.generatePresignedUploadUrls(this.config, requests),

    generateKey: (options: client.FileKeyOptions) =>
      client.generateFileKey(this.config, options),
  };

  // Validation operations - grouped under 'validation' namespace
  validation = {
    exists: (key: string) => client.checkFileExists(this.config, key),

    existsWithInfo: (key: string) =>
      client.fileExistsWithInfo(this.config, key),

    validateFile: (key: string, rules: client.ValidationRules) =>
      client.validateFile(this.config, key, rules),

    validateFiles: (keys: string[], rules: client.ValidationRules) =>
      client.validateFiles(this.config, keys, rules),

    connection: () => client.validateS3Connection(this.config),
  };

  // Delete operations - grouped under 'delete' namespace
  delete = {
    file: (key: string) => client.deleteFile(this.config, key),

    files: (keys: string[]) => client.deleteFiles(this.config, keys),

    byPrefix: (
      prefix: string,
      options?: { dryRun?: boolean; maxFiles?: number }
    ) => client.deleteFilesByPrefix(this.config, prefix, options),
  };

  // Note: Additional utility functions like copyFile, moveFile, getTotalSize, getFileCount
  // can be added to client.ts as needed
}

/**
 * Create a new storage instance with the given configuration
 */
export function createStorage(config: UploadConfig): StorageInstance {
  return new StorageInstance(config);
}
