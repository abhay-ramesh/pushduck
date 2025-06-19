"use client";

import { cn } from "@/lib/utils";
import {
  FileList,
  type FileItem,
} from "@/registry/default/file-list/file-list";
import { UploadButton } from "@/registry/default/upload-button/upload-button";
import { UploadDropzone } from "@/registry/default/upload-dropzone/upload-dropzone";
import * as React from "react";

export interface UploadDemoProps {
  /** Upload route name from your API */
  route: string;
  /** Accepted file types (MIME types or extensions) */
  accept?: string;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Maximum number of files */
  maxFiles?: number;
  /** Whether to allow multiple files */
  multiple?: boolean;
  /** Show upload button alongside dropzone */
  showButton?: boolean;
  /** Custom className */
  className?: string;
  /** Callback when upload completes */
  onUploadComplete?: (results: any[]) => void;
  /** Callback when upload fails */
  onUploadError?: (error: Error) => void;
}

export function UploadDemo({
  route,
  accept,
  maxSize,
  maxFiles,
  multiple = true,
  showButton = true,
  className,
  onUploadComplete,
  onUploadError,
  ...props
}: UploadDemoProps) {
  const [files, setFiles] = React.useState<FileItem[]>([]);

  const handleFilesAdded = React.useCallback((newFiles: File[]) => {
    const fileItems: FileItem[] = newFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      type: file.type,
      status: "pending",
    }));

    setFiles((prev) => [...prev, ...fileItems]);
  }, []);

  const handleUploadProgress = React.useCallback(
    (fileId: string, progress: number) => {
      setFiles((prev) =>
        prev.map((file) =>
          file.id === fileId
            ? { ...file, status: "uploading" as const, progress }
            : file
        )
      );
    },
    []
  );

  const handleUploadComplete = React.useCallback(
    (results: any[]) => {
      // Update file statuses based on results
      setFiles((prev) =>
        prev.map((file) => {
          const result = results.find((r) => r.originalName === file.name);
          return result
            ? {
                ...file,
                status: "success" as const,
                url: result.url,
                progress: 100,
              }
            : file;
        })
      );

      onUploadComplete?.(results);
    },
    [onUploadComplete]
  );

  const handleUploadError = React.useCallback(
    (error: Error) => {
      setFiles((prev) =>
        prev.map((file) =>
          file.status === "uploading" || file.status === "pending"
            ? { ...file, status: "error" as const, error: error.message }
            : file
        )
      );

      onUploadError?.(error);
    },
    [onUploadError]
  );

  const handleRemoveFile = React.useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== fileId));
  }, []);

  const handleRetryFile = React.useCallback((fileId: string) => {
    setFiles((prev) =>
      prev.map((file) =>
        file.id === fileId
          ? {
              ...file,
              status: "pending" as const,
              error: undefined,
              progress: 0,
            }
          : file
      )
    );
  }, []);

  return (
    <div className={cn("space-y-6", className)} {...props}>
      {/* Upload Area */}
      <div className="space-y-4">
        <UploadDropzone
          route={route}
          accept={accept}
          maxSize={maxSize}
          maxFiles={maxFiles}
          multiple={multiple}
          onFilesAdded={handleFilesAdded}
          onUploadComplete={handleUploadComplete}
          onUploadError={handleUploadError}
        />

        {showButton && (
          <div className="flex justify-center">
            <UploadButton
              route={route}
              accept={accept}
              multiple={multiple}
              onFilesSelected={handleFilesAdded}
              onUploadComplete={handleUploadComplete}
              onUploadError={handleUploadError}
              variant="outline"
            >
              Or choose files
            </UploadButton>
          </div>
        )}
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Files</h3>
          <FileList
            files={files}
            allowRemove={true}
            onRemove={handleRemoveFile}
            onRetry={handleRetryFile}
          />
        </div>
      )}

      {/* Summary */}
      {files.length > 0 && (
        <div className="text-sm text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>Total files:</span>
            <span>{files.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Uploaded:</span>
            <span>{files.filter((f) => f.status === "success").length}</span>
          </div>
          <div className="flex justify-between">
            <span>Failed:</span>
            <span>{files.filter((f) => f.status === "error").length}</span>
          </div>
          <div className="flex justify-between">
            <span>Total size:</span>
            <span>
              {formatFileSize(files.reduce((sum, file) => sum + file.size, 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
