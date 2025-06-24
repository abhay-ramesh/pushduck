"use client";

import { cn } from "@/lib/utils";
import { Loader2, Upload } from "lucide-react";
import { useUploadRoute } from "pushduck/client";
import * as React from "react";

export interface UploadButtonProps {
  /** Upload route name from your API */
  route: string;
  /** Accepted file types (MIME types or extensions) */
  accept?: string;
  /** Whether to allow multiple files */
  multiple?: boolean;
  /** Custom button text */
  children?: React.ReactNode;
  /** Callback when files are selected */
  onFilesSelected?: (files: File[]) => void;
  /** Callback when upload completes */
  onUploadComplete?: (results: any[]) => void;
  /** Callback when upload fails */
  onUploadError?: (error: Error) => void;
  /** Button variant */
  variant?: "default" | "secondary" | "outline" | "ghost";
  /** Button size */
  size?: "sm" | "md" | "lg";
  /** Custom className */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

export function UploadButton({
  route,
  accept,
  multiple = false,
  children,
  onFilesSelected,
  onUploadComplete,
  onUploadError,
  variant = "default",
  size = "md",
  className,
  disabled = false,
  ...props
}: UploadButtonProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { uploadFiles, isUploading } = useUploadRoute(route, {
    onSuccess: onUploadComplete,
    onError: onUploadError,
  });

  const handleClick = () => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected?.(files);
      uploadFiles(files);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = "";
  };

  const variantClasses = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    outline:
      "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    ghost: "hover:bg-accent hover:text-accent-foreground",
  };

  const sizeClasses = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 py-2",
    lg: "h-11 px-8 text-lg",
  };

  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        onClick={handleClick}
        disabled={disabled || isUploading}
        {...props}
      >
        {isUploading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {children || (isUploading ? "Uploading..." : "Upload Files")}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />
    </>
  );
}
