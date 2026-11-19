/**
 * Under `isolatedDeclarations` every export needs an explicit annotation, so
 * each type in the build result must be importable by name.
 */
import {
  createUploadConfig,
  type StorageInstance,
  type UploadConfig,
  type UploadConfigBuilder,
  type UploadInitResult,
} from "pushduck/server";

export const builder: UploadConfigBuilder = createUploadConfig().provider(
  "minio",
  {
    endpoint: process.env.MINIO_ENDPOINT ?? "",
    bucket: process.env.MINIO_BUCKET ?? "",
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "",
  },
);

export const result: UploadInitResult = builder.build();
export const config: UploadConfig = result.config;
export const storage: StorageInstance = result.storage;
