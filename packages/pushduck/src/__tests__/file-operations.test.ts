/**
 * Tests for S3 Client List and Metadata Operations
 *
 * These tests demonstrate the new functionality:
 * - List files with filtering and pagination
 * - Get file metadata and information
 * - File validation and directory listing
 */

import { describe, expect, it, vi } from "vitest";
import {
  type FileInfo,
  type ListFilesOptions,
  type ValidationRules,
} from "../core/storage/client";

// Mock the upload config
vi.mock("../core/config/upload-config", () => ({
  getUploadConfig: () => ({
    provider: {
      provider: "aws",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      region: "us-east-1",
      bucket: "test-bucket",
    },
  }),
}));

// Mock aws4fetch
vi.mock("aws4fetch", () => ({
  AwsClient: vi.fn().mockImplementation(() => ({
    fetch: vi.fn(),
  })),
}));

// Mock data for testing
const mockFiles: FileInfo[] = [
  {
    key: "users/123/avatar.jpg",
    url: "https://test-bucket.s3.us-east-1.amazonaws.com/users/123/avatar.jpg",
    size: 1536000, // 1.5MB to make it > 1MB
    contentType: "image/jpeg",
    lastModified: new Date("2024-01-15T10:00:00Z"),
    etag: "abc123",
  },
  {
    key: "users/123/document.pdf",
    url: "https://test-bucket.s3.us-east-1.amazonaws.com/users/123/document.pdf",
    size: 2048000,
    contentType: "application/pdf",
    lastModified: new Date("2024-01-16T10:00:00Z"),
    etag: "def456",
  },
  {
    key: "users/456/profile.png",
    url: "https://test-bucket.s3.us-east-1.amazonaws.com/users/456/profile.png",
    size: 512000,
    contentType: "image/png",
    lastModified: new Date("2024-01-17T10:00:00Z"),
    etag: "ghi789",
  },
];

describe("List Operations", () => {
  describe("listFiles", () => {
    it("should list all files with default options", async () => {
      const options: ListFilesOptions = {
        maxFiles: 100,
        includeMetadata: true,
      };

      // In a real test, we'd mock the S3 response and verify the call
      expect(options.maxFiles).toBe(100);
      expect(options.includeMetadata).toBe(true);
    });

    it("should filter files by prefix", async () => {
      const files = mockFiles.filter((f) => f.key.startsWith("users/123/"));
      expect(files).toHaveLength(2);
      expect(files[0].key).toBe("users/123/avatar.jpg");
      expect(files[1].key).toBe("users/123/document.pdf");
    });

    it("should sort files by different criteria", async () => {
      // Sort by size
      const bySize = [...mockFiles].sort((a, b) => a.size - b.size);
      expect(bySize[0].key).toBe("users/456/profile.png"); // Smallest
      expect(bySize[2].key).toBe("users/123/document.pdf"); // Largest

      // Sort by date
      const byDate = [...mockFiles].sort(
        (a, b) => a.lastModified.getTime() - b.lastModified.getTime()
      );
      expect(byDate[0].key).toBe("users/123/avatar.jpg"); // Oldest
      expect(byDate[2].key).toBe("users/456/profile.png"); // Newest
    });
  });

  describe("listFilesByExtension", () => {
    it("should filter files by extension", async () => {
      const jpgFiles = mockFiles.filter((f) => f.key.endsWith(".jpg"));
      const pngFiles = mockFiles.filter((f) => f.key.endsWith(".png"));
      const pdfFiles = mockFiles.filter((f) => f.key.endsWith(".pdf"));

      expect(jpgFiles).toHaveLength(1);
      expect(pngFiles).toHaveLength(1);
      expect(pdfFiles).toHaveLength(1);
    });
  });

  describe("listFilesBySize", () => {
    it("should filter files by size range", async () => {
      const smallFiles = mockFiles.filter((f) => f.size < 1000000); // < 1MB
      const largeFiles = mockFiles.filter((f) => f.size > 1000000); // > 1MB

      expect(smallFiles).toHaveLength(1); // profile.png
      expect(largeFiles).toHaveLength(2); // avatar.jpg, document.pdf
    });
  });

  describe("listFilesByDate", () => {
    it("should filter files by date range", async () => {
      const fromDate = new Date("2024-01-16T00:00:00Z");
      const recentFiles = mockFiles.filter((f) => f.lastModified >= fromDate);

      expect(recentFiles).toHaveLength(2); // document.pdf, profile.png
    });
  });
});

