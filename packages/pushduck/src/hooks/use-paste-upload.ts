"use client";

/**
 * @fileoverview Paste to Upload Hook
 *
 * This module provides a React hook for paste-to-upload functionality with image preview support.
 * Supports both immediate upload mode (for chat interfaces) and preview mode (for controlled uploads).
 *
 * @example Basic Usage - Immediate Mode (Chat)
 * ```typescript
 * import { usePasteUpload } from 'pushduck/client';
 *
 * function ChatApp() {
 *   const { files, isUploading } = usePasteUpload('imageUpload', {
 *     accept: 'image/*',
 *     mode: 'immediate',
 *     scope: 'document',
 *     allowInputPaste: true,
 *   });
 *
 *   return (
 *     <div>
 *       <input type="text" placeholder="Type a message..." />
 *       {isUploading && <div>Uploading...</div>}
 *       {files.map(file => (
 *         <img key={file.id} src={file.url} alt={file.name} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example Preview Mode (Form Upload)
 * ```typescript
 * function FormComponent() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const { previewFiles, uploadPastedFiles, files, isUploading } = usePasteUpload('imageUpload', {
 *     accept: 'image/*',
 *     mode: 'preview',
 *     scope: 'container',
 *     containerRef,
 *   });
 *
 *   return (
 *     <div ref={containerRef}>
 *       {previewFiles.map(file => (
 *         <div key={file.id}>
 *           <img src={file.preview} alt={file.name} />
 *           <button onClick={() => uploadPastedFiles()}>Upload</button>
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
    RouterRouteNames,
    S3Router,
    S3UploadedFile,
} from "../types";
import { useUploadRoute } from "./use-upload-route";

// ========================================
// Types
// ========================================

export interface PasteFilePreview {
  id: string;
  file: File;
  preview: string; // blob URL
  name: string;
  size: number;
  type: string;
}

export interface UsePasteUploadConfig {
  /** Upload route name */
  route?: string;
  /** Upload endpoint URL (default: '/api/s3-upload') */
  endpoint?: string;
  /** Accepted file types (MIME types or extensions) */
  accept?: string;
  /** Enable/disable paste detection */
  enabled?: boolean;
  /** Paste detection scope - 'document' (anywhere on page) or 'container' (within specific element) */
  scope?: "document" | "container";
  /** React ref to container element (required when scope: 'container') */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Upload mode - 'immediate' (upload immediately) or 'preview' (show preview, manual upload) */
  mode?: "immediate" | "preview";
  /** Boolean alias for mode (true = 'immediate', false = 'preview') */
  autoUpload?: boolean;
  /** Allow paste detection when user is in input/textarea (default: true) */
  allowInputPaste?: boolean;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Maximum number of files */
  maxFiles?: number;
  /** Callback when files are pasted */
  onPaste?: (files: File[]) => void;
  /** Callback when preview is created */
  onPreview?: (preview: PasteFilePreview) => void;
  /** Callback when upload starts (only in immediate mode) */
  onUploadStart?: () => void;
  /** Callback when upload completes */
  onUploadComplete?: (results: S3UploadedFile[]) => void;
  /** Callback when upload fails */
  onUploadError?: (error: Error) => void;
  /** Custom validation function */
  validator?: (files: File[]) => string | null;
}

export interface UsePasteUploadResult {
  /** Array of files with preview URLs (only populated in preview mode) */
  previewFiles: PasteFilePreview[];
  /** Manual paste handler */
  handlePaste: (event: ClipboardEvent) => void;
  /** Function to manually trigger upload of previewed files (preview mode) */
  uploadPastedFiles: () => void;
  /** Clear preview state */
  clearPreviews: () => void;
  /** Upload state from useUploadRoute */
  files: S3UploadedFile[];
  /** Upload function from useUploadRoute */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uploadFiles: (files: File[], metadata?: any) => Promise<void>;
  /** Is currently uploading */
  isUploading: boolean;
  /** Upload progress (0-100) */
  progress: number;
  /** Upload speed in bytes per second */
  uploadSpeed: number;
  /** Estimated time remaining in seconds */
  eta: number;
  /** Upload errors */
  errors: string[];
}

