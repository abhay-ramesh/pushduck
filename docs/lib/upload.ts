import { createUploadConfig } from "pushduck/server";
import { env } from "./env";

// Initialize upload configuration using createUploadConfig directly
const { s3, config } = createUploadConfig()
  .provider("cloudflareR2", {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    bucket: env.R2_BUCKET,
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region: "auto",
  })
  .defaults({
    maxFileSize: "10MB",
  })
  .build();

export { config, s3 };
