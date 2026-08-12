"use client";

import { usePasteUpload } from "pushduck/client";
import { useRef, useState } from "react";

export default function PasteUploadPage() {
  const [activeDemo, setActiveDemo] = useState<
    | "chat-immediate"
    | "form-preview"
    | "document-scope"
    | "container-scope"
    | "input-paste"
  >("chat-immediate");

  return (
    <div className="container px-4 py-8 mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Paste to Upload Demo
        </h1>
        <p className="text-gray-600 mb-4">
          Test all paste-to-upload features: immediate mode, preview mode,
          document scope, container scope, and input field paste detection.
        </p>
      </div>

      {/* Demo Selector */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-gray-200 pb-4">
        <button
          onClick={() => setActiveDemo("chat-immediate")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeDemo === "chat-immediate"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Chat (Immediate)
        </button>
        <button
          onClick={() => setActiveDemo("form-preview")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeDemo === "form-preview"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Form (Preview)
        </button>
        <button
          onClick={() => setActiveDemo("document-scope")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeDemo === "document-scope"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Document Scope
        </button>
        <button
          onClick={() => setActiveDemo("container-scope")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeDemo === "container-scope"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Container Scope
        </button>
        <button
          onClick={() => setActiveDemo("input-paste")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeDemo === "input-paste"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Input Field Paste
        </button>
      </div>

      {/* Demo Content */}
      <div className="space-y-8">
        {activeDemo === "chat-immediate" && <ChatImmediateDemo />}
        {activeDemo === "form-preview" && <FormPreviewDemo />}
        {activeDemo === "document-scope" && <DocumentScopeDemo />}
        {activeDemo === "container-scope" && <ContainerScopeDemo />}
        {activeDemo === "input-paste" && <InputPasteDemo />}
      </div>
    </div>
  );
}

// Chat Interface with Immediate Upload
function ChatImmediateDemo() {
  const { files, isUploading } = usePasteUpload("imageUpload", {
    endpoint: "/api/upload",
    accept: "image/*",
    mode: "immediate",
    scope: "document",
    allowInputPaste: true,
    maxSize: 5 * 1024 * 1024, // 5MB
    onUploadStart: () => {
      console.log("Uploading pasted image...");
    },
  });

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">
          Chat Interface (Immediate Mode)
        </h2>
        <p className="text-sm text-blue-700 mb-2">
          <strong>Features:</strong> Document scope, immediate upload, input
          field paste enabled
        </p>
        <p className="text-sm text-blue-700">
          <strong>Try it:</strong> Paste an image anywhere on this page, or
          while typing in the input below. The image will upload immediately.
        </p>
      </div>

      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Type a message (you can paste images while typing):
          </label>
          <input
            type="text"
            placeholder="Type a message and paste an image..."
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {isUploading && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700">Uploading image...</p>
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">
              Uploaded Images:
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {files
                .filter((f) => f.status === "success" && f.url)
                .map((file) => (
                  <div
                    key={file.id}
                    className="relative aspect-square rounded-lg overflow-hidden border border-gray-200"
                  >
                    <img
                      src={file.presignedUrl || file.url}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-xs text-white truncate">{file.name}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Form Upload with Preview Mode
function FormPreviewDemo() {
  const formRef = useRef<HTMLDivElement>(null);
  const {
    previewFiles,
    uploadPastedFiles,
    clearPreviews,
    files,
    isUploading,
    progress,
  } = usePasteUpload("imageUpload", {
    endpoint: "/api/upload",
    accept: "image/*",
    mode: "preview",
    scope: "container",
    containerRef: formRef,
    maxFiles: 5,
    maxSize: 10 * 1024 * 1024, // 10MB
    onPaste: (files) => {
      console.log(`Pasted ${files.length} images`);
    },
  });

  return (
    <div className="space-y-6">
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <h2 className="text-lg font-semibold text-green-900 mb-2">
          Form Upload (Preview Mode)
        </h2>
        <p className="text-sm text-green-700 mb-2">
          <strong>Features:</strong> Container scope, preview mode, manual
          upload trigger
        </p>
        <p className="text-sm text-green-700">
          <strong>Try it:</strong> Paste images in the form area below. They'll
          show as previews. Click "Upload" to upload them.
        </p>
      </div>

      <div
        ref={formRef}
        className="p-6 bg-white border-2 border-dashed border-gray-300 rounded-lg"
      >
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Image Upload Form
        </h3>

        {previewFiles.length > 0 && (
          <div className="mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {previewFiles.length} image
                {previewFiles.length !== 1 ? "s" : ""} ready to upload
              </p>
              <div className="flex gap-2">
                <button
                  onClick={uploadPastedFiles}
                  disabled={isUploading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Upload {previewFiles.length} Image
                  {previewFiles.length !== 1 ? "s" : ""}
                </button>
                <button
                  onClick={clearPreviews}
                  disabled={isUploading}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 text-sm font-medium"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {previewFiles.map((preview) => (
                <div
                  key={preview.id}
                  className="relative aspect-square rounded-lg overflow-hidden border border-gray-200"
                >
                  <img
                    src={preview.preview}
                    alt={preview.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-xs text-white truncate">
                      {preview.name}
                    </p>
                    <p className="text-xs text-white/80">
                      {(preview.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isUploading && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Uploading...</span>
              <span className="text-gray-600">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {previewFiles.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-2">Paste images in this form area</p>
            <p className="text-sm">
              Images will appear as previews before upload
            </p>
          </div>
        )}

        {files.length > 0 && files.some((f) => f.status === "success") && (
          <div className="mt-6 space-y-2">
            <h4 className="text-sm font-medium text-gray-700">
              Uploaded Images:
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {files
                .filter((f) => f.status === "success" && f.url)
                .map((file) => (
                  <div
                    key={file.id}
                    className="relative aspect-square rounded-lg overflow-hidden border border-gray-200"
                  >
                    <img
                      src={file.presignedUrl || file.url}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Document Scope Demo
function DocumentScopeDemo() {
  const { files, isUploading } = usePasteUpload("imageUpload", {
    endpoint: "/api/upload",
    accept: "image/*",
    mode: "immediate",
    scope: "document",
    allowInputPaste: true,
  });

  return (
    <div className="space-y-6">
      <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <h2 className="text-lg font-semibold text-purple-900 mb-2">
          Document Scope (Paste Anywhere)
        </h2>
        <p className="text-sm text-purple-700 mb-2">
          <strong>Features:</strong> Document scope allows pasting anywhere on
          the page
        </p>
        <p className="text-sm text-purple-700">
          <strong>Try it:</strong> Paste an image anywhere on this page - it
          will be detected and uploaded immediately.
        </p>
      </div>

      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <p className="text-sm text-gray-600 mb-4">
          This demo uses document scope. Try pasting an image:
        </p>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 mb-4">
          <li>Click anywhere on the page and paste (Ctrl+V / Cmd+V)</li>
          <li>Paste while typing in any input field</li>
          <li>
            Paste in this text area:{" "}
            <textarea
              className="w-full mt-2 p-2 border rounded"
              placeholder="Type here and paste an image..."
            />
          </li>
        </ul>

        {isUploading && (
          <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-md">
            <p className="text-sm text-purple-700">Uploading image...</p>
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">
              Uploaded Images:
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {files
                .filter((f) => f.status === "success" && f.url)
                .map((file) => (
                  <div
                    key={file.id}
                    className="relative aspect-square rounded-lg overflow-hidden border border-gray-200"
                  >
                    <img
                      src={file.presignedUrl || file.url}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Container Scope Demo
function ContainerScopeDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { files, isUploading } = usePasteUpload("imageUpload", {
    endpoint: "/api/upload",
    accept: "image/*",
    mode: "immediate",
    scope: "container",
    containerRef,
  });

  return (
    <div className="space-y-6">
      <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <h2 className="text-lg font-semibold text-orange-900 mb-2">
          Container Scope (Boundary-Specific)
        </h2>
        <p className="text-sm text-orange-700 mb-2">
          <strong>Features:</strong> Container scope limits paste detection to a
          specific area
        </p>
        <p className="text-sm text-orange-700">
          <strong>Try it:</strong> Paste an image inside the bordered area
          below. Pastes outside the area won't be detected.
        </p>
      </div>

      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <p className="text-sm text-gray-600 mb-4">
          This area has container scope. Paste only works inside the bordered
          box:
        </p>

        <div
          ref={containerRef}
          className="p-8 border-4 border-dashed border-orange-400 rounded-lg bg-orange-50/50 min-h-[300px] flex items-center justify-center"
        >
          <div className="text-center">
            <p className="text-lg font-medium text-gray-700 mb-2">Paste Zone</p>
            <p className="text-sm text-gray-600">
              Paste images only in this area
            </p>
            <p className="text-xs text-gray-500 mt-2">
              (Pastes outside this box won't be detected)
            </p>
          </div>
        </div>

        {isUploading && (
          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
            <p className="text-sm text-orange-700">Uploading image...</p>
          </div>
        )}

        {files.length > 0 && (
          <div className="mt-4 space-y-4">
            <h3 className="text-sm font-medium text-gray-700">
              Uploaded Images:
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {files
                .filter((f) => f.status === "success" && f.url)
                .map((file) => (
                  <div
                    key={file.id}
                    className="relative aspect-square rounded-lg overflow-hidden border border-gray-200"
                  >
                    <img
                      src={file.presignedUrl || file.url}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Input Field Paste Demo
function InputPasteDemo() {
  const { files, isUploading } = usePasteUpload("imageUpload", {
    endpoint: "/api/upload",
    accept: "image/*",
    mode: "immediate",
    scope: "document",
    allowInputPaste: true,
  });

  return (
    <div className="space-y-6">
      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
        <h2 className="text-lg font-semibold text-indigo-900 mb-2">
          Input Field Paste Detection
        </h2>
        <p className="text-sm text-indigo-700 mb-2">
          <strong>Features:</strong> Paste detection works even when user is
          typing in input fields
        </p>
        <p className="text-sm text-indigo-700">
          <strong>Try it:</strong> Click in any input field below and paste an
          image. It will upload while you're typing.
        </p>
      </div>

      <div className="p-6 bg-white border border-gray-200 rounded-lg space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Regular Input Field:
          </label>
          <input
            type="text"
            placeholder="Type here and paste an image (Ctrl+V / Cmd+V)..."
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Textarea:
          </label>
          <textarea
            placeholder="Type here and paste an image..."
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Input:
          </label>
          <input
            type="search"
            placeholder="Search and paste images..."
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="p-4 bg-gray-50 rounded-md">
          <p className="text-xs text-gray-600">
            <strong>Note:</strong> When you paste text, it works normally. When
            you paste images, they upload automatically.
          </p>
        </div>

        {isUploading && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-md">
            <p className="text-sm text-indigo-700">Uploading pasted image...</p>
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">
              Uploaded Images:
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {files
                .filter((f) => f.status === "success" && f.url)
                .map((file) => (
                  <div
                    key={file.id}
                    className="relative aspect-square rounded-lg overflow-hidden border border-gray-200"
                  >
                    <img
                      src={file.presignedUrl || file.url}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-xs text-white truncate">{file.name}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