// ========================================
// Utility Functions
// ========================================

/**
 * Checks if a file matches the accept pattern
 */
function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;

  const acceptedTypes = accept.split(",").map((type) => type.trim());

  return acceptedTypes.some((type) => {
    if (type.startsWith(".")) {
      return file.name.toLowerCase().endsWith(type.toLowerCase());
    }
    // Handle MIME type patterns like "image/*"
    const pattern = type.replace("*", ".*");
    return file.type.match(pattern);
  });
}

/**
 * Validates files against constraints
 */
function validateFiles(
  files: File[],
  config: UsePasteUploadConfig
): string | null {
  if (config.maxFiles && files.length > config.maxFiles) {
    return `Maximum ${config.maxFiles} files allowed`;
  }

  for (const file of files) {
    if (config.maxSize && file.size > config.maxSize) {
      return `File "${file.name}" is too large. Maximum size is ${formatFileSize(
        config.maxSize
      )}`;
    }

    if (config.accept && !matchesAccept(file, config.accept)) {
      return `File "${file.name}" is not an accepted file type`;
    }
  }

  if (config.validator) {
    return config.validator(files);
  }

  return null;
}

/**
 * Formats file size to human-readable string
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Extracts files from clipboard event
 */
function extractFilesFromClipboard(
  event: ClipboardEvent
): File[] | null {
  if (!event.clipboardData) {
    return null;
  }

  const items = Array.from(event.clipboardData.items);
  const fileItems = items.filter((item) => item.kind === "file");

  if (fileItems.length === 0) {
    return null;
  }

  const files: File[] = [];
  for (const item of fileItems) {
    const file = item.getAsFile();
    if (file) {
      files.push(file);
    }
  }

  return files.length > 0 ? files : null;
}

/**
 * Checks if paste event target is an input or textarea
 */
function isInputElement(
  target: EventTarget | null
): target is HTMLInputElement | HTMLTextAreaElement {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  );
}

/**
 * Checks if clipboard contains files (not just text)
 */
function clipboardHasFiles(event: ClipboardEvent): boolean {
  if (!event.clipboardData) return false;
  const items = Array.from(event.clipboardData.items);
  return items.some((item) => item.kind === "file");
}

// ========================================
// Main Hook Implementation
// ========================================

