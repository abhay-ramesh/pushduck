"use client";

import { useEffect, useState } from "react";

// Import the new list and metadata operations from pushduck server
// Note: In a real app, these would be called from API routes, not directly
// This is just for demonstration purposes
interface FileInfo {
  key: string;
  url: string;
  size: number;
  contentType: string;
  lastModified: Date;
  etag: string;
  metadata?: Record<string, string>;
}

interface FileGalleryProps {
  userId?: string;
}

export function FileManagementDemo({ userId = "demo-user" }: FileGalleryProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "images" | "documents">("all");
  const [sortBy, setSortBy] = useState<"name" | "size" | "date">("date");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalSize: 0,
    imageCount: 0,
    documentCount: 0,
  });

  // Simulate API calls to the new list operations
  const fetchFiles = async () => {
    setLoading(true);
    try {
      // Call the actual API route we created
      // First try with no prefix to see all files, then filter if needed
      const response = await fetch(
        `/api/files?operation=list&userId=${userId}&noPrefix=true`,
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        throw new Error(
          `API call failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "API call failed");
      }

      // Use real data from S3
      const realFiles = (data.files || []).map((file: any) => ({
        ...file,
        lastModified: new Date(file.lastModified), // Convert string to Date object
      }));
      setFiles(realFiles);

      // Calculate stats from real data
      const imageFiles = realFiles.filter((f: FileInfo) =>
        f.contentType.startsWith("image/")
      );
      const documentFiles = realFiles.filter(
        (f: FileInfo) =>
          f.contentType === "application/pdf" ||
          f.contentType.includes("document") ||
          f.contentType === "text/plain"
      );

      setStats({
        totalFiles: realFiles.length,
        totalSize: realFiles.reduce(
          (sum: number, file: FileInfo) => sum + file.size,
          0
        ),
        imageCount: imageFiles.length,
        documentCount: documentFiles.length,
      });

      console.log(
        `✅ Loaded ${realFiles.length} files from S3 for user ${userId}`
      );
    } catch (error) {
      console.error("Failed to fetch files from S3:", error);

      // Fall back to mock data if API fails (for demo purposes)
      console.log("📝 Falling back to mock data for demo...");

      // For demo purposes, we'll simulate the data structure
      const mockFiles: FileInfo[] = [
        {
          key: `users/${userId}/avatar.jpg`,
          url: `https://demo-bucket.s3.amazonaws.com/users/${userId}/avatar.jpg`,
          size: 1024000,
          contentType: "image/jpeg",
          lastModified: new Date("2024-01-15T10:00:00Z"),
          etag: "abc123",
          metadata: {
            "user-id": userId,
            "upload-source": "web-app",
            category: "profile",
          },
        },
        {
          key: `users/${userId}/document.pdf`,
          url: `https://demo-bucket.s3.amazonaws.com/users/${userId}/document.pdf`,
          size: 2048000,
          contentType: "application/pdf",
          lastModified: new Date("2024-01-16T10:00:00Z"),
          etag: "def456",
          metadata: {
            "user-id": userId,
            "upload-source": "web-app",
            category: "documents",
          },
        },
        {
          key: `users/${userId}/profile.png`,
          url: `https://demo-bucket.s3.amazonaws.com/users/${userId}/profile.png`,
          size: 512000,
          contentType: "image/png",
          lastModified: new Date("2024-01-17T10:00:00Z"),
          etag: "ghi789",
          metadata: {
            "user-id": userId,
            "upload-source": "mobile-app",
            category: "profile",
          },
        },
        {
          key: `users/${userId}/report.docx`,
          url: `https://demo-bucket.s3.amazonaws.com/users/${userId}/report.docx`,
          size: 3072000,
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          lastModified: new Date("2024-01-18T10:00:00Z"),
          etag: "jkl012",
          metadata: {
            "user-id": userId,
            "upload-source": "web-app",
            category: "work",
          },
        },
      ];

      setFiles(mockFiles);

      // Calculate stats
      const imageFiles = mockFiles.filter((f) =>
        f.contentType.startsWith("image/")
      );
      const documentFiles = mockFiles.filter(
        (f) =>
          f.contentType === "application/pdf" ||
          f.contentType.includes("document") ||
          f.contentType === "text/plain"
      );

      setStats({
        totalFiles: mockFiles.length,
        totalSize: mockFiles.reduce((sum, file) => sum + file.size, 0),
        imageCount: imageFiles.length,
        documentCount: documentFiles.length,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [userId]);

  // Filter and sort files
  const filteredFiles = files
    .filter((file) => {
      if (filter === "all") return true;
      if (filter === "images") return file.contentType.startsWith("image/");
      if (filter === "documents")
        return (
          file.contentType === "application/pdf" ||
          file.contentType.includes("document") ||
          file.contentType === "text/plain"
        );
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.key.localeCompare(b.key);
        case "size":
          return b.size - a.size;
        case "date":
          const aTime =
            a.lastModified instanceof Date ? a.lastModified.getTime() : 0;
          const bTime =
            b.lastModified instanceof Date ? b.lastModified.getTime() : 0;
          return bTime - aTime;
        default:
          return 0;
      }
    });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (date: Date | string) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) {
      return "Invalid Date";
    }
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(dateObj);
  };

  const handleFileSelect = (fileKey: string) => {
    setSelectedFiles((prev) =>
      prev.includes(fileKey)
        ? prev.filter((key) => key !== fileKey)
        : [...prev, fileKey]
    );
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === filteredFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(filteredFiles.map((f) => f.key));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.length === 0) return;

    // In a real app, this would call the delete API:
    // await fetch('/api/files/delete', {
    //   method: 'POST',
    //   body: JSON.stringify({ keys: selectedFiles })
    // });

    console.log("Would delete files:", selectedFiles);
    alert(
      `Would delete ${selectedFiles.length} files in a real implementation`
    );
    setSelectedFiles([]);
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">
            📁 File Management Demo
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Demonstrates list files and metadata operations from pushduck
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchFiles}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>

          <button
            onClick={async () => {
              try {
                const response = await fetch(
                  "/api/debug?operation=analyze-structure"
                );
                const data = await response.json();
                console.log("🔍 Bucket structure analysis:", data);
                alert(
                  `Bucket analysis complete! Check console for details.\n\nFound ${
                    data.analysis?.totalFiles || 0
                  } files in ${
                    data.analysis?.totalDirectories || 0
                  } directories.`
                );
              } catch (error) {
                console.error("Debug failed:", error);
                alert("Debug failed - check console for details");
              }
            }}
            className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
          >
            Debug
          </button>

          <button
            onClick={async () => {
              try {
                const response = await fetch("/api/debug?operation=list-all");
                const data = await response.json();
                console.log("📋 All files in bucket:", data);
                alert(
                  `Found ${
                    data.count || 0
                  } files total. Check console for full list.`
                );
              } catch (error) {
                console.error("List all failed:", error);
                alert("List all failed - check console for details");
              }
            }}
            className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
          >
            List All
          </button>
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="text-2xl font-bold text-blue-800">
            {stats.totalFiles}
          </div>
          <div className="text-sm text-blue-600">Total Files</div>
        </div>
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="text-2xl font-bold text-green-800">
            {formatFileSize(stats.totalSize)}
          </div>
          <div className="text-sm text-green-600">Total Size</div>
        </div>
        <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
          <div className="text-2xl font-bold text-purple-800">
            {stats.imageCount}
          </div>
          <div className="text-sm text-purple-600">Images</div>
        </div>
        <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
          <div className="text-2xl font-bold text-orange-800">
            {stats.documentCount}
          </div>
          <div className="text-sm text-orange-600">Documents</div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Filter:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="all">All Files</option>
              <option value="images">Images Only</option>
              <option value="documents">Documents Only</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Sort by:
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="date">Date Modified</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectAll}
            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            {selectedFiles.length === filteredFiles.length
              ? "Deselect All"
              : "Select All"}
          </button>

          {selectedFiles.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Delete Selected ({selectedFiles.length})
            </button>
          )}
        </div>
      </div>

      {/* API Usage Examples */}
      <div className="mb-6 p-4 bg-gray-900 text-white rounded-lg">
        <h3 className="text-lg font-semibold mb-3">🔧 API Usage Examples</h3>
        <div className="space-y-2 text-sm font-mono">
          <div className="text-gray-300">// List all user files</div>
          <div className="text-green-400">
            const files = await listFilesWithPrefix("users/{userId}/");
          </div>

          <div className="text-gray-300 mt-3">// Filter by file type</div>
          <div className="text-green-400">
            const images = await listFilesByExtension("jpg", "users/{userId}/");
          </div>

          <div className="text-gray-300 mt-3">// Get file metadata</div>
          <div className="text-green-400">
            const info = await getFileInfo("users/{userId}/avatar.jpg");
          </div>

          <div className="text-gray-300 mt-3">// Batch operations</div>
          <div className="text-green-400">
            const results = await getFilesInfo(selectedFileKeys);
          </div>
        </div>
      </div>

      {/* File List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading files...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No files found</p>
          </div>
        ) : (
          filteredFiles.map((file) => (
            <div
              key={file.key}
              className={`p-4 border rounded-lg transition-colors ${
                selectedFiles.includes(file.key)
                  ? "bg-blue-50 border-blue-300"
                  : "bg-white border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedFiles.includes(file.key)}
                    onChange={() => handleFileSelect(file.key)}
                    className="mt-1"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">
                        {file.contentType.startsWith("image/")
                          ? "🖼️"
                          : file.contentType === "application/pdf"
                          ? "📄"
                          : file.contentType.includes("document")
                          ? "📝"
                          : "📄"}
                      </span>
                      <h3 className="font-medium text-gray-900 truncate">
                        {file.key.split("/").pop()}
                      </h3>
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                        {file.contentType}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Size:</span>{" "}
                        {formatFileSize(file.size)}
                      </div>
                      <div>
                        <span className="font-medium">Modified:</span>{" "}
                        {formatDate(file.lastModified)}
                      </div>
                      <div>
                        <span className="font-medium">ETag:</span>{" "}
                        {file.etag.substring(0, 8)}...
                      </div>
                    </div>

                    {file.metadata && Object.keys(file.metadata).length > 0 && (
                      <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                        <div className="font-medium text-gray-700 mb-1">
                          Metadata:
                        </div>
                        <div className="space-y-1">
                          {Object.entries(file.metadata).map(([key, value]) => (
                            <div key={key} className="flex">
                              <span className="font-medium text-gray-600 w-24">
                                {key}:
                              </span>
                              <span className="text-gray-800">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={async () => {
                      try {
                        // Generate presigned URL for viewing
                        const response = await fetch("/api/presigned", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            operation: "get-download-url",
                            key: file.key,
                            expiresIn: 3600, // 1 hour
                          }),
                        });

                        if (response.ok) {
                          const data = await response.json();
                          if (data.success) {
                            // Open the presigned URL in a new tab
                            window.open(data.url, "_blank");
                          } else {
                            throw new Error(data.error);
                          }
                        } else {
                          throw new Error(
                            `API call failed: ${response.status}`
                          );
                        }
                      } catch (error) {
                        console.error(
                          "Failed to generate presigned URL:",
                          error
                        );
                        alert(
                          "Failed to generate secure view URL. This file may be in a private bucket."
                        );
                      }
                    }}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    View
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        // Generate presigned URL for downloading
                        const response = await fetch("/api/presigned", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            operation: "get-download-url",
                            key: file.key,
                            expiresIn: 3600, // 1 hour
                          }),
                        });

                        if (response.ok) {
                          const data = await response.json();
                          if (data.success) {
                            // Create a temporary download link
                            const link = document.createElement("a");
                            link.href = data.url;
                            link.download =
                              file.key.split("/").pop() || "download";
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          } else {
                            throw new Error(data.error);
                          }
                        } else {
                          throw new Error(
                            `API call failed: ${response.status}`
                          );
                        }
                      } catch (error) {
                        console.error(
                          "Failed to generate download URL:",
                          error
                        );
                        alert(
                          "Failed to generate secure download URL. This file may be in a private bucket."
                        );
                      }
                    }}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Download
                  </button>

                  <button
                    onClick={async () => {
                      try {
                        // Call the real getFileInfo API
                        const response = await fetch("/api/files", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            operation: "get-file-info",
                            key: file.key,
                          }),
                        });

                        if (response.ok) {
                          const data = await response.json();
                          if (data.success) {
                            console.log("✅ Real S3 file info:", data.fileInfo);
                            alert(
                              `Real S3 file info retrieved! Check console for details.\n\nSize: ${(
                                data.fileInfo.size / 1024
                              ).toFixed(1)}KB\nType: ${
                                data.fileInfo.contentType
                              }\nModified: ${new Date(
                                data.fileInfo.lastModified
                              ).toLocaleString()}`
                            );
                          } else {
                            throw new Error(data.error);
                          }
                        } else {
                          throw new Error(
                            `API call failed: ${response.status}`
                          );
                        }
                      } catch (error) {
                        console.log("📝 Using demo data - file info:", file);
                        alert(
                          `Demo mode: File info logged to console.\n\nIn a real app with S3 configured, this would call getFileInfo("${file.key}")`
                        );
                      }
                    }}
                    className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    Info
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Developer Notes */}
      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h4 className="font-medium text-yellow-800 mb-2">
          🔧 Implementation Notes
        </h4>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>
            • This demo shows the data structure returned by the new list
            operations
          </li>
          <li>
            • In a real app, you'd call these functions from API routes, not
            directly in components
          </li>
          <li>
            • The metadata operations provide rich file information for building
            file managers
          </li>
          <li>
            • Batch operations like `getFilesInfo()` are efficient for multiple
            files
          </li>
          <li>
            • All operations work with any S3-compatible provider (AWS, R2,
            Spaces, MinIO)
          </li>
        </ul>
      </div>
    </div>
  );
}

