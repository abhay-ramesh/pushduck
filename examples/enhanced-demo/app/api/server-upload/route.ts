/**
 * Server-Side File Upload API Route
 *
 * Downloads files from URLs and uploads them to S3 using storage.upload.file
 */

import { storage } from "@/lib/upload";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, filename, userId = "demo-user" } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL is required" },
        { status: 400 }
      );
    }

    console.log(`Starting server-side upload for: ${url}`);

    // Step 1: Download the file
    const downloadResult = await downloadFileUseFetch(url);

    if (!downloadResult) {
      return NextResponse.json(
        { success: false, error: "Failed to download file from URL" },
        { status: 400 }
      );
    }

    const { fileData, contentType, contentLength } = downloadResult;

    // Step 2: Create a File object
    const finalFilename = filename || extractFilenameFromUrl(url);
    const uploadFile = new File([fileData], finalFilename, {
      type: contentType || "application/octet-stream",
    });

    console.log(
      `File downloaded successfully: ${finalFilename} (${contentLength} bytes, ${contentType})`
    );

    // Step 3: Upload to S3 using storage.upload.file
    const uploadKey = `server-uploads/${userId}/${Date.now()}-${finalFilename}`;

    const uploadResult = await storage.upload.file(uploadFile, uploadKey, {
      metadata: {
        "original-url": url,
        "upload-source": "server-side",
        "user-id": userId,
        "uploaded-at": new Date().toISOString(),
        "content-length": contentLength.toString(),
      },
    });

    console.log(`✅ Server-side upload successful: ${uploadKey}`);

    // Step 4: Generate download URL for verification
    const downloadUrl = await storage.download.presignedUrl(uploadKey, 3600);

    return NextResponse.json({
      success: true,
      result: {
        key: uploadKey,
        url: downloadUrl,
        filename: finalFilename,
        size: contentLength,
        contentType: contentType,
        originalUrl: url,
        uploadedAt: new Date().toISOString(),
        metadata: {
          "original-url": url,
          "upload-source": "server-side",
          "user-id": userId,
        },
      },
    });
  } catch (error) {
    console.error("Server-side upload failed:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

// Enhanced download function with better error handling and metadata
export async function downloadFileUseFetch(url: string): Promise<{
  fileData: Uint8Array;
  contentType: string;
  contentLength: number;
} | null> {
  try {
    console.log(`Downloading file from: ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Pushduck/1.0)",
        Accept: "image/*,*/*;q=0.9",
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      console.error(
        `HTTP error! status: ${response.status}, statusText: ${response.statusText}`
      );
      return null;
    }

    const contentLength = parseInt(
      response.headers.get("content-length") || "0"
    );
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";

    console.log(
      `Response headers: Content-Type: ${contentType}, Content-Length: ${contentLength}`
    );

    // Check if file is too large (e.g., > 10MB)
    if (contentLength > 10 * 1024 * 1024) {
      console.error(`File too large: ${contentLength} bytes`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const fileData = new Uint8Array(arrayBuffer);

    console.log(`File downloaded successfully: ${fileData.length} bytes`);

    return {
      fileData,
      contentType,
      contentLength: fileData.length,
    };
  } catch (error) {
    console.error("Error downloading file:", error);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.error("Download timeout");
      } else if (error.name === "TypeError") {
        console.error("Network error or invalid URL");
      }
    }

    return null;
  }
}

// Helper function to extract filename from URL
function extractFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split("/").pop() || "downloaded-file";

    // Remove query parameters from filename
    const cleanFilename = filename.split("?")[0];

    // If no extension, try to guess from URL or default to .bin
    if (!cleanFilename.includes(".")) {
      // Try to guess extension from URL or content
      if (url.includes("image") || url.includes("img")) {
        return cleanFilename + ".png";
      }
      return cleanFilename + ".bin";
    }

    return cleanFilename;
  } catch {
    return `downloaded-file-${Date.now()}.bin`;
  }
}

// GET endpoint for testing specific URLs
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const testUrl =
    searchParams.get("url") || "https://mkdirs.com/og.png?v=20250517";

  return NextResponse.json({
    message: "Server-side upload test endpoint",
    testUrl,
    usage: "POST with { url, filename?, userId? }",
    example: {
      url: testUrl,
      filename: "test-image.png",
      userId: "demo-user",
    },
  });
}
