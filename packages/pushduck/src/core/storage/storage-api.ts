/**
 * Object-Style Storage API
 *
 * Provides a clean, discoverable API for S3 operations.
 * Usage: storage.list.files(), storage.metadata.getInfo(), etc.
 */

import { getUploadConfig, setGlobalUploadConfig } from "../config";
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

/**
 * Improved helper to safely execute operations with a specific config
 * This creates a new client instance rather than manipulating global state
 */
function withConfig<T>(
  config: UploadConfig,
  fn: () => T | Promise<T>
): T | Promise<T> {
  const originalConfig = getUploadConfig();

  // Only change global config if it's different
  if (config !== originalConfig) {
    setGlobalUploadConfig(config);

    try {
      const result = fn();

      // Handle both sync and async functions
      if (result instanceof Promise) {
        return result.finally(() => {
          setGlobalUploadConfig(originalConfig);
        });
      } else {
        setGlobalUploadConfig(originalConfig);
        return result;
      }
    } catch (error) {
      setGlobalUploadConfig(originalConfig);
      throw error;
    }
  } else {
    // Config is the same, no need to swap
    return fn();
  }
}

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
      withConfig(this.config, () => client.listFiles(options)),

    paginated: (options?: client.PaginatedListOptions) =>
      withConfig(this.config, () => client.listFilesPaginated(options)),

    byExtension: (extension: string, prefix?: string) =>
      withConfig(this.config, () =>
        client.listFilesByExtension(extension, prefix)
      ),

    bySize: (minSize?: number, maxSize?: number, prefix?: string) =>
      withConfig(this.config, () =>
        client.listFilesBySize(minSize, maxSize, prefix)
      ),

    byDate: (fromDate?: Date, toDate?: Date, prefix?: string) =>
      withConfig(this.config, () =>
        client.listFilesByDate(fromDate, toDate, prefix)
      ),

    directories: (prefix?: string) =>
      withConfig(this.config, () => client.listDirectories(prefix)),

    paginatedGenerator: (options?: client.PaginatedListOptions) =>
      withConfig(this.config, () =>
        client.listFilesPaginatedGenerator(options)
      ),
  };

  // Metadata operations - grouped under 'metadata' namespace
  metadata = {
    getInfo: (key: string) =>
      withConfig(this.config, () => client.getFileInfo(key)),

    getBatch: (keys: string[]) =>
      withConfig(this.config, () => client.getFilesInfo(keys)),

    getSize: (key: string) =>
      withConfig(this.config, () => client.getFileSize(key)),

    getContentType: (key: string) =>
      withConfig(this.config, () => client.getFileContentType(key)),

    getLastModified: (key: string) =>
      withConfig(this.config, () => client.getFileLastModified(key)),

    getCustom: (key: string) =>
      withConfig(this.config, () => client.getFileMetadata(key)),

    setCustom: (key: string, metadata: Record<string, string>) =>
      withConfig(this.config, () => client.setFileMetadata(key, metadata)),
  };

  // Download operations - grouped under 'download' namespace
  download = {
    presignedUrl: (key: string, expiresIn?: number) =>
      withConfig(this.config, () =>
        client.generatePresignedDownloadUrl(key, expiresIn)
      ),

    url: (key: string) => withConfig(this.config, () => client.getFileUrl(key)),
  };

  // Upload operations - grouped under 'upload' namespace
  upload = {
    file: (file: File | Buffer, key: string, options?: any) =>
      withConfig(this.config, () => client.uploadFileToS3(file, key, options)),

    presignedUrl: (options: client.PresignedUrlOptions) =>
      withConfig(this.config, () => client.generatePresignedUploadUrl(options)),

    presignedBatch: (requests: client.PresignedUrlOptions[]) =>
      withConfig(this.config, () =>
        client.generatePresignedUploadUrls(requests)
      ),

    generateKey: (options: client.FileKeyOptions) =>
      withConfig(this.config, () => client.generateFileKey(options)),
  };

  // Validation operations - grouped under 'validation' namespace
  validation = {
    exists: (key: string) =>
      withConfig(this.config, () => client.checkFileExists(key)),

    existsWithInfo: (key: string) =>
      withConfig(this.config, () => client.fileExistsWithInfo(key)),

    validateFile: (key: string, rules: client.ValidationRules) =>
      withConfig(this.config, () => client.validateFile(key, rules)),

    validateFiles: (keys: string[], rules: client.ValidationRules) =>
      withConfig(this.config, () => client.validateFiles(keys, rules)),

    connection: () =>
      withConfig(this.config, () => client.validateS3Connection()),
  };

  // Delete operations - grouped under 'delete' namespace
  delete = {
    file: (key: string) =>
      withConfig(this.config, () => client.deleteFile(key)),

    files: (keys: string[]) =>
      withConfig(this.config, () => client.deleteFiles(keys)),

    byPrefix: (
      prefix: string,
      options?: { dryRun?: boolean; maxFiles?: number }
    ) =>
      withConfig(this.config, () =>
        client.deleteFilesByPrefix(prefix, options)
      ),
  };
}

/**
 * Create a storage instance with the given configuration
 */
export function createStorage(config: UploadConfig): StorageInstance {
  return new StorageInstance(config);
}
