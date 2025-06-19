"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle, FileIcon, X, XCircle } from "lucide-react";
import * as React from "react";

export interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "pending" | "uploading" | "success" | "error";
  progress?: number;
  url?: string;
  error?: string;
}

export interface FileListProps {
  /** Array of files to display */
  files: FileItem[];
  /** Whether files can be removed */
  allowRemove?: boolean;
  /** Callback when file is removed */
  onRemove?: (fileId: string) => void;
  /** Callback when file is retried */
  onRetry?: (fileId: string) => void;
  /** Custom className */
  className?: string;
  /** Custom file item renderer */
  renderFile?: (file: FileItem, index: number) => React.ReactNode;
  /** Empty state content */
  emptyContent?: React.ReactNode;
}

export function FileList({
  files,
  allowRemove = true,
  onRemove,
  onRetry,
  className,
  renderFile,
  emptyContent,
  ...props
}: FileListProps) {
  if (files.length === 0) {
    return (
      <div className={cn("text-center py-8", className)} {...props}>
        {emptyContent || (
          <div className="text-muted-foreground">
            <FileIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No files selected</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      {files.map((file, index) =>
        renderFile ? (
          <div key={file.id}>{renderFile(file, index)}</div>
        ) : (
          <FileListItem
            key={file.id}
            file={file}
            allowRemove={allowRemove}
            onRemove={onRemove}
            onRetry={onRetry}
          />
        )
      )}
    </div>
  );
}

interface FileListItemProps {
  file: FileItem;
  allowRemove: boolean;
  onRemove?: (fileId: string) => void;
  onRetry?: (fileId: string) => void;
}

function FileListItem({
  file,
  allowRemove,
  onRemove,
  onRetry,
}: FileListItemProps) {
  const getStatusIcon = () => {
    switch (file.status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "uploading":
        return (
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        );
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    switch (file.status) {
      case "success":
        return "Uploaded";
      case "error":
        return file.error || "Upload failed";
      case "uploading":
        return `Uploading... ${file.progress || 0}%`;
      default:
        return "Pending";
    }
  };

  return (
    <div className="flex items-center space-x-3 p-3 bg-muted/30 rounded-lg border">
      {/* File icon */}
      <div className="flex-shrink-0">
        <FileIcon className="h-8 w-8 text-muted-foreground" />
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium truncate" title={file.name}>
            {file.name}
          </p>
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            {allowRemove && (
              <button
                onClick={() => onRemove?.(file.id)}
                className="p-1 hover:bg-muted rounded"
                title="Remove file"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatFileSize(file.size)}</span>
          <span>{getStatusText()}</span>
        </div>

        {/* Progress bar */}
        {file.status === "uploading" && typeof file.progress === "number" && (
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, file.progress))}%` }}
            />
          </div>
        )}

        {/* Error message */}
        {file.status === "error" && file.error && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-destructive">{file.error}</p>
            {onRetry && (
              <button
                onClick={() => onRetry(file.id)}
                className="text-xs text-primary hover:underline"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Success link */}
        {file.status === "success" && file.url && (
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            View file
          </a>
        )}
      </div>
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
