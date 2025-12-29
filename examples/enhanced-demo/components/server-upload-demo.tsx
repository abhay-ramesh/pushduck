"use client";

import { useState } from "react";

interface ServerUploadResult {
  success: boolean;
  result?: {
    key: string;
    url: string;
    filename: string;
    size: number;
    contentType: string;
    originalUrl: string;
    uploadedAt: string;
    metadata: Record<string, string>;
  };
  error?: string;
  details?: string;
}

export function ServerUploadDemo() {
  const [url, setUrl] = useState("https://mkdirs.com/og.png?v=20250517");
  const [filename, setFilename] = useState("");
  const [userId, setUserId] = useState("demo-user");
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ServerUploadResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const handleServerUpload = async () => {
    if (!url.trim()) {
      addLog("URL is required");
      return;
    }

    setIsUploading(true);
    setResult(null);
    addLog(`Starting server-side upload for: ${url}`);

    try {
      const response = await fetch("/api/server-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim(),
          filename: filename.trim() || undefined,
          userId: userId.trim(),
        }),
      });

      const data = await response.json();
      setResult(data);

      if (data.success) {
        addLog(`Upload successful! Key: ${data.result.key}`);
        addLog(
          `File: ${data.result.filename} (${formatFileSize(
            data.result.size
          )})`
        );
        addLog(`URL: ${data.result.url}`);
      } else {
        addLog(`Upload failed: ${data.error}`);
        if (data.details) {
          addLog(`Details: ${data.details}`);
        }
      }
    } catch (error) {
      addLog(
        `Network error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const clearLogs = () => {
    setLogs([]);
    setResult(null);
  };

  // Test URLs for quick testing
  const testUrls = [
    "https://mkdirs.com/og.png?v=20250517",
    "https://via.placeholder.com/300x200.png",
    "https://picsum.photos/400/300",
    "https://httpbin.org/image/jpeg",
    "https://httpbin.org/image/png",
  ];

  return (
    <div className="p-6 bg-white rounded-lg border shadow-md">
      <h2 className="mb-4 text-2xl font-semibold text-gray-900">
        Server-Side Upload Demo
      </h2>

      <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="mb-2 text-lg font-medium text-blue-800">
          How it works:
        </h3>
        <ol className="space-y-1 text-sm text-blue-700">
          <li>1. Downloads file from URL using fetch() on server</li>
          <li>2. Creates File object from downloaded data</li>
          <li>3. Uploads to S3 using storage.upload.file()</li>
          <li>4. Returns presigned URL for verification</li>
        </ol>
      </div>

      {/* Input Form */}
      <div className="space-y-4">
        <div>
          <label
            htmlFor="url"
            className="block mb-2 text-sm font-medium text-gray-700"
          >
            Image URL to download and upload:
          </label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Quick Test URLs */}
          <div className="mt-2">
            <p className="text-sm text-gray-600 mb-1">Quick test URLs:</p>
            <div className="flex flex-wrap gap-2">
              {testUrls.map((testUrl, index) => (
                <button
                  key={index}
                  onClick={() => setUrl(testUrl)}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Test {index + 1}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="filename"
              className="block mb-2 text-sm font-medium text-gray-700"
            >
              Custom filename (optional):
            </label>
            <input
              id="filename"
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="my-image.png"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="userId"
              className="block mb-2 text-sm font-medium text-gray-700"
            >
              User ID:
            </label>
            <input
              id="userId"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="demo-user"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleServerUpload}
            disabled={isUploading || !url.trim()}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              isUploading || !url.trim()
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isUploading ? "Uploading..." : "Upload from URL"}
          </button>

          <button
            onClick={clearLogs}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            Clear Logs
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="mt-6 p-4 rounded-lg border">
          {result.success ? (
            <div className="bg-green-50 border-green-200">
              <h3 className="mb-3 text-lg font-medium text-green-800">
                Upload Successful!
              </h3>
              <div className="space-y-2 text-sm text-green-700">
                <div>
                  <strong>Key:</strong> {result.result!.key}
                </div>
                <div>
                  <strong>Filename:</strong> {result.result!.filename}
                </div>
                <div>
                  <strong>Size:</strong> {formatFileSize(result.result!.size)}
                </div>
                <div>
                  <strong>Content Type:</strong> {result.result!.contentType}
                </div>
                <div>
                  <strong>Original URL:</strong> {result.result!.originalUrl}
                </div>
                <div>
                  <strong>Uploaded At:</strong> {result.result!.uploadedAt}
                </div>
                <div className="mt-3">
                  <strong>Preview:</strong>
                  <div className="mt-2">
                    <img
                      src={result.result!.url}
                      alt={result.result!.filename}
                      className="max-w-xs max-h-48 border rounded"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <a
                    href={result.result!.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                  >
                    View File →
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-red-50 border-red-200">
              <h3 className="mb-3 text-lg font-medium text-red-800">
                Upload Failed
              </h3>
              <p className="text-sm text-red-700">
                <strong>Error:</strong> {result.error}
              </p>
              {result.details && (
                <details className="mt-2 text-sm text-red-600">
                  <summary className="cursor-pointer">Show Details</summary>
                  <pre className="mt-2 p-2 bg-red-100 rounded text-xs overflow-x-auto">
                    {result.details}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-lg font-medium text-gray-800">
            Upload Log
          </h3>
          <div className="p-3 bg-gray-900 text-green-400 rounded-lg text-sm font-mono max-h-64 overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index} className="mb-1">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
