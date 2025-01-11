import { createS3Client, generatePresignedUrls } from "next-s3-uploader";
import { NextResponse } from "next/server";

const requiredEnvVars = [
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
] as const;

function validateEnvVars() {
  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }
}

export async function POST(request: Request) {
  try {
    validateEnvVars();

    const { keys, isPrivate } = await request.json();

    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json(
        { error: "Invalid or missing keys" },
        { status: 400 }
      );
    }

    if (keys.length > 10) {
      return NextResponse.json(
        { error: "Too many files. Maximum 10 files allowed per request." },
        { status: 400 }
      );
    }

    if (!keys.every((key) => typeof key === "string" && key.length > 0)) {
      return NextResponse.json(
        { error: "Invalid key format. All keys must be non-empty strings." },
        { status: 400 }
      );
    }

    const s3Client = createS3Client({
      provider: (process.env.S3_PROVIDER as "aws" | "minio" | "other") || "aws",
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION!,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      maxRetries: 3,
    });

    const urls = await generatePresignedUrls(
      s3Client,
      keys,
      process.env.S3_BUCKET!,
      "uploads/",
      isPrivate,
      "upload",
      {
        expiresIn: 3600,
      }
    );

    return NextResponse.json(urls);
  } catch (error) {
    console.error("Error generating presigned URLs:", error);

    if (error instanceof Error) {
      if (error.message.includes("Missing required environment variables")) {
        return NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Failed to generate presigned URLs" },
      { status: 500 }
    );
  }
}
