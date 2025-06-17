"use client";

import { FileList } from "@/components/ui/file-list";
import { UploadZone } from "@/components/ui/upload-zone";
import { upload } from "@/lib/upload-client";
import { useState } from "react";

export default function UploadPage() {
  const [activeTab, setActiveTab] = useState<"images" | "files">("images");

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
    <div className="container px-4 py-8 mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          🚀 File Upload Demo
        </h1>
        <p className="text-gray-600">
          Enhanced type-safe uploads with property-based client
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("images")}
          className={`px-4 py-2 font-medium text-sm border-b-2 ${
            activeTab === "images"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          🖼️ Images (.jpg, .png, .webp)
        </button>
        <button
          onClick={() => setActiveTab("files")}
          className={`px-4 py-2 font-medium text-sm border-b-2 ${
            activeTab === "files"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          📄 Documents (.pdf, .doc, .txt)
        </button>
      </div>

      {/* Upload Area */}
      <div className="space-y-6">
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
          maxFiles={activeTab === "images" ? 5 : 3}
        />

        {/* Status and Actions */}
        {currentUpload.files.length > 0 && (
          <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">
              {currentUpload.files.filter((f) => f.status === "success").length}{" "}
              of {currentUpload.files.length} files uploaded
            </div>

            <div className="flex gap-2">
              {currentUpload.isUploading && (
                <div className="text-sm text-blue-600">
                  Uploading{" "}
                  {
                    currentUpload.files.filter((f) => f.status === "uploading")
                      .length
                  }{" "}
                  files...
                </div>
              )}

              <button
                onClick={currentUpload.reset}
                disabled={currentUpload.isUploading}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* File List */}
        <FileList
          files={currentUpload.files}
          onRemove={(fileId) => {
            // Custom remove logic if needed
            console.log("Remove file:", fileId);
          }}
        />

        {/* Error Display */}
        {currentUpload.errors.length > 0 && (
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <h4 className="mb-2 text-sm font-medium text-red-800">
              Upload Errors:
            </h4>
            <ul className="space-y-1">
              {currentUpload.errors.map((error, index) => (
                <li key={index} className="text-sm text-red-600">
                  • {error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
