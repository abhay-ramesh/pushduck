/**
 * Debug API Route
 *
 * This helps debug what's actually in the S3 bucket
 */

import { NextRequest, NextResponse } from "next/server";

// Import the upload configuration to ensure it's initialized
import "../../../lib/upload";
import { storage } from "../../../lib/upload";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const operation = searchParams.get("operation") || "connection";

  try {
    switch (operation) {
      case "connection":
        // Test the S3 connection
        const connectionResult = await storage.validation.exists("test.txt");
        return NextResponse.json({
          success: true,
          connection: connectionResult,
        });

      case "list-all":
        // List ALL files in the bucket (no prefix filter)
        const allFiles = await storage.list.files({
          maxFiles: 50, // Limit to avoid overwhelming response
          includeMetadata: true,
          sortBy: "key",
          sortOrder: "asc",
        });

        return NextResponse.json({
          success: true,
          files: allFiles,
          count: allFiles.length,
          note: "All files in bucket (up to 50)",
        });

      case "list-directories":
        // List all top-level directories
        const directories = await storage.list.directories("");

        return NextResponse.json({
          success: true,
          directories,
          count: directories.length,
          note: "Top-level directories in bucket",
        });

      case "analyze-structure":
        // Get both files and directories to understand structure
        const [files, dirs] = await Promise.all([
          storage.list.files({
            maxFiles: 100,
            includeMetadata: true,
          }),
          storage.list.directories(""),
        ]);

        // Analyze the file structure
        const filesByPrefix = files.reduce((acc, file) => {
          const parts = file.key.split("/");
          const prefix = parts.length > 1 ? parts[0] : "root";
          if (!acc[prefix]) acc[prefix] = [];
          acc[prefix].push(file.key);
          return acc;
        }, {} as Record<string, string[]>);

        return NextResponse.json({
          success: true,
          analysis: {
            totalFiles: files.length,
            totalDirectories: dirs.length,
            directories: dirs,
            filesByPrefix,
            sampleFiles: files.slice(0, 10).map((f) => ({
              key: f.key,
              size: f.size,
              contentType: f.contentType,
            })),
          },
        });

      default:
        return NextResponse.json(
          {
            success: false,
            error:
              "Unknown operation. Use: connection, list-all, list-directories, analyze-structure",
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Debug operation failed:", error);
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
