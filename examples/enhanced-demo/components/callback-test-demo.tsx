"use client";

import { upload } from "@/lib/upload-client";
import { useState } from "react";

export function CallbackTestDemo() {
  const [logs, setLogs] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `${timestamp}: ${message}`]);
    console.log(`${timestamp}: ${message}`);
  };

  const clearLogs = () => {
    setLogs([]);
    setShowSuccess(false);
    setShowError(false);
  };

  // Test Case 1: onProgress callback (Issue #48)
  const {
    uploadFiles: uploadForProgress,
    files: progressFiles,
    isUploading: isUploadingProgress,
    errors: progressErrors,
    reset: resetProgress,
    progress: overallProgress,
    uploadSpeed,
    eta,
  } = upload.imageUpload({
    onProgress: (progress) => {
      addLog(`📊 onProgress called: ${progress}%`);
    },
    onSuccess: (results) => {
      addLog(`✅ onSuccess called with ${results.length} files`);
      setShowSuccess(true);
    },
    onError: (error) => {
      addLog(`❌ onError called: ${error.message}`);
      setShowError(true);
    },
  });

  // Test Case 2: File size limit test (Issue #49)
  const {
    uploadFiles: uploadForSizeLimit,
    files: sizeLimitFiles,
    isUploading: isUploadingSizeLimit,
    errors: sizeLimitErrors,
    reset: resetSizeLimit,
  } = upload.imageUpload({
    onProgress: (progress) => {
      addLog(`📊 Size limit test - onProgress: ${progress}%`);
    },
    onSuccess: (results) => {
      addLog(`✅ Size limit test - onSuccess: ${results.length} files`);
    },
    onError: (error) => {
      addLog(`❌ Size limit test - onError: ${error.message}`);
    },
  });

  const handleProgressTest = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      addLog(`🚀 Starting progress test with ${files.length} files`);
      uploadForProgress(files);
    }
  };

  const handleSizeLimitTest = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      addLog(`🚀 Starting size limit test with ${files.length} files`);
      addLog(
        `📏 Files sizes: ${files
          .map((f) => `${f.name}: ${(f.size / 1024 / 1024).toFixed(2)}MB`)
          .join(", ")}`
      );
      uploadForSizeLimit(files);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">🧪 Callback Testing Demo</h2>
        <p className="text-gray-600">
          Test cases for Issues #48 (onProgress) and #49 (onSuccess/onError)
        </p>
      </div>

      {/* Test Case 1: onProgress */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">
          📊 Test Case 1: onProgress Callback (Issue #48)
        </h3>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleProgressTest}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <button
              onClick={resetProgress}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Reset
            </button>
          </div>

          {overallProgress !== undefined && (
            <div className="bg-gray-100 p-4 rounded-md">
              <div className="text-sm text-gray-600 mb-2">
                Overall Progress:
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {overallProgress}%
                {uploadSpeed &&
                  ` • ${(uploadSpeed / 1024 / 1024).toFixed(2)} MB/s`}
                {eta && ` • ${Math.round(eta)}s remaining`}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">
                Files ({progressFiles.length})
              </h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {progressFiles.map((file) => (
                  <div key={file.id} className="text-sm">
                    <div className="flex justify-between">
                      <span className="truncate">{file.name}</span>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          file.status === "success"
                            ? "bg-green-100 text-green-800"
                            : file.status === "error"
                            ? "bg-red-100 text-red-800"
                            : file.status === "uploading"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {file.status} {file.progress}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Status</h4>
              <div className="text-sm">
                <div>Uploading: {isUploadingProgress ? "Yes" : "No"}</div>
                <div>Errors: {progressErrors.length}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Test Case 2: File Size Limit */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">
          📏 Test Case 2: File Size Limit (Issue #49)
        </h3>
        <div className="bg-yellow-50 p-4 rounded-md mb-4">
          <div className="text-sm text-yellow-800">
            <strong>Test Instructions:</strong> Upload a file larger than 1MB to
            test if onError is called properly. The image upload route has a 1MB
            limit configured.
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleSizeLimitTest}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
            />
            <button
              onClick={resetSizeLimit}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Reset
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">
                Files ({sizeLimitFiles.length})
              </h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {sizeLimitFiles.map((file) => (
                  <div key={file.id} className="text-sm">
                    <div className="flex justify-between">
                      <span className="truncate">{file.name}</span>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          file.status === "success"
                            ? "bg-green-100 text-green-800"
                            : file.status === "error"
                            ? "bg-red-100 text-red-800"
                            : file.status === "uploading"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {file.status} {file.progress}%
                      </span>
                    </div>
                    {file.error && (
                      <div className="text-xs text-red-600 mt-1">
                        {file.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Status</h4>
              <div className="text-sm">
                <div>Uploading: {isUploadingSizeLimit ? "Yes" : "No"}</div>
                <div>Errors: {sizeLimitErrors.length}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Callback Logs */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold">📋 Callback Logs</h3>
          <button
            onClick={clearLogs}
            className="px-3 py-1 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600"
          >
            Clear Logs
          </button>
        </div>
        <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm max-h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-gray-500">No callback logs yet...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="mb-1">
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Status Indicators */}
      <div className="flex gap-4">
        {showSuccess && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-md">
            <span className="text-lg">✅</span>
            <span>Success callback triggered!</span>
          </div>
        )}
        {showError && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-800 rounded-md">
            <span className="text-lg">❌</span>
            <span>Error callback triggered!</span>
          </div>
        )}
      </div>

      {/* Expected Behavior */}
      <div className="mt-6 p-4 bg-blue-50 rounded-md">
        <h4 className="font-medium text-blue-900 mb-2">Expected Behavior:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>
            <strong>Issue #48:</strong> onProgress should be called during
            uploads showing progress percentage
          </li>
          <li>
            <strong>Issue #49:</strong> onError should be called when files
            exceed size limits, onSuccess when uploads complete
          </li>
          <li>
            <strong>Both:</strong> Callbacks should be reliably triggered in all
            scenarios
          </li>
        </ul>
      </div>
    </div>
  );
}
