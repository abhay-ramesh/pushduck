"use client";

import { upload } from "@/lib/upload-client";
import { Check, Upload, X } from "lucide-react";
import { formatETA, formatUploadSpeed } from "pushduck";
import { useCallback } from "react";

/**
 * Simplified upload demo for homepage
 * Clean, minimal, focused on showing the core value
 */
export function HomepageUploadDemo() {
  const { uploadFiles, files, isUploading, progress, uploadSpeed, eta, reset } =
    upload.imageUpload();

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        uploadFiles(droppedFiles);
      }
    },
    [uploadFiles]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      uploadFiles(selectedFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
  };

  return (
    <div className="w-full">
      {/* Upload Dropzone */}
      <label
        htmlFor="homepage-file-upload"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`group relative block rounded-xl border-2 border-dashed transition-all cursor-pointer ${
          isUploading
            ? "border-primary/50 bg-primary/5 cursor-not-allowed"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        }`}
      >
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          disabled={isUploading}
          className="sr-only"
          id="homepage-file-upload"
        />

        <div className="p-12 text-center pointer-events-none">
          <div
            className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 transition-all ${
              isUploading
                ? "bg-primary/20"
                : "bg-muted group-hover:scale-110 group-hover:bg-primary/10"
            }`}
          >
            <Upload
              className={`w-8 h-8 transition-all ${
                isUploading
                  ? "text-primary animate-pulse"
                  : "text-muted-foreground animate-[bounce_2s_ease-in-out_infinite] group-hover:text-primary"
              }`}
            />
          </div>

          <p className="text-lg font-medium mb-2">
            {isUploading
              ? "Uploading..."
              : "Drop files here or click to browse"}
          </p>

          <p className="text-sm text-muted-foreground">
            {isUploading
              ? `${Math.round(progress || 0)}% complete`
              : "PNG, JPG, GIF up to 5MB each"}
          </p>

          {!isUploading && (
            <p className="text-xs text-amber-400/70 mt-2">
              Demo files are automatically deleted after 24 hours
            </p>
          )}
        </div>

        {/* Overall Progress Bar */}
        {isUploading && (
          <div className="absolute bottom-0 left-0 right-0 h-2 bg-muted/50 rounded-b-xl overflow-hidden pointer-events-none">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300"
              style={{ width: `${progress || 0}%` }}
            />
          </div>
        )}
      </label>

      {/* Upload Stats */}
      {isUploading && (uploadSpeed || eta) && (
        <div className="mt-4 flex items-center justify-between px-4 py-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">Uploading...</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {uploadSpeed && uploadSpeed > 0 && (
              <span>{formatUploadSpeed(uploadSpeed)}</span>
            )}
            {eta && eta > 0 && <span>ETA: {formatETA(eta)}</span>}
          </div>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {files.filter((f) => f.status === "success").length} of{" "}
              {files.length} uploaded
            </span>
            {!isUploading && (
              <button
                onClick={reset}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card"
            >
              {/* Status Icon */}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  file.status === "success"
                    ? "bg-green-100 dark:bg-green-900/20"
                    : file.status === "error"
                      ? "bg-red-100 dark:bg-red-900/20"
                      : "bg-blue-100 dark:bg-blue-900/20"
                }`}
              >
                {file.status === "success" && (
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                )}
                {file.status === "error" && (
                  <X className="w-4 h-4 text-red-600 dark:text-red-400" />
                )}
                {(file.status === "uploading" || file.status === "pending") && (
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin dark:border-blue-400" />
                )}
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  {file.status === "uploading" && (
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      {file.progress}%
                    </span>
                  )}
                </div>
              </div>

              {/* Success Preview */}
              {file.status === "success" && file.url && (
                <div className="flex-shrink-0">
                  <img
                    src={file.presignedUrl || file.url}
                    alt={file.name}
                    className="w-12 h-12 object-cover rounded-md border"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {files.length === 0 && (
        <div className="mt-4 p-4 text-center text-sm text-muted-foreground rounded-lg border border-dashed">
          Click or drag files above to see Pushduck in action
        </div>
      )}
    </div>
  );
}