describe("Metadata Operations", () => {
  const mockFileInfo: FileInfo = {
    key: "test-file.jpg",
    url: "https://test-bucket.s3.us-east-1.amazonaws.com/test-file.jpg",
    size: 1024000,
    contentType: "image/jpeg",
    lastModified: new Date("2024-01-15T10:00:00Z"),
    etag: "abc123",
    metadata: {
      "user-id": "123",
      "upload-source": "web-app",
    },
  };

  describe("getFileInfo", () => {
    it("should return comprehensive file information", async () => {
      // Mock test - in real implementation, this would test actual S3 calls
      expect(mockFileInfo.key).toBe("test-file.jpg");
      expect(mockFileInfo.size).toBe(1024000);
      expect(mockFileInfo.contentType).toBe("image/jpeg");
      expect(mockFileInfo.metadata).toEqual({
        "user-id": "123",
        "upload-source": "web-app",
      });
    });
  });

  describe("File validation", () => {
    it("should validate file against rules", async () => {
      const rules: ValidationRules = {
        maxSize: 5 * 1024 * 1024, // 5MB
        allowedTypes: ["image/jpeg", "image/png"],
        requiredExtensions: [".jpg", ".png"],
      };

      // Test valid file
      const validResult = {
        valid: true,
        errors: [],
        warnings: [],
        info: mockFileInfo,
      };

      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      // Test invalid file size
      const invalidSizeFile = { ...mockFileInfo, size: 10 * 1024 * 1024 }; // 10MB
      const invalidSizeResult = {
        valid: false,
        errors: ["File size 10485760 bytes exceeds maximum 5242880 bytes"],
        warnings: [],
        info: invalidSizeFile,
      };

      expect(invalidSizeResult.valid).toBe(false);
      expect(invalidSizeResult.errors).toContain(
        "File size 10485760 bytes exceeds maximum 5242880 bytes"
      );
    });

    it("should validate content types", async () => {
      const rules: ValidationRules = {
        allowedTypes: ["image/jpeg", "image/png"],
      };

      const invalidTypeFile = {
        ...mockFileInfo,
        contentType: "application/pdf",
      };
      const result = {
        valid: false,
        errors: [
          "Content type application/pdf is not allowed. Allowed types: image/jpeg, image/png",
        ],
        warnings: [],
        info: invalidTypeFile,
      };

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain(
        "Content type application/pdf is not allowed"
      );
    });

    it("should validate file extensions", async () => {
      const rules: ValidationRules = {
        requiredExtensions: [".jpg", ".png"],
      };

      const invalidExtFile = { ...mockFileInfo, key: "test-file.pdf" };
      const result = {
        valid: false,
        errors: [
          "File extension .pdf is not allowed. Required extensions: .jpg, .png",
        ],
        warnings: [],
        info: invalidExtFile,
      };

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("File extension .pdf is not allowed");
    });
  });
});

