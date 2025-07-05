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
        <p className="text-gray-600 mb-4">
          Experience pushduck's enhanced type-safe uploads with our interactive
          demo. This showcase demonstrates the property-based client approach
          with real-time upload progress, error handling, and file management.
        </p>

        <div className="flex flex-wrap gap-3 text-sm">
          <a
            href="/docs/quick-start"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            📚 Quick Start Guide
          </a>
          <a
            href="/docs/api/client/create-upload-client"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            🔧 Property-Based Client API
          </a>
          <a
            href="/docs/providers"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            ☁️ Storage Providers
          </a>
          <a
            href="/docs/examples"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            💡 More Examples
          </a>
        </div>
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

      {/* Information Section */}
      <div className="mt-12 pt-8 border-t border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          About This Demo
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">
              🎯 Features Demonstrated
            </h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                Type-safe property-based client access
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                Real-time upload progress tracking
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                Automatic file validation and error handling
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                Multi-file batch uploads with individual progress
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                Drag-and-drop interface with file filtering
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">
              ⚡ Technology Stack
            </h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <strong>Frontend:</strong> Next.js 14 with App Router
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <strong>Upload Client:</strong> Enhanced property-based API
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <strong>Storage:</strong> Cloudflare R2 (S3-compatible)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <strong>Validation:</strong> Server-side type checking
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                <strong>UI:</strong> Tailwind CSS with responsive design
              </li>
            </ul>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">
            🚀 Ready to Build Your Own?
          </h3>
          <p className="text-blue-700 mb-4">
            This demo showcases pushduck's enhanced client approach. Get the
            same functionality in your app with just a few lines of code.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/docs/getting-started/quick-start"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Get Started in 2 Minutes
            </a>
            <a
              href="/docs/api/client/create-upload-client"
              className="inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
            >
              Enhanced Client Docs
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/docs/guides/client-approaches"
            className="block p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
          >
            <h4 className="font-semibold text-gray-900 mb-2">
              📋 Client Approaches
            </h4>
            <p className="text-sm text-gray-600">
              Compare hook-based vs property-based clients
            </p>
          </a>

          <a
            href="/docs/guides/uploads/images"
            className="block p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
          >
            <h4 className="font-semibold text-gray-900 mb-2">
              🖼️ Image Uploads
            </h4>
            <p className="text-sm text-gray-600">
              Advanced image handling and optimization
            </p>
          </a>

          <a
            href="/docs/guides/security/authentication"
            className="block p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
          >
            <h4 className="font-semibold text-gray-900 mb-2">
              🔐 Secure Uploads
            </h4>
            <p className="text-sm text-gray-600">
              Authentication and authorization patterns
            </p>
          </a>
        </div>
      </div>
    </div>
  );
}
