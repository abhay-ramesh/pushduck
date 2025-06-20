/**
 * Presigned URL API Route
 *
 * Generates presigned URLs for viewing and downloading files from private S3 buckets
 */

import { storage } from "@/lib/upload";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operation, key, keys, expiresIn = 3600 } = body; // Default 1 hour expiration

    switch (operation) {
      case "get-download-url":
        if (!key) {
          return NextResponse.json(
            { success: false, error: "File key is required" },
            { status: 400 }
          );
        }

        // Generate presigned URL for GET operation (viewing/downloading)
        const downloadUrl = await generatePresignedDownloadUrl(key, expiresIn);

        return NextResponse.json({
          success: true,
          url: downloadUrl,
          key,
          expiresIn,
          note: "Use this URL to view or download the file",
        });

      case "get-download-urls":
        if (!keys || !Array.isArray(keys)) {
          return NextResponse.json(
            { success: false, error: "File keys array is required" },
            { status: 400 }
          );
        }

        // Generate multiple presigned URLs
        const downloadUrls = await Promise.allSettled(
          keys.map(async (fileKey: string) => {
            try {
              const url = await generatePresignedDownloadUrl(
                fileKey,
                expiresIn
              );
              return { key: fileKey, url, success: true };
            } catch (error) {
              return {
                key: fileKey,
                url: null,
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              };
            }
          })
        );

        const results = downloadUrls.map((result) => {
          if (result.status === "fulfilled") {
            return result.value;
          } else {
            return {
              key: "unknown",
              url: null,
              success: false,
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : "Unknown error",
            };
          }
        });

        return NextResponse.json({
          success: true,
          urls: results,
          expiresIn,
          note: "Presigned URLs for multiple files",
        });

      default:
        return NextResponse.json(
          {
            success: false,
            error:
              "Unknown operation. Use: get-download-url, get-download-urls",
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Presigned URL generation failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Generate presigned URL for downloading/viewing a file
 * This creates a GET presigned URL, not PUT (which is for uploads)
 */
async function generatePresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  return await storage.download.presignedUrl(key, expiresIn);
}
