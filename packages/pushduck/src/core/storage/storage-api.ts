/**
 * Object-Style Storage API
 *
 * Provides a clean, discoverable API for S3 operations.
 * Usage: storage.list.files(), storage.metadata.getInfo(), etc.
 */

import type { UploadConfig } from "../config/upload-config";
import * as client from "./client";
import { inScope } from "./keys";

// Types re-export for convenience
export type {
  CopyFileOptions,
  DeleteByPrefixResult,
  DeleteError,
  DeleteFilesResult,
  DownloadResponseOptions,
  FileInfo,
  FileInfoResult,
  FileKeyOptions,
  FileValidationResult,
  ListFilesOptions,
  ListFilesResult,
  PaginatedListOptions,
  PresignedDownloadOptions,
  PresignedUrlOptions,
  PresignedUrlResult,
  ProgressCallback,
  StoredObject,
  UploadFileOptions,
  UploadProgress,
  ValidationRules,
} from "./client";
export type { ContentDispositionType } from "./content-disposition";

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
  //
  // Two ways to serve a private file: `presignedUrl` hands the client a
  // signed URL (bytes go straight from storage), `response` streams it
  // through your server. Both take the same `filename`/`disposition`.
  download = {
    /** Signed GET URL. A number is the lifetime in seconds. */
    presignedUrl: (
      key: string,
      options?: number | client.PresignedDownloadOptions
    ) => client.generatePresignedDownloadUrl(this.config, key, options),

    /** Unsigned public URL (custom domain when configured). */
    url: (key: string) => client.getFileUrl(this.config, key),

    /** The object as a stream plus its size, type, etag and date. */
    get: (key: string) => client.getObject(this.config, key),

    bytes: (key: string) => client.getObjectBytes(this.config, key),

    text: (key: string) => client.getObjectText(this.config, key),

    /** A `Response` streaming the object — return it from a route handler. */
    response: (key: string, options?: client.DownloadResponseOptions) =>
      client.getObjectResponse(this.config, key, options),
  };

  // Upload operations - grouped under 'upload' namespace
  upload = {
    file: (
      file: File | Buffer,
      key: string,
      options?: client.UploadFileOptions
    ) => client.uploadFileToS3(this.config, file, key, options),

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

  // Copy operations - server-side, the bytes never leave the provider
  copy = {
    file: (from: string, to: string, options?: client.CopyFileOptions) =>
      client.copyFile(this.config, from, to, options),
  };

  // Move operations - copy then delete; not atomic (S3 has no rename)
  move = {
    file: (from: string, to: string) =>
      client.moveFile(this.config, from, to),
  };

  // Key operations - pure, no request to the provider
  keys = {
    /**
     * Whether `key` lies inside the folder `prefix`, segment by segment:
     * `users/1` does not contain `users/10/a.png`. Use it before acting on a
     * key a client sent back. Fails closed on any key pushduck would refuse.
     */
    inScope: (key: string, prefix: string) => inScope(key, prefix),
  };
}

/**
 * Create a new storage instance with the given configuration
 */
export function createStorage(config: UploadConfig): StorageInstance {
  return new StorageInstance(config);
}