/**
 * React hook for paste-to-upload functionality with image preview support.
 *
 * @template TRouter - The router type for type-safe route names
 * @param routeName - Name of the upload route
 * @param config - Configuration for paste detection and upload behavior
 * @returns Paste upload state and control functions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function usePasteUpload<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter>,
  config?: UsePasteUploadConfig
): UsePasteUploadResult;

export function usePasteUpload(
  routeName: string,
  config?: UsePasteUploadConfig
): UsePasteUploadResult;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function usePasteUpload<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter> | string,
  config: UsePasteUploadConfig = {}
): UsePasteUploadResult {
  const {
    enabled = true,
    scope = "document",
    containerRef,
    mode: modeProp,
    autoUpload,
    allowInputPaste = true,
    onPaste,
    onPreview,
    onUploadStart,
    onUploadComplete,
    onUploadError,
  } = config;

  // Determine mode from props
  const mode =
    modeProp ?? (autoUpload !== undefined ? (autoUpload ? "immediate" : "preview") : "preview");

  // Use the route from config if provided, otherwise use routeName
  const uploadRoute = config.route || String(routeName);

  // Upload hook
  const {
    files,
    uploadFiles,
    isUploading,
    progress: progressRaw,
    uploadSpeed: uploadSpeedRaw,
    eta: etaRaw,
    errors,
  } = useUploadRoute(uploadRoute, {
    endpoint: config.endpoint,
    onSuccess: onUploadComplete,
    onError: onUploadError,
  });

  // Ensure progress, uploadSpeed and eta are numbers
  const progress = progressRaw ?? 0;
  const uploadSpeed = uploadSpeedRaw ?? 0;
  const eta = etaRaw ?? 0;

  // Preview state
  const [previewFiles, setPreviewFiles] = useState<PasteFilePreview[]>([]);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  // Clean up preview URLs
  const cleanupPreviews = useCallback(() => {
    previewUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    previewUrlsRef.current.clear();
  }, []);

  // Clear previews
  const clearPreviews = useCallback(() => {
    cleanupPreviews();
    setPreviewFiles([]);
  }, [cleanupPreviews]);

  // Create preview for a file
  const createPreview = useCallback(
    (file: File): PasteFilePreview => {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);

      const preview: PasteFilePreview = {
        id: `${Date.now()}-${Math.random()}`,
        file,
        preview: previewUrl,
        name: file.name,
        size: file.size,
        type: file.type,
      };

      onPreview?.(preview);
      return preview;
    },
    [onPreview]
  );

  // Handle paste event
  const handlePaste = useCallback(
    (event: Event) => {
      const pasteEvent = event as ClipboardEvent;
      if (!enabled) return;

      // Check if paste is from input/textarea
      const isInput = isInputElement(pasteEvent.target);
      if (isInput && !allowInputPaste) {
        return;
      }

      // Check if clipboard has files
      if (!clipboardHasFiles(pasteEvent)) {
        return;
      }

      // Extract files
      const files = extractFilesFromClipboard(pasteEvent);
      if (!files || files.length === 0) {
        return;
      }

      // Validate files
      const validationError = validateFiles(files, config);
      if (validationError) {
        onUploadError?.(new Error(validationError));
        return;
      }

      // Check scope for container mode
      if (scope === "container") {
        if (!containerRef?.current) {
          return;
        }
        const target = pasteEvent.target as Node;
        const container = containerRef.current as HTMLElement;
        if (!container.contains(target)) {
          return;
        }
      }

      // Prevent default if we're processing files (only if in input and files exist)
      if (isInput && files.length > 0) {
        // Only prevent default if we're going to process files
        // This allows text pasting to work normally when no files are present
        pasteEvent.preventDefault();
      }

      // Call onPaste callback
      onPaste?.(files);

      // Handle based on mode
      if (mode === "immediate") {
        onUploadStart?.();
        uploadFiles(files);
      } else {
        // Preview mode: create previews
        const previews = files.map(createPreview);
        setPreviewFiles((prev) => [...prev, ...previews]);
      }
    },
    [
      enabled,
      allowInputPaste,
      scope,
      containerRef,
      mode,
      config,
      onPaste,
      onUploadStart,
      onUploadError,
      uploadFiles,
      createPreview,
    ]
  );

  // Upload pasted files (preview mode)
  const uploadPastedFiles = useCallback(() => {
    if (previewFiles.length === 0) return;

    const filesToUpload = previewFiles.map((p) => p.file);
    onUploadStart?.();
    uploadFiles(filesToUpload);

    // Clean up previews after upload starts
    cleanupPreviews();
    setPreviewFiles([]);
  }, [previewFiles, uploadFiles, onUploadStart, cleanupPreviews]);

  // Set up paste event listener
  useEffect(() => {
    if (!enabled) return;

    const target =
      scope === "container" && containerRef?.current
        ? containerRef.current
        : document;

    target.addEventListener("paste", handlePaste);

    return () => {
      target.removeEventListener("paste", handlePaste);
    };
  }, [enabled, scope, containerRef, handlePaste]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupPreviews();
    };
  }, [cleanupPreviews]);

  return {
    previewFiles,
    handlePaste,
    uploadPastedFiles,
    clearPreviews,
    files,
    uploadFiles,
    isUploading,
    progress,
    uploadSpeed,
    eta,
    errors,
  };
}

