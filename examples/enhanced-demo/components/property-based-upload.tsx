"use client";

import { upload } from "@/lib/upload-client";
import { formatETA, formatUploadSpeed } from "pushduck";
import React, { useState } from "react";

export function PropertyBasedImageUpload() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  // Enhanced property-based access with per-route configuration AND overall progress tracking
  const {
    uploadFiles,
    files,
    isUploading,
    errors,
    reset,
    progress,
    uploadSpeed,
    eta,
  } = upload.imageUpload({
    onSuccess: (results) => {
      console.log("✅ Images uploaded successfully!", results);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
    onError: (error) => {
      console.error("❌ Image upload failed:", error);
    },
    onProgress: (progress) => {
      console.log(`📊 Upload progress: ${progress}%`);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList) {
      const filesArray = Array.from(fileList);
      setSelectedFiles(filesArray);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    try {
      // Type-safe upload with automatic route inference
      await uploadFiles(selectedFiles);
      setSelectedFiles([]);
      // Reset file input
      const input = document.querySelector(
        "#property-image-input"
      ) as HTMLInputElement;
      if (input) input.value = "";
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  const handleReset = () => {
    reset();
    setSelectedFiles([]);
    setShowSuccess(false);
    const input = document.querySelector(
      "#property-image-input"
    ) as HTMLInputElement;
    if (input) input.value = "";
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="p-6 bg-white rounded-lg border-2 border-emerald-200 shadow-md">
      <div className="flex gap-2 items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          🚀 Enhanced Property-Based Client
        </h2>
        {showSuccess && (
          <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
            ✅ Upload Successful!
          </span>
        )}
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-2">
          <strong>New Features:</strong> Per-route callbacks, progress tracking,
          and error handling
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
            onSuccess callback
          </span>
          <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">
            onError callback
          </span>
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
            onProgress tracking
          </span>
          <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded">
            Overall Progress Tracking
          </span>
        </div>
      </div>

      <div className="p-3 mb-4 bg-emerald-50 rounded-md border border-emerald-200">
        <h3 className="mb-2 text-sm font-medium text-emerald-800">
          ✨ What&apos;s New:
        </h3>
        <ul className="space-y-1 text-xs text-emerald-700">
          <li>
            •{" "}
            <code className="px-1 bg-emerald-100 rounded">
              upload.imageUpload({`{...}`})
            </code>{" "}
            - Enhanced hook factory with per-route config
          </li>
          <li>• Per-route callbacks: onSuccess, onError, onProgress</li>
          <li>
            • <strong>Overall progress tracking</strong> - progress,
            uploadSpeed, eta across all files
          </li>
          <li>• Full TypeScript inference from server router</li>
          <li>• Zero runtime overhead, compile-time safety</li>
        </ul>
      </div>

      {/* File Selection */}
      <div className="mb-4">
        <input
          id="property-image-input"
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
        />
        <p className="mt-1 text-xs text-gray-500">
          Enhanced property-based upload with per-route configuration & overall
          progress tracking
        </p>
      </div>

      {selectedFiles.length > 0 && (
        <div className="mb-4">
          <h4 className="font-medium text-gray-700 mb-2">Selected Files:</h4>
          <ul className="space-y-2">
            {selectedFiles.map((file, index) => (
              <li
                key={index}
                className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded"
              >
                <span>
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </span>
                <button
                  onClick={() => removeSelectedFile(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button
          onClick={handleUpload}
          disabled={isUploading || selectedFiles.length === 0}
          className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-400"
        >
          {isUploading ? "Uploading..." : "Upload Images"}
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Reset
        </button>
      </div>

      {/* Overall Progress Tracking */}
      {isUploading && files.length > 1 && progress !== undefined && (
        <div className="p-4 mb-4 rounded-md bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <h4 className="text-sm font-medium text-gray-800">
                Overall Progress
              </h4>
            </div>
            <span className="text-lg font-semibold text-emerald-600">
              {Math.round(progress)}%
            </span>
          </div>

          {/* Overall Progress Bar */}
          <div className="w-full h-2 bg-gray-200 rounded-full mb-3">
            <div
              className="h-2 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Overall Stats */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="text-center">
              <div className="text-xs text-gray-500">Transfer Rate</div>
              <div className="font-medium text-emerald-600">
                {uploadSpeed ? formatUploadSpeed(uploadSpeed) : "0 B/s"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Time Remaining</div>
              <div className="font-medium text-blue-600">
                {eta ? formatETA(eta) : "--"}
              </div>
            </div>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
          <h4 className="font-medium text-red-800">Errors:</h4>
          <ul className="text-sm text-red-600">
            {errors.map((error, index) => (
              <li key={index}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Upload Progress */}
      {files.length > 0 && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-gray-700">
              Upload Progress (
              {files.filter((f) => f.status === "success").length}/
              {files.length} completed):
            </h3>
            {files.length > 1 && !isUploading && (
              <div className="text-xs text-gray-500">
                Final:{" "}
                {Math.round(
                  (files.filter((f) => f.status === "success").length /
                    files.length) *
                    100
                )}
                %
              </div>
            )}
          </div>

          {files.map((file) => (
            <div key={file.id} className="p-3 mb-2 rounded-md border">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium truncate">
                  {file.name}
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    file.status === "success"
                      ? "bg-green-100 text-green-800"
                      : file.status === "pending" || file.status === "uploading"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {file.status === "success"
                    ? "✅ Complete"
                    : file.status === "pending"
                    ? "⏳ Preparing..."
                    : file.status === "uploading"
                    ? `📤 ${file.progress}%`
                    : "❌ Error"}
                </span>
              </div>

              {/* Individual Progress Bar with ETA and Speed */}
              {(file.status === "pending" || file.status === "uploading") && (
                <div className="mb-2">
                  <div className="w-full h-2 bg-gray-200 rounded-full">
                    <div
                      className="h-2 bg-emerald-600 rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>
                      {file.status === "pending"
                        ? "Preparing upload..."
                        : "Uploading to R2..."}
                    </span>
                    <div className="flex gap-2">
                      <span>{file.progress}%</span>
                      {file.status === "uploading" && file.uploadSpeed && (
                        <span className="text-emerald-600">
                          {formatUploadSpeed(file.uploadSpeed)}
                        </span>
                      )}
                      {file.status === "uploading" &&
                        file.eta &&
                        file.eta > 0 && (
                          <span className="text-orange-600">
                            ETA: {formatETA(file.eta)}
                          </span>
                        )}
                    </div>
                  </div>
                </div>
              )}

              {/* Success State */}
              {file.status === "success" && (
                <div className="mt-2">
                  {file.url && (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-emerald-600 underline hover:text-emerald-800"
                    >
                      View uploaded file →
                    </a>
                  )}
                  <p className="mt-1 text-xs text-green-600">
                    ✅ Successfully uploaded via enhanced property-based client
                  </p>
                </div>
              )}

              {/* Error State */}
              {file.status === "error" && file.error && (
                <p className="mt-1 text-sm text-red-600">{file.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PropertyBasedDocumentUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Property-based access with full type inference for documents
  const { uploadFiles, files, isUploading, errors, reset } =
    upload.documentUpload();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      // Type-safe upload with automatic route inference
      await uploadFiles([selectedFile]);
      setSelectedFile(null);
      // Reset file input
      const input = document.querySelector(
        "#property-doc-input"
      ) as HTMLInputElement;
      if (input) input.value = "";
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  const handleReset = () => {
    reset();
    setSelectedFile(null);
    const input = document.querySelector(
      "#property-doc-input"
    ) as HTMLInputElement;
    if (input) input.value = "";
  };

  return (
    <div className="p-6 bg-white rounded-lg border-2 border-amber-200 shadow-md">
      <div className="flex gap-2 items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          📄 Property-Based Documents
        </h2>
        <div className="px-2 py-1 text-xs font-medium text-amber-800 bg-amber-100 rounded-full">
          Type-Safe Routes
        </div>
      </div>

      <div className="p-3 mb-4 bg-amber-50 rounded-md border border-amber-200">
        <h3 className="mb-2 text-sm font-medium text-amber-800">
          🔧 Developer Experience:
        </h3>
        <ul className="space-y-1 text-xs text-amber-700">
          <li>
            •{" "}
            <code className="px-1 bg-amber-100 rounded">
              upload.documentUpload()
            </code>{" "}
            - Hook factory function call
          </li>
          <li>• Automatic validation from server route definition</li>
          <li>• IntelliSense shows available routes and methods</li>
          <li>• No more typos in route names!</li>
        </ul>
      </div>

      {/* File Selection */}
      <div className="mb-4">
        <input
          id="property-doc-input"
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
        />
        <p className="mt-1 text-xs text-gray-500">
          Property-based document upload with enhanced types
        </p>
      </div>

      {/* Selected File Info */}
      {selectedFile && (
        <div className="p-3 mb-4 bg-gray-50 rounded-md">
          <p className="text-sm text-gray-600">
            Selected: <span className="font-medium">{selectedFile.name}</span>
          </p>
          <p className="text-xs text-gray-500">
            Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={handleUpload}
          disabled={!selectedFile || isUploading}
          className="px-4 py-2 text-white bg-amber-600 rounded-md transition-colors hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isUploading ? "Uploading..." : "Upload Document"}
        </button>

        {(files.length > 0 || errors.length > 0) && (
          <button
            onClick={handleReset}
            className="px-4 py-2 text-white bg-gray-600 rounded-md transition-colors hover:bg-gray-700"
          >
            Reset
          </button>
        )}
      </div>

      {/* Upload Progress */}
      {files.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-medium text-gray-700">
            Upload Status:
          </h3>
          {files.map((file) => (
            <div key={file.id} className="p-3 mb-2 rounded-md border">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium truncate">
                  {file.name}
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    file.status === "success"
                      ? "bg-green-100 text-green-800"
                      : file.status === "pending" || file.status === "uploading"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {file.status === "success"
                    ? "✅ Complete"
                    : file.status === "pending"
                    ? "⏳ Preparing..."
                    : file.status === "uploading"
                    ? `📤 ${file.progress}%`
                    : "❌ Error"}
                </span>
              </div>

              {/* Progress Bar with ETA and Speed */}
              {(file.status === "pending" || file.status === "uploading") && (
                <div className="mb-2">
                  <div className="w-full h-2 bg-gray-200 rounded-full">
                    <div
                      className="h-2 bg-amber-600 rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>
                      {file.status === "pending"
                        ? "Preparing upload..."
                        : "Uploading to R2..."}
                    </span>
                    <div className="flex gap-2">
                      <span>{file.progress}%</span>
                      {file.status === "uploading" && file.uploadSpeed && (
                        <span className="text-amber-600">
                          {formatUploadSpeed(file.uploadSpeed)}
                        </span>
                      )}
                      {file.status === "uploading" &&
                        file.eta &&
                        file.eta > 0 && (
                          <span className="text-orange-600">
                            ETA: {formatETA(file.eta)}
                          </span>
                        )}
                    </div>
                  </div>
                </div>
              )}

              {/* Success State */}
              {file.status === "success" && (
                <div className="mt-2">
                  {file.url && (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-amber-600 underline hover:text-amber-800"
                    >
                      View uploaded file →
                    </a>
                  )}
                  <p className="mt-1 text-xs text-green-600">
                    ✅ Successfully uploaded via property-based client
                  </p>
                </div>
              )}

              {/* Error State */}
              {file.status === "error" && file.error && (
                <p className="mt-1 text-sm text-red-600">{file.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error Messages */}
      {errors.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-medium text-red-700">Errors:</h3>
          {errors.map((error, index) => (
            <div
              key={index}
              className="p-2 text-sm text-red-700 bg-red-50 rounded border border-red-200"
            >
              {error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