// Additional component showing pagination example
export function PaginatedFileList({ userId = "demo-user" }: FileGalleryProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 10;

  const loadPage = async (page: number) => {
    setLoading(true);
    try {
      // Call the actual pagination API
      const response = await fetch(
        `/api/files?operation=list-paginated&userId=${userId}&pageSize=${pageSize}&page=${page}`,
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        throw new Error(
          `API call failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "API call failed");
      }

      // Use real paginated data from S3
      const realFiles = (data.files || []).map((file: any) => ({
        ...file,
        lastModified: new Date(file.lastModified), // Convert string to Date object
      }));
      setFiles(realFiles);
      setHasMore(data.isTruncated || false);

      console.log(
        `✅ Loaded page ${page} with ${realFiles.length} files from S3`
      );
    } catch (error) {
      console.error("Failed to load page from S3:", error);

      // Fall back to mock pagination if API fails
      console.log("📝 Falling back to mock pagination for demo...");

      // Mock pagination
      const allFiles: FileInfo[] = Array.from({ length: 25 }, (_, i) => ({
        key: `users/${userId}/file-${i + 1}.jpg`,
        url: `https://demo-bucket.s3.amazonaws.com/users/${userId}/file-${
          i + 1
        }.jpg`,
        size: Math.floor(Math.random() * 5000000) + 100000,
        contentType: i % 2 === 0 ? "image/jpeg" : "application/pdf",
        lastModified: new Date(
          Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
        ),
        etag: `etag-${i + 1}`,
        metadata: {
          "user-id": userId,
          "file-index": (i + 1).toString(),
        },
      }));

      const startIndex = (page - 1) * pageSize;
      const pageFiles = allFiles.slice(startIndex, startIndex + pageSize);

      setFiles(pageFiles);
      setHasMore(startIndex + pageSize < allFiles.length);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage(currentPage);
  }, [currentPage]);

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        📄 Paginated File List Demo
      </h2>

      <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
        <div className="text-sm text-blue-800">
          <strong>Pagination API Example:</strong>
          <code className="block mt-1 text-xs bg-blue-100 p-2 rounded">
            {`const result = await listFilesPaginated({
  prefix: "users/${userId}/",
  pageSize: ${pageSize},
  continuationToken: "${currentPage > 1 ? "next-page-token" : "undefined"}"
});`}
          </code>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading page {currentPage}...</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.key}
              className="flex items-center justify-between p-3 border rounded"
            >
              <div>
                <div className="font-medium text-gray-900">
                  {file.key.split("/").pop()}
                </div>
                <div className="text-sm text-gray-500">
                  {file.contentType} • {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
              <div className="text-sm text-gray-500">
                {new Date(file.lastModified).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t">
        <div className="text-sm text-gray-600">
          Page {currentPage} • Showing {files.length} files
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1 || loading}
            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage((p) => p + 1)}
            disabled={!hasMore || loading}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
