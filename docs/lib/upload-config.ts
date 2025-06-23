import { uploadConfig } from "pushduck/server";

// Initialize upload configuration with simplified one-step process
const { s3, config } = uploadConfig
  .provider("cloudflareR2", {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    bucket: process.env.R2_BUCKET!,
  })
  .defaults({
    maxFileSize: "10MB",
    acl: "public-read",
  })
  .build();

export { config, s3 };
