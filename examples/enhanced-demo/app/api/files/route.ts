/**
 * File Management API Route
 *
 * Demonstrates usage of the new list files and metadata operations
 * from pushduck with actual S3 implementation
 */

import { NextRequest, NextResponse } from "next/server";
import { storage } from "../../../lib/upload";

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

        const files = await storage.list.files({
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
        const paginatedResult = await storage.list.paginated({
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
        const prefixFiles = await storage.list.files({
          prefix: prefix || `users/${userId}/`,
          maxFiles: 50,
          includeMetadata: true,
        });

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

        const extensionFiles = await storage.list.byExtension(
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
        const sizeFiles = await storage.list.bySize(
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

        const dateFiles = await storage.list.byDate(
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
        const directories = await storage.list.directories(
          prefix || `users/${userId}/`
        );

        return NextResponse.json({
          success: true,
          directories,
          count: directories.length,
        });

      // Paginated generator example (for very large datasets)
      case "list-generator": {
        const generatorFiles = [];
        const generator = await storage.list.paginatedGenerator({
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
      }

      case "directories": {
        const prefix = searchParams.get("prefix") || undefined;
        const directories = await storage.list.directories(prefix);
        return NextResponse.json({ success: true, directories });
      }

      case "get-info":
        const key = searchParams.get("key");
        if (!key) {
          return NextResponse.json(
            { success: false, error: "Key parameter is required" },
            { status: 400 }
          );
        }

        const info = await storage.metadata.getInfo(key);
        return NextResponse.json({ success: true, info });

      case "get-batch-info":
        const keysParam = searchParams.get("keys");
        if (!keysParam) {
          return NextResponse.json(
            { success: false, error: "Keys parameter is required" },
            { status: 400 }
          );
        }

        const keys = keysParam.split(",");
        const results = await storage.metadata.getBatch(keys);
        return NextResponse.json({ success: true, results });

      case "check-exists":
        const keyExists = searchParams.get("key");
        if (!keyExists) {
          return NextResponse.json(
            { success: false, error: "Key parameter is required" },
            { status: 400 }
          );
        }

        const exists = await storage.validation.exists(keyExists);
        return NextResponse.json({ success: true, exists });

      case "validate":
        const keyValidate = searchParams.get("key");
        const maxSizeValidate = searchParams.get("maxSize")
          ? parseInt(searchParams.get("maxSize")!)
          : undefined;
        const allowedTypes = searchParams.get("allowedTypes")?.split(",");

        if (!keyValidate) {
          return NextResponse.json(
            { success: false, error: "Key parameter is required" },
            { status: 400 }
          );
        }

        const validation = await storage.validation.validateFile(keyValidate, {
          maxSize: maxSizeValidate,
          allowedTypes,
        });
        return NextResponse.json({ success: true, validation });

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

        const fileInfo = await storage.metadata.getInfo(key);
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

        const exists = await storage.validation.exists(key);
        const existsWithInfo = await storage.validation.existsWithInfo(key);

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

        const size = await storage.metadata.getSize(key);
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

        const contentType = await storage.metadata.getContentType(key);
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

        const fileMetadata = await storage.metadata.getInfo(key);
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

        await storage.metadata.setCustom(key, metadata);
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

        const filesInfo = await storage.metadata.getBatch(keys);
        return NextResponse.json({
          success: true,
          filesInfo,
          summary: {
            total: keys.length,
            successful: filesInfo.filter((f: any) => f.info !== null).length,
            failed: filesInfo.filter((f: any) => f.info === null).length,
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

        const validationResult = await storage.validation.validateFile(
          key,
          validationRules
        );
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

        const validationResults = await storage.validation.validateFiles(
          keys,
          validationRules
        );
        return NextResponse.json({
          success: true,
          validations: validationResults,
          summary: {
            total: keys.length,
            valid: validationResults.filter((v: any) => v.valid).length,
            invalid: validationResults.filter((v: any) => !v.valid).length,
          },
        });

      // User-specific operations
      case "get-user-stats":
        const userId = body.userId || "demo-user";
        const userPrefix = `users/${userId}/`;

        // Get all user files
        const userFiles = await storage.list.files({
          prefix: userPrefix,
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

// DELETE /api/files - Delete files with various options
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const operation = searchParams.get("operation") || "file";

  try {
    switch (operation) {
      case "file": {
        const key = searchParams.get("key");
        if (!key) {
          return NextResponse.json(
            { success: false, error: "Key parameter is required" },
            { status: 400 }
          );
        }

        await storage.delete.file(key);
        return NextResponse.json({
          success: true,
          message: `File ${key} deleted successfully`,
        });
      }

      case "files": {
        const keysParam = searchParams.get("keys");
        if (!keysParam) {
          return NextResponse.json(
            { success: false, error: "Keys parameter is required" },
            { status: 400 }
          );
        }

        const keys = keysParam.split(",");
        const result = await storage.delete.files(keys);
        return NextResponse.json({
          success: true,
          result,
          message: `Deleted ${result.deleted.length} files, ${result.errors.length} errors`,
        });
      }

      case "by-prefix": {
        const prefix = searchParams.get("prefix");
        const dryRun = searchParams.get("dryRun") === "true";
        const maxFiles = searchParams.get("maxFiles")
          ? parseInt(searchParams.get("maxFiles")!)
          : undefined;

        if (!prefix) {
          return NextResponse.json(
            { success: false, error: "Prefix parameter is required" },
            { status: 400 }
          );
        }

        const result = await storage.delete.byPrefix(prefix, {
          dryRun,
          maxFiles,
        });
        return NextResponse.json({
          success: true,
          result,
          message: dryRun
            ? `Would delete ${result.filesFound} files with prefix ${prefix}`
            : `Deleted ${result.deleted.length} files with prefix ${prefix}, ${result.errors.length} errors`,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown delete operation: ${operation}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Delete API error:", error);
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
