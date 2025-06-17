import { uploadConfig } from "next-s3-uploader/server";

// Initialize upload configuration with simplified one-step process
const { s3, createS3Handler, config } = uploadConfig
  .cloudflareR2({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
      bucket: process.env.R2_BUCKET!,
  })
  .defaults({
    maxFileSize: "10MB",
    acl: "public-read",
  })
  .build();

export { s3, createS3Handler, config };
