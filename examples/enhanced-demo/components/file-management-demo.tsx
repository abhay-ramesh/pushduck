"use client";

import { useCallback, useEffect, useState } from "react";

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

// File type icons
const getFileIcon = (contentType: string, fileName: string) => {
  if (contentType.startsWith("image/")) return "IMG";
  if (contentType === "application/pdf") return "PDF";
  if (contentType.includes("document") || contentType.includes("word"))
    return "DOC";
  if (contentType.includes("spreadsheet") || contentType.includes("excel"))
    return "XLS";
  if (
    contentType.includes("presentation") ||
    contentType.includes("powerpoint")
  )
    return "PPT";
  if (contentType.startsWith("video/")) return "VID";
  if (contentType.startsWith("audio/")) return "AUD";
  if (contentType.includes("zip") || contentType.includes("rar")) return "ZIP";
  if (fileName.endsWith(".txt")) return "TXT";
  if (fileName.endsWith(".json")) return "JSON";
  return "FILE";
};

// File type colors
const getFileTypeColor = (contentType: string) => {
  if (contentType.startsWith("image/")) return "text-blue-600 bg-blue-50";
  if (contentType === "application/pdf") return "text-red-600 bg-red-50";
  if (contentType.includes("document")) return "text-indigo-600 bg-indigo-50";
  if (contentType.includes("spreadsheet")) return "text-green-600 bg-green-50";
  if (contentType.startsWith("video/")) return "text-purple-600 bg-purple-50";
  if (contentType.startsWith("audio/")) return "text-pink-600 bg-pink-50";
  return "text-gray-600 bg-gray-50";
};

