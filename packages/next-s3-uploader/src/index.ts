// Legacy API (deprecated)
export { useS3FileUpload } from "./hooks/useS3FileUpload";
export * from "./utils";

// New Gold Standard API
export {
  createS3Handler,
  createS3Router,
  formatETA,
  formatUploadSpeed,
  s3,
  S3ArraySchema,
  S3FileSchema,
  S3ImageSchema,
  S3ObjectSchema,
  S3Schema,
  useS3Upload,
  useS3UploadRoute,
} from "./core";
export type {
  InferS3Input,
  InferS3Output,
  S3UploadConfig,
  S3UploadedFile,
  S3UploadResult,
} from "./core";
