"use client";

import { upload } from "@/lib/upload-client";
import { useState } from "react";
import { formatETA, formatUploadSpeed } from "next-s3-uploader";
import { UploadZone } from "./upload-zone";
import { FileList } from "./file-list";

interface UploadDemoProps {
  title?: string;
  description?: string;
  showTabs?: boolean;
  defaultTab?: "images" | "files";
  compact?: boolean;
}

export function UploadDemo({
  title = "Interactive Upload Demo",
  description = "Try uploading files to see next-s3-uploader in action",
  showTabs = true,
  defaultTab = "images",
  compact = false,
}: UploadDemoProps) {
  const [activeTab, setActiveTab] = useState<"images" | "files">(defaultTab);

  // Enhanced type-safe hooks with property-based access
  const imageUpload = upload.imageUpload();
  const fileUpload = upload.fileUpload();

  const currentUpload = activeTab === "images" ? imageUpload : fileUpload;

  const handleUpload = async (files: File[]) => {
    try {
      await currentUpload.uploadFiles(files);
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  return (
    <div className="my-6 not-prose">
      <div className="overflow-hidden rounded-lg border border-fd-border bg-fd-card">
        {/* Header */}
        <div className="px-6 py-4 border-b border-fd-border bg-fd-muted/30">
          <h3 className="mb-1 text-lg font-semibold text-fd-card-foreground">
            {title}
          </h3>
          <p className="text-sm text-fd-muted-foreground">{description}</p>
        </div>

        <div className="p-6">
          {/* Demo Notice */}
          {!compact && (
            <div className="p-3 mb-4 bg-blue-50 rounded-md border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
              <div className="flex gap-2 items-start">
                <div className="text-blue-500 mt-0.5">ℹ️</div>
                <div>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <strong>Live Demo:</strong> Files are uploaded to Cloudflare
                    R2. Don't upload sensitive information.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Feature Badges */}
          {!compact && (
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-800 bg-green-100 rounded-full dark:bg-green-900/20 dark:text-green-300">
                ✅ Type-Safe
              </span>
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-800 bg-blue-100 rounded-full dark:bg-blue-900/20 dark:text-blue-300">
                ⚡ Property-Based
              </span>
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-purple-800 bg-purple-100 rounded-full dark:bg-purple-900/20 dark:text-purple-300">
                ☁️ Cloudflare R2
              </span>
            </div>
          )}

          {/* Tab Navigation */}
          {showTabs && (
            <div className="flex mb-4 border-b border-fd-border">
              <button
                onClick={() => setActiveTab("images")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "images"
                    ? "border-fd-primary text-fd-primary"
                    : "border-transparent text-fd-muted-foreground hover:text-fd-foreground"
                }`}
              >
                🖼️ Images
              </button>
              <button
                onClick={() => setActiveTab("files")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "files"
                    ? "border-fd-primary text-fd-primary"
                    : "border-transparent text-fd-muted-foreground hover:text-fd-foreground"
                }`}
              >
                📄 Documents
              </button>
            </div>
          )}

          {/* Upload Area */}
          <div className="space-y-4">
            <UploadZone
              onDrop={handleUpload}
              disabled={currentUpload.isUploading}
              accept={
                activeTab === "images"
                  ? { "image/*": [".jpg", ".jpeg", ".png", ".webp"] }
                  : {
                      "application/pdf": [".pdf"],
                      "application/msword": [".doc"],
                      "text/plain": [".txt"],
                    }
              }
              maxFiles={activeTab === "images" ? 3 : 2}
            />

            {/* Status and Actions */}
            {currentUpload.files.length > 0 && (
              <div className="flex justify-between items-center p-3 rounded-md bg-fd-muted/50">
                <div className="text-sm text-fd-muted-foreground">
                  <span className="font-medium text-fd-foreground">
                    {
                      currentUpload.files.filter((f) => f.status === "success")
                        .length
                    }
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-fd-foreground">
                    {currentUpload.files.length}
                  </span>{" "}
                  files uploaded
                </div>

                <div className="flex gap-2 items-center">
                  {currentUpload.isUploading && (
                    <div className="flex gap-2 items-center text-sm text-fd-primary">
                      <div className="w-3 h-3 rounded-full border-2 animate-spin border-fd-primary border-t-transparent"></div>
                      Uploading...
                    </div>
                  )}

                  <button
                    onClick={currentUpload.reset}
                    disabled={currentUpload.isUploading}
                    className="px-2 py-1 text-xs rounded border transition-colors text-fd-muted-foreground hover:text-fd-foreground disabled:opacity-50 border-fd-border hover:border-fd-border-hover"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* File List */}
            {currentUpload.files.length > 0 && (
              <div className="space-y-2">
                {currentUpload.files.map((file) => (
                  <div
                    key={file.id}
                    className="p-3 rounded-md border bg-fd-background border-fd-border"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-fd-foreground">
                          {file.name}
                        </p>
                        <p className="text-xs text-fd-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>

                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          file.status === "success"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                            : file.status === "error"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
                        }`}
                      >
                        {file.status === "success" && "✅ Complete"}
                        {file.status === "error" && "❌ Error"}
                        {file.status === "uploading" && `📤 ${file.progress}%`}
                        {file.status === "pending" && "⏳ Pending"}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    {(file.status === "uploading" ||
                      file.status === "pending") && (
                      <div className="w-full h-1.5 bg-fd-muted rounded-full">
                        <div
                          className="h-1.5 bg-fd-primary rounded-full transition-all duration-300"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Upload Stats - ETA and Speed */}
                    {file.status === "uploading" &&
                      (file.uploadSpeed || file.eta) && (
                        <div className="flex justify-between text-xs text-fd-muted-foreground mt-1">
                          {file.uploadSpeed && (
                            <span>{formatUploadSpeed(file.uploadSpeed)}</span>
                          )}
                          {file.eta && <span>ETA: {formatETA(file.eta)}</span>}
                        </div>
                      )}

                    {/* Success State */}
                    {file.status === "success" && file.url && (
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-fd-primary hover:underline"
                      >
                        View file →
                      </a>
                    )}

                    {/* Error State */}
                    {file.status === "error" && file.error && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {file.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Error Display */}
            {currentUpload.errors.length > 0 && (
              <div className="p-3 bg-red-50 rounded-md border border-red-200 dark:bg-red-950/20 dark:border-red-800">
                <h4 className="mb-1 text-sm font-medium text-red-800 dark:text-red-300">
                  Upload Errors:
                </h4>
                <ul className="space-y-1">
                  {currentUpload.errors.map((error, index) => (
                    <li
                      key={index}
                      className="text-sm text-red-600 dark:text-red-400"
                    >
                      • {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Empty State */}
            {currentUpload.files.length === 0 && (
              <div className="py-6 text-center text-fd-muted-foreground">
                <div className="mb-2 text-2xl">📤</div>
                <p className="text-sm">Drop files above or click to browse</p>
              </div>
            )}
          </div>

          {/* Code Example */}
          {!compact && (
            <div className="p-4 mt-6 rounded-md border bg-fd-background border-fd-border">
              <h4 className="mb-2 text-sm font-semibold text-fd-foreground">
                💻 Code powering this demo:
              </h4>
              <pre className="overflow-x-auto text-xs text-fd-muted-foreground">
                <code>{`// Enhanced type-safe client
const ${activeTab === "images" ? "imageUpload" : "fileUpload"} = upload.${
                  activeTab === "images" ? "imageUpload" : "fileUpload"
                }();

// Upload with full type safety
await ${
                  activeTab === "images" ? "imageUpload" : "fileUpload"
                }.uploadFiles(files);

// Access state with TypeScript inference
const { files, isUploading, errors } = ${
                  activeTab === "images" ? "imageUpload" : "fileUpload"
                };`}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
