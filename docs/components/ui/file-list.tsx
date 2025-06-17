"use client";

import { formatETA, formatUploadSpeed } from "next-s3-uploader";

interface FileListProps {
  files: Array<{
    id: string;
    name: string;
    size: number;
    status: "pending" | "uploading" | "success" | "error";
    progress: number;
    url?: string;
    error?: string;
    uploadSpeed?: number;
    eta?: number;
  }>;
  onRemove?: (fileId: string) => void;
}

export function FileList({ files, onRemove }: FileListProps) {
  if (!files.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium">Upload Progress</h3>
      {files.map((file) => (
        <div key={file.id} className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {file.name}
              </p>
              <p className="text-xs text-gray-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>

            <div className="flex gap-2 items-center">
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  file.status === "success"
                    ? "bg-green-100 text-green-800"
                    : file.status === "error"
                    ? "bg-red-100 text-red-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {file.status === "success" && "✅ Complete"}
                {file.status === "error" && "❌ Error"}
                {file.status === "uploading" && `📤 ${file.progress}%`}
                {file.status === "pending" && "⏳ Pending"}
              </span>

              {onRemove && file.status !== "uploading" && (
                <button
                  onClick={() => onRemove(file.id)}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {(file.status === "uploading" || file.status === "pending") && (
            <div className="mb-2 w-full h-2 bg-gray-200 rounded-full">
              <div
                className="h-2 bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${file.progress}%` }}
              />
            </div>
          )}

          {/* Upload Stats */}
          {file.status === "uploading" && file.uploadSpeed && file.eta && (
            <div className="flex justify-between text-xs text-gray-500">
              <span>{formatUploadSpeed(file.uploadSpeed)}</span>
              <span>ETA: {formatETA(file.eta)}</span>
            </div>
          )}

          {/* Success State */}
          {file.status === "success" && file.url && (
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 underline hover:text-blue-800"
            >
              View uploaded file →
            </a>
          )}

          {/* Error State */}
          {file.status === "error" && file.error && (
            <p className="mt-1 text-sm text-red-600">{file.error}</p>
          )}
        </div>
      ))}
    </div>
  );
}