export function FileManagementDemo({ userId = "demo-user" }: FileGalleryProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "images" | "documents" | "videos" | "audio"
  >("all");
  const [sortBy, setSortBy] = useState<"name" | "size" | "date">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/files?operation=list&userId=${userId}&noPrefix=true`,
        { method: "GET" }
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

      const realFiles = (data.files || []).map((file: any) => ({
        ...file,
        lastModified: new Date(file.lastModified),
      }));
      setFiles(realFiles);
    } catch (error) {
      console.error("Failed to fetch files:", error);
      // Fallback to empty array for now
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Filter and sort files
  const filteredFiles = files
    .filter((file) => {
      // Search filter
      if (searchQuery) {
        const fileName = file.key.split("/").pop()?.toLowerCase() || "";
        if (!fileName.includes(searchQuery.toLowerCase())) return false;
      }

      // Type filter
      if (filter === "all") return true;
      if (filter === "images") return file.contentType.startsWith("image/");
      if (filter === "documents")
        return (
          file.contentType === "application/pdf" ||
          file.contentType.includes("document")
        );
      if (filter === "videos") return file.contentType.startsWith("video/");
      if (filter === "audio") return file.contentType.startsWith("audio/");
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "name":
          comparison = a.key.localeCompare(b.key);
          break;
        case "size":
          comparison = a.size - b.size;
          break;
        case "date":
          comparison = a.lastModified.getTime() - b.lastModified.getTime();
          break;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const handleFileSelect = (fileKey: string) => {
    setSelectedFiles((prev) =>
      prev.includes(fileKey)
        ? prev.filter((key) => key !== fileKey)
        : [...prev, fileKey]
    );
  };

  const handleSelectAll = () => {
    setSelectedFiles(
      selectedFiles.length === filteredFiles.length
        ? []
        : filteredFiles.map((file) => file.key)
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.length === 0) return;

    const confirmed = confirm(
      `Are you sure you want to delete ${selectedFiles.length} file(s)? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setLoading(true);

      const response = await fetch(
        `/api/files?operation=files&keys=${selectedFiles.join(",")}`,
        { method: "DELETE" }
      );

      const result = await response.json();

      if (result.success) {
        alert(`Successfully deleted ${result.result.deleted.length} file(s).`);
        setSelectedFiles([]);
        await fetchFiles();
      } else {
        throw new Error(result.error || "Delete operation failed");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      alert(
        `Failed to delete files: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSingle = async (fileKey: string, fileName: string) => {
    const confirmed = confirm(
      `Are you sure you want to delete "${fileName}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setLoading(true);

      const response = await fetch(
        `/api/files?operation=file&key=${encodeURIComponent(fileKey)}`,
        { method: "DELETE" }
      );

      const result = await response.json();

      if (result.success) {
        alert(`Successfully deleted "${fileName}"`);
        setSelectedFiles((prev) => prev.filter((key) => key !== fileKey));
        await fetchFiles();
      } else {
        throw new Error(result.error || "Delete operation failed");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      alert(
        `Failed to delete "${fileName}": ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (fileKey: string, fileName: string) => {
    try {
      const response = await fetch("/api/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "get-download-url",
          key: fileKey,
          expiresIn: 3600,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const link = document.createElement("a");
          link.href = data.url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download file");
    }
  };

  const stats = {
    totalFiles: filteredFiles.length,
    totalSize: filteredFiles.reduce((sum, file) => sum + file.size, 0),
    selectedCount: selectedFiles.length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Files</h1>
            <p className="text-sm text-gray-500 mt-1">
              {stats.totalFiles} files • {formatFileSize(stats.totalSize)}
              {stats.selectedCount > 0 && ` • ${stats.selectedCount} selected`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === "list"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === "grid"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Grid
              </button>
            </div>

            {/* Actions */}
            <button
              onClick={fetchFiles}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>

            {selectedFiles.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Delete ({selectedFiles.length})
              </button>
            )}
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4 mt-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg
                  className="h-4 w-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All files</option>
            <option value="images">Images</option>
            <option value="documents">Documents</option>
            <option value="videos">Videos</option>
            <option value="audio">Audio</option>
          </select>

          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split("-");
              setSortBy(sort as any);
              setSortOrder(order as any);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="size-desc">Largest first</option>
            <option value="size-asc">Smallest first</option>
          </select>
        </div>
      </div>

      {/* File List */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading files...</span>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No files found
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery
                ? "Try adjusting your search or filters"
                : "Upload some files to get started"}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Table Header */}
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
              <div className="flex items-center">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={
                      selectedFiles.length === filteredFiles.length &&
                      filteredFiles.length > 0
                    }
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </span>
                </div>
                <div className="flex-1"></div>
                <div className="hidden sm:block text-xs font-medium text-gray-500 uppercase tracking-wider w-20 text-right">
                  Size
                </div>
                <div className="hidden md:block text-xs font-medium text-gray-500 uppercase tracking-wider w-32 text-right ml-6">
                  Modified
                </div>
                <div className="w-24 text-right">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </span>
                </div>
              </div>
            </div>

            {/* File Rows */}
            <div className="divide-y divide-gray-200">
              {filteredFiles.map((file) => {
                const fileName = file.key.split("/").pop() || file.key;
                const isSelected = selectedFiles.includes(file.key);

                return (
                  <div
                    key={file.key}
                    className={`px-6 py-4 hover:bg-gray-50 transition-colors ${
                      isSelected ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-center">
                      <div className="flex items-center flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleFileSelect(file.key)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />

                        <div className="ml-3 flex items-center min-w-0 flex-1">
                          <div className="flex-shrink-0">
                            <span className="text-2xl">
                              {getFileIcon(file.contentType, fileName)}
                            </span>
                          </div>

                          <div className="ml-3 min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {fileName}
                            </p>
                            <div className="flex items-center mt-1">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getFileTypeColor(
                                  file.contentType
                                )}`}
                              >
                                {file.contentType.split("/")[0]}
                              </span>
                              <span className="ml-2 text-xs text-gray-500 sm:hidden">
                                {formatFileSize(file.size)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="hidden sm:block text-sm text-gray-900 w-20 text-right">
                        {formatFileSize(file.size)}
                      </div>

                      <div className="hidden md:block text-sm text-gray-500 w-32 text-right ml-6">
                        {formatDate(file.lastModified)}
                      </div>

                      <div className="flex items-center justify-end w-24 space-x-2">
                        <button
                          onClick={() => handleDownload(file.key, fileName)}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title="Download"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </button>

                        <button
                          onClick={() => handleDeleteSingle(file.key, fileName)}
                          disabled={loading}
                          className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
