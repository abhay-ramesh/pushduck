"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, Upload } from "lucide-react";
import { useUploadRoute } from "pushduck/client";
import * as React from "react";

export interface UploadDropzoneProps {
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
  /** Custom validation function */
  validator?: (files: File[]) => string | null;
  /** Callback when files are dropped/selected */
  onFilesAdded?: (files: File[]) => void;
  /** Callback when upload completes */
  onUploadComplete?: (results: any[]) => void;
  /** Callback when upload fails */
  onUploadError?: (error: Error) => void;
  /** Custom className */
  className?: string;
  /** Custom content when not dragging */
  children?: React.ReactNode;
  /** Custom content when dragging */
  dragContent?: React.ReactNode;
  /** Disabled state */
  disabled?: boolean;
}

export function UploadDropzone({
  route,
  accept,
  maxSize = 10 * 1024 * 1024, // 10MB default
  maxFiles = 10,
  multiple = true,
  validator,
  onFilesAdded,
  onUploadComplete,
  onUploadError,
  className,
  children,
  dragContent,
  disabled = false,
  ...props
}: UploadDropzoneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { upload, files, isUploading } = useUploadRoute(route, {
    onUploadComplete: (results) => {
      setErrors([]);
      onUploadComplete?.(results);
    },
    onUploadError: (error) => {
      setErrors([error.message]);
      onUploadError?.(error);
    },
  });

  const validateFiles = React.useCallback(
    (fileList: File[]): string[] => {
      const errors: string[] = [];

      // Check file count
      if (!multiple && fileList.length > 1) {
        errors.push("Only one file is allowed");
        return errors;
      }

      if (fileList.length > maxFiles) {
        errors.push(`Maximum ${maxFiles} files allowed`);
        return errors;
      }

      // Validate each file
      fileList.forEach((file, index) => {
        // Size validation
        if (file.size > maxSize) {
          errors.push(
            `File "${file.name}" is too large. Maximum size is ${formatFileSize(
              maxSize
            )}`
          );
        }

        // Type validation
        if (accept) {
          const acceptedTypes = accept.split(",").map((type) => type.trim());
          const isValidType = acceptedTypes.some((type) => {
            if (type.startsWith(".")) {
              return file.name.toLowerCase().endsWith(type.toLowerCase());
            }
            return file.type.match(type.replace("*", ".*"));
          });

          if (!isValidType) {
            errors.push(`File "${file.name}" is not an accepted file type`);
          }
        }
      });

      // Custom validation
      if (validator) {
        const customError = validator(fileList);
        if (customError) {
          errors.push(customError);
        }
      }

      return errors;
    },
    [accept, maxSize, maxFiles, multiple, validator]
  );

  const handleFiles = React.useCallback(
    (fileList: FileList | File[]) => {
      if (disabled || isUploading) return;

      const files = Array.from(fileList);
      const validationErrors = validateFiles(files);

      if (validationErrors.length > 0) {
        setErrors(validationErrors);
        return;
      }

      setErrors([]);
      onFilesAdded?.(files);
      upload(files);
    },
    [disabled, isUploading, validateFiles, onFilesAdded, upload]
  );

  const handleDragOver = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    },
    [disabled, handleFiles]
  );

  const handleFileInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        handleFiles(files);
      }
      // Reset input value to allow selecting the same file again
      e.target.value = "";
    },
    [handleFiles]
  );

  const handleClick = React.useCallback(() => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading]);

  const renderContent = () => {
    if (isDragOver && dragContent) {
      return dragContent;
    }

    if (children) {
      return children;
    }

    // Default content
    return (
      <div className="flex flex-col items-center justify-center space-y-4 text-center">
        <div
          className={cn(
            "rounded-full p-4 transition-colors",
            isDragOver ? "bg-primary/20" : "bg-muted"
          )}
        >
          <Upload
            className={cn(
              "h-8 w-8 transition-colors",
              isDragOver ? "text-primary" : "text-muted-foreground"
            )}
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-medium">
            {isDragOver ? "Drop files here" : "Upload files"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isDragOver
              ? "Release to upload"
              : `Drag and drop files here, or click to select${
                  multiple ? ` (max ${maxFiles})` : ""
                }`}
          </p>
          {accept && (
            <p className="text-xs text-muted-foreground">Accepted: {accept}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Max size: {formatFileSize(maxSize)}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "relative cursor-pointer rounded-lg border-2 border-dashed p-8 transition-all",
          isDragOver && "border-primary bg-primary/5",
          !isDragOver &&
            "border-muted-foreground/25 hover:border-muted-foreground/50",
          disabled && "cursor-not-allowed opacity-50",
          isUploading && "cursor-wait",
          className
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        {...props}
      >
        {renderContent()}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={accept}
          multiple={multiple}
          onChange={handleFileInputChange}
          disabled={disabled || isUploading}
        />
      </div>

      {errors.length > 0 && (
        <div className="space-y-2">
          {errors.map((error, index) => (
            <div
              key={index}
              className="flex items-center space-x-2 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          ))}
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
