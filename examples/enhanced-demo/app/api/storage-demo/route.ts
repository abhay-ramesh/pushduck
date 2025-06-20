/**
 * Storage API Demo Route
 *
 * Demonstrates the new object-style storage API with correct syntax
 */

import { NextRequest, NextResponse } from "next/server";
import { storage } from "../../../lib/upload";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const operation = searchParams.get("operation") || "list";

  try {
    switch (operation) {
      case "list":
        // Object-style API: storage.list.files()
        const files = await storage.list.files({
          prefix: "users/demo/",
          maxFiles: 10,
          sortBy: "modified",
          sortOrder: "desc",
        });

        return NextResponse.json({
          success: true,
          operation: "storage.list.files()",
          files,
          count: files.length,
        });

      case "list-by-extension":
        // Correct syntax: byExtension takes two separate parameters
        const jpgFiles = await storage.list.byExtension("jpg", "users/demo/");

        return NextResponse.json({
          success: true,
          operation: "storage.list.byExtension(extension, prefix)",
          files: jpgFiles,
          count: jpgFiles.length,
          note: "Correct syntax: two separate parameters, not an object",
        });

      case "metadata":
        // Object-style API: storage.metadata.getInfo()
        const fileKey = searchParams.get("key") || "users/demo/test.jpg";
        const info = await storage.metadata.getInfo(fileKey);

        return NextResponse.json({
          success: true,
          operation: "storage.metadata.getInfo()",
          fileInfo: info,
        });

      case "directories":
        // Object-style API: storage.list.directories()
        const directories = await storage.list.directories("users/");

        return NextResponse.json({
          success: true,
          operation: "storage.list.directories()",
          directories,
          count: directories.length,
        });

      case "presigned":
        // Object-style API: storage.download.presignedUrl()
        const downloadKey = searchParams.get("key") || "users/demo/test.jpg";
        const presignedUrl = await storage.download.presignedUrl(
          downloadKey,
          3600
        );

        return NextResponse.json({
          success: true,
          operation: "storage.download.presignedUrl()",
          presignedUrl,
          expiresIn: "1 hour",
        });

      case "validation":
        // Object-style API: storage.validation.exists()
        const checkKey = searchParams.get("key") || "users/demo/test.jpg";
        const exists = await storage.validation.exists(checkKey);

        return NextResponse.json({
          success: true,
          operation: "storage.validation.exists()",
          key: checkKey,
          exists,
        });

      default:
        return NextResponse.json({
          success: false,
          error: "Unknown operation",
          availableOperations: [
            "list",
            "list-by-extension",
            "metadata",
            "directories",
            "presigned",
            "validation",
          ],
        });
    }
  } catch (error) {
    console.error("Storage operation failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        operation,
      },
      { status: 500 }
    );
  }
}
