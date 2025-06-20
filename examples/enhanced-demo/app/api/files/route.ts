/**
 * File Management API Route
 *
 * Demonstrates usage of the new list files and metadata operations
 * from pushduck with actual S3 implementation
 */

import { NextRequest, NextResponse } from "next/server";
import {
  // Basic operations
  checkFileExists,
  fileExistsWithInfo,
  getFileContentType,
  // Metadata operations
  getFileInfo,
  getFileMetadata,
  getFilesInfo,
  getFileSize,
  listDirectories,
  // List operations
  listFiles,
  listFilesByDate,
  listFilesByExtension,
  listFilesBySize,
  listFilesPaginated,
  listFilesPaginatedGenerator,
  listFilesWithPrefix,
  setFileMetadata,
  validateFile,
  validateFiles,
} from "pushduck/server";

// Import the upload configuration to ensure it's initialized
import "../../../lib/upload";

// GET /api/files - List files with various options
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const operation = searchParams.get("operation") || "list";
  const prefix = searchParams.get("prefix") || "";
  const userId = searchParams.get("userId") || "demo-user";
  const extension = searchParams.get("extension");
  const minSize = searchParams.get("minSize");
  const maxSize = searchParams.get("maxSize");
  const page = searchParams.get("page");
  const pageSize = parseInt(searchParams.get("pageSize") || "10");

  try {
    switch (operation) {
      // Basic list operations
      case "list":
        // If no prefix specified, list all files (don't assume users/ structure)
        const listPrefix =
          prefix || (searchParams.get("noPrefix") ? "" : `users/${userId}/`);

        const files = await listFiles({
          prefix: listPrefix,
          maxFiles: 100,
          includeMetadata: true,
          sortBy: "modified",
          sortOrder: "desc",
        });

        return NextResponse.json({
          success: true,
          files,
          count: files.length,
          prefix: listPrefix,
          note: listPrefix
            ? `Files with prefix: ${listPrefix}`
            : "All files in bucket",
        });

      case "list-paginated":
        const paginatedResult = await listFilesPaginated({
          prefix: prefix || `users/${userId}/`,
          pageSize,
          continuationToken: searchParams.get("continuationToken") || undefined,
          includeMetadata: true,
          sortBy: "modified",
          sortOrder: "desc",
        });

        return NextResponse.json({
          success: true,
          ...paginatedResult,
        });

      case "list-with-prefix":
        const prefixFiles = await listFilesWithPrefix(
          prefix || `users/${userId}/`,
          {
            maxFiles: 50,
            includeMetadata: true,
          }
        );

        return NextResponse.json({
          success: true,
          files: prefixFiles,
          count: prefixFiles.length,
        });

      // Filtered list operations
      case "list-by-extension":
        if (!extension) {
          return NextResponse.json(
            { success: false, error: "Extension parameter required" },
            { status: 400 }
          );
        }

        const extensionFiles = await listFilesByExtension(
          extension,
          prefix || `users/${userId}/`
        );

        return NextResponse.json({
          success: true,
          files: extensionFiles,
          count: extensionFiles.length,
          filter: { extension },
        });

      case "list-by-size":
        const sizeFiles = await listFilesBySize(
          minSize ? parseInt(minSize) : undefined,
          maxSize ? parseInt(maxSize) : undefined,
          prefix || `users/${userId}/`
        );

        return NextResponse.json({
          success: true,
          files: sizeFiles,
          count: sizeFiles.length,
          filter: { minSize, maxSize },
        });

      case "list-by-date":
        const fromDate = searchParams.get("fromDate");
        const toDate = searchParams.get("toDate");

        const dateFiles = await listFilesByDate(
          fromDate ? new Date(fromDate) : undefined,
          toDate ? new Date(toDate) : undefined,
          prefix || `users/${userId}/`
        );

        return NextResponse.json({
          success: true,
          files: dateFiles,
          count: dateFiles.length,
          filter: { fromDate, toDate },
        });

      case "list-directories":
        const directories = await listDirectories(prefix || `users/${userId}/`);

        return NextResponse.json({
          success: true,
          directories,
          count: directories.length,
        });

      // Paginated generator example (for very large datasets)
      case "list-generator":
        const generatorFiles = [];
        const generator = listFilesPaginatedGenerator({
          prefix: prefix || `users/${userId}/`,
          pageSize: 10,
        });

        // Collect first 3 pages as example
        let pageCount = 0;
        for await (const batch of generator) {
          generatorFiles.push(...batch);
          pageCount++;
          if (pageCount >= 3) break; // Limit for demo
        }

        return NextResponse.json({
          success: true,
          files: generatorFiles,
          count: generatorFiles.length,
          note: "Generator collected first 3 pages only (demo limit)",
        });

      default:
        return NextResponse.json(
          { success: false, error: "Unknown operation" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("File list operation failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST /api/files - File metadata operations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operation, keys, key, metadata, validationRules } = body;

    switch (operation) {
      // Single file metadata
      case "get-file-info":
        if (!key) {
          return NextResponse.json(
            { success: false, error: "Key parameter required" },
            { status: 400 }
          );
        }

        const fileInfo = await getFileInfo(key);
        return NextResponse.json({
          success: true,
          fileInfo,
        });

      case "file-exists":
        if (!key) {
          return NextResponse.json(
            { success: false, error: "Key parameter required" },
            { status: 400 }
          );
        }

        const exists = await checkFileExists(key);
        const existsWithInfo = await fileExistsWithInfo(key);

        return NextResponse.json({
          success: true,
          exists,
          fileInfo: existsWithInfo,
        });

      case "get-file-size":
        if (!key) {
          return NextResponse.json(
            { success: false, error: "Key parameter required" },
            { status: 400 }
          );
        }

        const size = await getFileSize(key);
        return NextResponse.json({
          success: true,
          size,
          formattedSize: formatFileSize(size),
        });

      case "get-file-content-type":
        if (!key) {
          return NextResponse.json(
            { success: false, error: "Key parameter required" },
            { status: 400 }
          );
        }

        const contentType = await getFileContentType(key);
        return NextResponse.json({
          success: true,
          contentType,
        });

      case "get-file-metadata":
        if (!key) {
          return NextResponse.json(
            { success: false, error: "Key parameter required" },
            { status: 400 }
          );
        }

        const fileMetadata = await getFileMetadata(key);
        return NextResponse.json({
          success: true,
          metadata: fileMetadata,
        });

      case "set-file-metadata":
        if (!key || !metadata) {
          return NextResponse.json(
            { success: false, error: "Key and metadata parameters required" },
            { status: 400 }
          );
        }

        await setFileMetadata(key, metadata);
        return NextResponse.json({
          success: true,
          message: "Metadata updated successfully",
        });

      // Batch operations
      case "get-files-info":
        if (!keys || !Array.isArray(keys)) {
          return NextResponse.json(
            { success: false, error: "Keys array parameter required" },
            { status: 400 }
          );
        }

        const filesInfo = await getFilesInfo(keys);
        return NextResponse.json({
          success: true,
          filesInfo,
          summary: {
            total: keys.length,
            successful: filesInfo.filter((f) => f.info !== null).length,
            failed: filesInfo.filter((f) => f.info === null).length,
          },
        });

      // Validation operations
      case "validate-file":
        if (!key || !validationRules) {
          return NextResponse.json(
            {
              success: false,
              error: "Key and validationRules parameters required",
            },
            { status: 400 }
          );
        }

        const validationResult = await validateFile(key, validationRules);
        return NextResponse.json({
          success: true,
          validation: validationResult,
        });

      case "validate-files":
        if (!keys || !Array.isArray(keys) || !validationRules) {
          return NextResponse.json(
            {
              success: false,
              error: "Keys array and validationRules parameters required",
            },
            { status: 400 }
          );
        }

        const validationResults = await validateFiles(keys, validationRules);
        return NextResponse.json({
          success: true,
          validations: validationResults,
          summary: {
            total: keys.length,
            valid: validationResults.filter((v) => v.valid).length,
            invalid: validationResults.filter((v) => !v.valid).length,
          },
        });

      // User-specific operations
      case "get-user-stats":
        const userId = body.userId || "demo-user";
        const userPrefix = `users/${userId}/`;

        // Get all user files
        const userFiles = await listFilesWithPrefix(userPrefix, {
          maxFiles: 1000,
          includeMetadata: true,
        });

        // Calculate statistics
        const stats = {
          totalFiles: userFiles.length,
          totalSize: userFiles.reduce((sum, file) => sum + file.size, 0),
          fileTypes: {} as Record<string, number>,
          uploadSources: {} as Record<string, number>,
          categories: {} as Record<string, number>,
          averageFileSize: 0,
          largestFile: null as any,
          oldestFile: null as any,
          newestFile: null as any,
        };

        // Process file statistics
        userFiles.forEach((file) => {
          // File types
          const extension =
            file.key.split(".").pop()?.toLowerCase() || "unknown";
          stats.fileTypes[extension] = (stats.fileTypes[extension] || 0) + 1;

          // Metadata analysis
          if (file.metadata) {
            const source = file.metadata["upload-source"] || "unknown";
            const category = file.metadata["category"] || "uncategorized";

            stats.uploadSources[source] =
              (stats.uploadSources[source] || 0) + 1;
            stats.categories[category] = (stats.categories[category] || 0) + 1;
          }
        });

        // Calculate derived stats
        if (userFiles.length > 0) {
          stats.averageFileSize = stats.totalSize / userFiles.length;
          stats.largestFile = userFiles.reduce((largest, file) =>
            file.size > largest.size ? file : largest
          );
          stats.oldestFile = userFiles.reduce((oldest, file) =>
            file.lastModified < oldest.lastModified ? file : oldest
          );
          stats.newestFile = userFiles.reduce((newest, file) =>
            file.lastModified > newest.lastModified ? file : newest
          );
        }

        return NextResponse.json({
          success: true,
          userId,
          stats: {
            ...stats,
            formattedTotalSize: formatFileSize(stats.totalSize),
            formattedAverageSize: formatFileSize(stats.averageFileSize),
          },
        });

      default:
        return NextResponse.json(
          { success: false, error: "Unknown operation" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("File metadata operation failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Helper function to format file sizes
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
