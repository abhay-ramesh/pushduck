"use client";

import { useS3UploadRoute } from "next-s3-uploader";
import { useState } from "react";

export function SimpleImageUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { startUpload, files, isUploading, errors, reset } =
    useS3UploadRoute("imageUpload");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      await startUpload([selectedFile]);
      setSelectedFile(null);
      // Reset file input
      const input = document.querySelector(
        'input[type="file"]'
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
      'input[type="file"]'
    ) as HTMLInputElement;
    if (input) input.value = "";
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="mb-4 text-xl font-semibold text-gray-800">
        📸 Image Upload
      </h2>

      {/* File Selection */}
      <div className="mb-4">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
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
          className="px-4 py-2 text-white bg-blue-600 rounded-md transition-colors hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isUploading ? "Uploading..." : "Upload Image"}
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

              {/* Progress Bar */}
              {(file.status === "pending" || file.status === "uploading") && (
                <div className="mb-2">
                  <div className="w-full h-2 bg-gray-200 rounded-full">
                    <div
                      className="h-2 bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>
                      {file.status === "pending"
                        ? "Preparing upload..."
                        : "Uploading to R2..."}
                    </span>
                    <span>{file.progress}%</span>
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
                      className="text-sm text-blue-600 underline hover:text-blue-800"
                    >
                      View uploaded file →
                    </a>
                  )}
                  <p className="text-xs text-green-600 mt-1">
                    ✅ Successfully uploaded to Cloudflare R2
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

export function SimpleDocumentUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { startUpload, files, isUploading, errors, reset } =
    useS3UploadRoute("documentUpload");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      await startUpload([selectedFile]);
      setSelectedFile(null);
      const input = document.querySelector(
        'input[type="file"]'
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
      'input[type="file"]'
    ) as HTMLInputElement;
    if (input) input.value = "";
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="mb-4 text-xl font-semibold text-gray-800">
        📄 Document Upload
      </h2>

      {/* File Selection */}
      <div className="mb-4">
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
        />
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
          className="px-4 py-2 text-white bg-green-600 rounded-md transition-colors hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
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

              {/* Progress Bar */}
              {(file.status === "pending" || file.status === "uploading") && (
                <div className="mb-2">
                  <div className="w-full h-2 bg-gray-200 rounded-full">
                    <div
                      className="h-2 bg-green-600 rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>
                      {file.status === "pending"
                        ? "Preparing upload..."
                        : "Uploading to R2..."}
                    </span>
                    <span>{file.progress}%</span>
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
                      className="text-sm text-green-600 underline hover:text-green-800"
                    >
                      View uploaded file →
                    </a>
                  )}
                  <p className="text-xs text-green-600 mt-1">
                    ✅ Successfully uploaded to Cloudflare R2
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
