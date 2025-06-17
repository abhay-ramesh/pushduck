"use client";

import {
  formatETA,
  formatUploadSpeed,
  useUploadRoute,
} from "next-s3-uploader/client";
import { useState } from "react";
import type { AppS3Router } from "../app/api/s3-upload/route";

export function SimpleImageUpload() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const { uploadFiles, files, isUploading, errors, reset } =
    useUploadRoute<AppS3Router>("imageUpload");

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
      await uploadFiles(selectedFiles);
      setSelectedFiles([]);
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
    setSelectedFiles([]);
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    if (input) input.value = "";
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="mb-4 text-xl font-semibold text-gray-800">
        📸 Multiple Image Upload
      </h2>

      {/* File Selection */}
      <div className="mb-4">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <p className="mt-1 text-xs text-gray-500">
          Select multiple images to upload simultaneously
        </p>
      </div>

      {/* Selected Files Info */}
      {selectedFiles.length > 0 && (
        <div className="p-3 mb-4 bg-gray-50 rounded-md">
          <h3 className="mb-2 text-sm font-medium text-gray-700">
            Selected Files ({selectedFiles.length}):
          </h3>
          <div className="space-y-2">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex justify-between items-center p-2 bg-white rounded border"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type}
                  </p>
                </div>
                <button
                  onClick={() => removeSelectedFile(index)}
                  className="ml-2 text-sm text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Total size:{" "}
            {(
              selectedFiles.reduce((sum, file) => sum + file.size, 0) /
              1024 /
              1024
            ).toFixed(2)}{" "}
            MB
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={handleUpload}
          disabled={selectedFiles.length === 0 || isUploading}
          className="px-4 py-2 text-white bg-blue-600 rounded-md transition-colors hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isUploading
            ? `Uploading ${
                files.filter((f) => f.status === "uploading").length
              }/${files.length}...`
            : `Upload ${selectedFiles.length} Image${
                selectedFiles.length !== 1 ? "s" : ""
              }`}
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
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-gray-700">
              Upload Progress (
              {files.filter((f) => f.status === "success").length}/
              {files.length} completed):
            </h3>
            {files.length > 1 && (
              <div className="flex gap-3 text-xs text-gray-500">
                <span>
                  Overall:{" "}
                  {Math.round(
                    (files.filter((f) => f.status === "success").length /
                      files.length) *
                      100
                  )}
                  %
                </span>
                {(() => {
                  const uploadingFiles = files.filter(
                    (f) => f.status === "uploading" && f.eta && f.eta > 0
                  );
                  if (uploadingFiles.length > 0) {
                    const totalETA = Math.max(
                      ...uploadingFiles.map((f) => f.eta || 0)
                    );
                    return (
                      <span className="text-orange-600">
                        ETA: {formatETA(totalETA)}
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>

          {/* Overall Progress Bar for Multiple Files */}
          {files.length > 1 && (
            <div className="mb-3">
              <div className="w-full h-2 bg-gray-200 rounded-full">
                <div
                  className="h-2 bg-green-600 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      (files.filter((f) => f.status === "success").length /
                        files.length) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

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

              {/* Individual Progress Bar */}
              {(file.status === "pending" || file.status === "uploading") && (
                <div className="mb-2">
                  <div className="w-full h-2 bg-gray-200 rounded-full">
                    <div
                      className="h-2 bg-blue-600 rounded-full transition-all duration-300"
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
                        <span className="text-blue-600">
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
                      className="text-sm text-blue-600 underline hover:text-blue-800"
                    >
                      View uploaded file →
                    </a>
                  )}
                  <p className="mt-1 text-xs text-green-600">
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

  const { uploadFiles, files, isUploading, errors, reset } =
    useUploadRoute("documentUpload");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      await uploadFiles([selectedFile]);
      setSelectedFile(null);
      // Reset file input
      const input = document.querySelector(
        'input[type="file"][accept*="pdf"]'
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
      'input[type="file"][accept*="pdf"]'
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
        <p className="mt-1 text-xs text-gray-500">
          Single document upload (PDF, DOC, DOCX, TXT)
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
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>
                      {file.status === "pending"
                        ? "Preparing upload..."
                        : "Uploading to R2..."}
                    </span>
                    <div className="flex gap-2">
                      <span>{file.progress}%</span>
                      {file.status === "uploading" && file.uploadSpeed && (
                        <span className="text-green-600">
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
                      className="text-sm text-green-600 underline hover:text-green-800"
                    >
                      View uploaded file →
                    </a>
                  )}
                  <p className="mt-1 text-xs text-green-600">
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

// Single Image Upload Component (for comparison)
export function SingleImageUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { uploadFiles, files, isUploading, errors, reset } =
    useUploadRoute("imageUpload");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      await uploadFiles([selectedFile]);
      setSelectedFile(null);
      // Reset file input
      const input = document.querySelector(
        'input[type="file"][accept="image/*"]:not([multiple])'
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
      'input[type="file"][accept="image/*"]:not([multiple])'
    ) as HTMLInputElement;
    if (input) input.value = "";
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="mb-4 text-xl font-semibold text-gray-800">
        🖼️ Single Image Upload
      </h2>

      {/* File Selection */}
      <div className="mb-4">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
        />
        <p className="mt-1 text-xs text-gray-500">
          Single image upload for comparison
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
          className="px-4 py-2 text-white bg-purple-600 rounded-md transition-colors hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
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
                      className="h-2 bg-purple-600 rounded-full transition-all duration-300"
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
                        <span className="text-purple-600">
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
                      className="text-sm text-purple-600 underline hover:text-purple-800"
                    >
                      View uploaded file →
                    </a>
                  )}
                  <p className="mt-1 text-xs text-green-600">
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
