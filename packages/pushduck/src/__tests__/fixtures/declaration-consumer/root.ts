/**
 * The same setup through the root `pushduck` entry, which also exports
 * `createUploadConfig`.
 */
import { createUploadConfig } from "pushduck";

export const { upload, storage, config } = createUploadConfig()
  .provider("aws", {
    bucket: process.env.AWS_BUCKET ?? "",
    region: process.env.AWS_REGION ?? "",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  })
  .build();

export const router = upload.createRouter({ file: upload.file() });
