import { uploadConfig } from "pushduck/server";
import { env } from "./env";

// Initialize upload configuration with simplified one-step process
const { s3, config } = uploadConfig
  .provider("cloudflareR2", {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    bucket: env.R2_BUCKET,
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    region: "auto",
  })
  .defaults({
    maxFileSize: "10MB",
    acl: "public-read",
  })
  .build();

export { config, s3 };
