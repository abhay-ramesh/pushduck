"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

interface UploadZoneProps {
  onDrop: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  accept?: Record<string, string[]>;
  maxFiles?: number;
}

export function UploadZone({ 
  onDrop, 
  disabled, 
  className, 
  accept,
  maxFiles = 10 
}: UploadZoneProps) {
  const handleDrop = useCallback((files: File[]) => onDrop(files), [onDrop]);
  
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop: handleDrop,
    disabled,
    accept,
    maxFiles,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        ${isDragActive && !isDragReject ? "border-blue-500 bg-blue-50" : ""}
        ${isDragReject ? "border-red-500 bg-red-50" : ""}
        ${!isDragActive && !isDragReject ? "border-gray-300 hover:border-gray-400" : ""}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        ${className || ""}
      `}
    >
      <input {...getInputProps()} />
      <div className="space-y-2">
        <div className="text-2xl">📁</div>
        <p className="text-lg font-medium">
          {isDragActive
            ? isDragReject
              ? "Some files are not accepted"
              : "Drop files here"
            : "Drag & drop files or click to browse"}
        </p>
        <p className="text-sm text-gray-500">
          Maximum {maxFiles} files allowed
        </p>
      </div>
    </div>
  );
}