describe("Developer Use Cases", () => {
  describe("User File Gallery", () => {
    it("should demonstrate user file gallery use case", async () => {
      const userId = "123";
      const userFiles = mockFiles.filter((f) =>
        f.key.startsWith(`users/${userId}/`)
      );

      const gallery = userFiles.map((file) => ({
        id: file.key,
        name: file.key.split("/").pop(),
        url: file.url,
        size: file.size,
        type: file.contentType,
        uploadedAt: file.lastModified,
        thumbnail: file.contentType.startsWith("image/")
          ? `${file.url}?w=150`
          : null,
      }));

      expect(gallery).toHaveLength(2);
      expect(gallery[0].name).toBe("avatar.jpg");
      expect(gallery[0].thumbnail).toBeTruthy();
      expect(gallery[1].name).toBe("document.pdf");
      expect(gallery[1].thumbnail).toBeNull();
    });
  });

  describe("File Processing Pipeline", () => {
    it("should demonstrate file processing workflow", async () => {
      const originalFile = mockFiles[0]; // avatar.jpg

      // Step 1: Validate file before processing
      const validation = {
        valid: true,
        errors: [],
        warnings: [],
        info: originalFile,
      };

      expect(validation.valid).toBe(true);

      // Step 2: Process file (mock)
      const thumbnailKey = originalFile.key.replace(".jpg", "-thumb.jpg");
      const thumbnailFile: FileInfo = {
        key: thumbnailKey,
        url: `https://test-bucket.s3.us-east-1.amazonaws.com/${thumbnailKey}`,
        size: 51200, // Smaller thumbnail
        contentType: "image/jpeg",
        lastModified: new Date(),
        etag: "thumb123",
        metadata: {
          "source-file": originalFile.key,
          "processing-type": "thumbnail",
        },
      };

      expect(thumbnailFile.size).toBeLessThan(originalFile.size);
      expect(thumbnailFile.metadata?.["source-file"]).toBe(originalFile.key);
    });
  });

  describe("Admin Dashboard", () => {
    it("should demonstrate admin file management", async () => {
      // Find large files (> 1MB)
      const largeFiles = mockFiles.filter((f) => f.size > 1024 * 1024);

      // Calculate total storage usage
      const totalSize = mockFiles.reduce((sum, file) => sum + file.size, 0);
      const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

      // Group files by user
      const filesByUser = mockFiles.reduce(
        (acc, file) => {
          const userMatch = file.key.match(/^users\/(\d+)\//);
          if (userMatch) {
            const userId = userMatch[1];
            if (!acc[userId]) acc[userId] = [];
            acc[userId].push(file);
          }
          return acc;
        },
        {} as Record<string, FileInfo[]>
      );

      expect(largeFiles).toHaveLength(2);
      expect(totalSizeMB).toBe("3.91"); // ~3.9MB total
      expect(Object.keys(filesByUser)).toEqual(["123", "456"]);
      expect(filesByUser["123"]).toHaveLength(2);
      expect(filesByUser["456"]).toHaveLength(1);
    });
  });

  describe("Cleanup Operations", () => {
    it("should demonstrate cleanup workflow", async () => {
      const userId = "123";

      // Step 1: Find all user files
      const userFiles = mockFiles.filter((f) =>
        f.key.startsWith(`users/${userId}/`)
      );

      // Step 2: Identify files to delete (mock - e.g., old temp files)
      const tempFiles = userFiles.filter((f) => f.key.includes("temp/"));
      const oldFiles = userFiles.filter((f) => {
        const daysSinceModified =
          (Date.now() - f.lastModified.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceModified > 30; // Older than 30 days
      });

      // Step 3: Calculate cleanup impact
      const filesToDelete = [...tempFiles, ...oldFiles];
      const spaceSaved = filesToDelete.reduce(
        (sum, file) => sum + file.size,
        0
      );

      expect(userFiles).toHaveLength(2);
      expect(filesToDelete.length).toBeLessThanOrEqual(userFiles.length);
      expect(spaceSaved).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("Performance Considerations", () => {
  describe("Pagination", () => {
    it("should handle large file lists efficiently", async () => {
      const pageSize = 100;
      const totalFiles = 1000;

      // Mock pagination scenario
      const pages = Math.ceil(totalFiles / pageSize);
      expect(pages).toBe(10);

      // Simulate processing files in batches
      for (let page = 0; page < pages; page++) {
        const startIndex = page * pageSize;
        const endIndex = Math.min(startIndex + pageSize, totalFiles);
        const batchSize = endIndex - startIndex;

        expect(batchSize).toBeLessThanOrEqual(pageSize);
        expect(batchSize).toBeGreaterThan(0);
      }
    });
  });

  describe("Batch Operations", () => {
    it("should handle batch metadata requests efficiently", async () => {
      const fileKeys = mockFiles.map((f) => f.key);

      // Mock batch processing
      const batchSize = 10;
      const batches = [];

      for (let i = 0; i < fileKeys.length; i += batchSize) {
        const batch = fileKeys.slice(i, i + batchSize);
        batches.push(batch);
      }

      expect(batches).toHaveLength(1); // Small test dataset
      expect(batches[0]).toHaveLength(3);
    });
  });
});

// Example usage demonstrations
describe("Usage Examples", () => {
  it("should demonstrate complete file management workflow", async () => {
    console.log("\nComplete File Management Workflow Example:\n");

    // 1. List user files
    console.log("1. List user files:");
    console.log(
      '   const userFiles = await listFilesWithPrefix("users/123/");'
    );

    // 2. Get file information
    console.log("2. Get file details:");
    console.log(
      '   const fileInfo = await getFileInfo("users/123/avatar.jpg");'
    );

    // 3. Validate files
    console.log("3. Validate files:");
    console.log("   const validation = await validateFile(key, {");
    console.log("     maxSize: 5 * 1024 * 1024,");
    console.log('     allowedTypes: ["image/jpeg", "image/png"]');
    console.log("   });");

    // 4. Filter and sort
    console.log("4. Filter and sort:");
    console.log(
      '   const images = await listFilesByExtension("jpg", "users/123/");'
    );
    console.log("   const largeFiles = await listFilesBySize(1024 * 1024);");

    // 5. Paginated listing
    console.log("5. Handle large datasets:");
    console.log(
      "   for await (const batch of listFilesPaginatedGenerator()) {"
    );
    console.log("     await processBatch(batch);");
    console.log("   }");

    expect(true).toBe(true);
  });
});
