"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, Image as ImageIcon, Upload, X } from "lucide-react";
import { usePasteUpload } from "pushduck/client";
import * as React from "react";

export interface UploadPasteProps {
  /** Upload route name from your API */
  route: string;
  /** Accepted file types (MIME types or extensions) */
  accept?: string;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Maximum number of files */
  maxFiles?: number;
  /** Upload mode - 'immediate' (upload immediately on paste) or 'preview' (show preview, manual upload) */
  mode?: "immediate" | "preview";
  /** Boolean alias for mode (true = 'immediate', false = 'preview') */
  autoUpload?: boolean;
  /** Paste detection scope - 'document' (anywhere on page) or 'container' (within this component) */
  scope?: "document" | "container";
  /** Allow paste detection when user is in input/textarea (default: true) */
  allowInputPaste?: boolean;
  /** Show previews (only relevant in preview mode, default: true) */
  showPreviews?: boolean;
  /** Number of columns in preview grid */
  previewGridCols?: number;
  /** Callback when files are pasted */
  onPaste?: (files: File[]) => void;
  /** Callback when upload completes */
  onUploadComplete?: (results: any[]) => void;
  /** Callback when upload fails */
  onUploadError?: (error: Error) => void;
  /** Callback when upload starts (only in immediate mode) */
  onUploadStart?: () => void;
  /** Custom validation function */
  validator?: (files: File[]) => string | null;
  /** Custom className */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Custom content when no previews */
  children?: React.ReactNode;
}

export function UploadPaste({
  route,
  accept = "image/*",
  maxSize = 10 * 1024 * 1024, // 10MB default
  maxFiles = 10,
  mode: modeProp,
  autoUpload,
  scope = "container",
  allowInputPaste = true,
  showPreviews = true,
  previewGridCols = 3,
  onPaste,
  onUploadComplete,
  onUploadError,
  onUploadStart,
  validator,
  className,
  disabled = false,
  children,
  ...props
}: UploadPasteProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [errors, setErrors] = React.useState<string[]>([]);

  const {
    previewFiles,
    uploadPastedFiles,
    clearPreviews,
    files,
    isUploading,
    progress,
    errors: uploadErrors,
  } = usePasteUpload(route, {
    route,
    accept,
    maxSize,
    maxFiles,
    mode: modeProp,
    autoUpload,
    scope,
    containerRef: scope === "container" ? containerRef : undefined,
    allowInputPaste,
    validator,
    onPaste: (files) => {
      setErrors([]);
      onPaste?.(files);
    },
    onUploadComplete: (results) => {
      setErrors([]);
      onUploadComplete?.(results);
    },
    onUploadError: (error) => {
      setErrors([error.message]);
      onUploadError?.(error);
    },
    onUploadStart,
    enabled: !disabled,
  });

  // Combine errors
  const allErrors = React.useMemo(
    () => [...errors, ...uploadErrors],
    [errors, uploadErrors]
  );

  // Remove preview
  const handleRemovePreview = React.useCallback(
    (id: string) => {
      setPreviewFiles((prev) => {
        const file = prev.find((f) => f.id === id);
        if (file) {
          URL.revokeObjectURL(file.preview);
        }
        return prev.filter((f) => f.id !== id);
      });
    },
    []
  );

  // Determine if we should show previews
  const shouldShowPreviews =
    modeProp === "preview" ||
    (autoUpload === false) ||
    (modeProp === undefined && autoUpload === undefined);

  const displayPreviews = shouldShowPreviews && showPreviews;

  return (
    <div className={cn("space-y-4", className)} {...props}>
      <div
        ref={containerRef}
        className={cn(
          "relative rounded-lg border-2 border-dashed p-8 transition-all",
          scope === "document"
            ? "border-transparent p-0"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          disabled && "cursor-not-allowed opacity-50",
          isUploading && "cursor-wait"
        )}
      >
        {displayPreviews && previewFiles.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Pasted Images</h3>
              <div className="flex gap-2">
                <button
                  onClick={uploadPastedFiles}
                  disabled={disabled || isUploading}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  <Upload className="h-4 w-4" />
                  Upload {previewFiles.length} file
                  {previewFiles.length !== 1 ? "s" : ""}
                </button>
                <button
                  onClick={clearPreviews}
                  disabled={disabled || isUploading}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    "bg-muted text-muted-foreground hover:bg-muted/80",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  Clear
                </button>
              </div>
            </div>

            <div
              className={cn(
                "grid gap-4",
                previewGridCols === 1 && "grid-cols-1",
                previewGridCols === 2 && "grid-cols-1 md:grid-cols-2",
                previewGridCols === 3 && "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
                previewGridCols === 4 && "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
                previewGridCols === 5 && "grid-cols-1 md:grid-cols-3 lg:grid-cols-5",
                previewGridCols === 6 && "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
              )}
            >
              {previewFiles.map((preview) => (
                <div
                  key={preview.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {preview.type.startsWith("image/") ? (
                    <img
                      src={preview.preview}
                      alt={preview.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                  <button
                    onClick={() => handleRemovePreview(preview.id)}
                    disabled={disabled || isUploading}
                    className={cn(
                      "absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="truncate text-xs font-medium text-white">
                      {preview.name}
                    </p>
                    <p className="text-xs text-white/80">
                      {formatFileSize(preview.size)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!displayPreviews && previewFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            {children || (
              <>
                <div className="rounded-full bg-muted p-4">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-medium">Paste to upload</h3>
                  <p className="text-sm text-muted-foreground">
                    {scope === "document"
                      ? "Paste images anywhere on the page"
                      : "Paste images in this area"}
                  </p>
                  {accept && (
                    <p className="text-xs text-muted-foreground">
                      Accepted: {accept}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Max size: {formatFileSize(maxSize)}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Upload progress */}
        {isUploading && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Uploading...</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Uploaded files display */}
        {files.length > 0 && files.some((f) => f.status === "success") && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium">Uploaded</h4>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
              {files
                .filter((f) => f.status === "success" && f.url)
                .map((file) => (
                  <div
                    key={file.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                  >
                    {file.type?.startsWith("image/") && file.url && (
                      <img
                        src={file.url}
                        alt={file.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="truncate text-xs font-medium text-white">
                        {file.name}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {allErrors.length > 0 && (
        <div className="space-y-2">
          {allErrors.map((error, index) => (
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


