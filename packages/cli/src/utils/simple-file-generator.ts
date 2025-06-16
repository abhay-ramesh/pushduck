import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import type { ProjectInfo } from "./project-detector";
import type { ProviderCredentials, ProviderType } from "./provider-setup";
import { generateEnvVariables } from "./provider-setup";

interface GenerateFilesOptions {
  projectInfo: ProjectInfo;
  provider: ProviderType;
  credentials: ProviderCredentials;
  apiPath: string;
  generateExamples: boolean;
  verbose?: boolean;
}

export async function generateFiles(
  options: GenerateFilesOptions
): Promise<void> {
  const {
    projectInfo,
    provider,
    credentials,
    apiPath,
    generateExamples,
    verbose,
  } = options;

  // Create directories
  await createDirectories(projectInfo, apiPath, generateExamples);

  // Create files
  await createApiRoute(projectInfo, apiPath, verbose);
  await createUploadConfig(projectInfo, provider, verbose);
  await createUploadClient(projectInfo, apiPath, verbose);
  await updateEnvFile(projectInfo, provider, credentials, verbose);

  if (generateExamples) {
    await createComponents(projectInfo, verbose);
    await createExamplePage(projectInfo, apiPath, verbose);
  }
}

async function createDirectories(
  projectInfo: ProjectInfo,
  apiPath: string,
  generateExamples: boolean
): Promise<void> {
  const { rootDir, router } = projectInfo;

  if (router === "app") {
    await fs.ensureDir(path.join(rootDir, `app${apiPath}`));
  }

  await fs.ensureDir(path.join(rootDir, "lib"));

  if (generateExamples) {
    await fs.ensureDir(path.join(rootDir, "components/ui"));
    if (router === "app") {
      await fs.ensureDir(path.join(rootDir, "app/upload"));
    }
  }
}

async function createApiRoute(
  projectInfo: ProjectInfo,
  apiPath: string,
  verbose?: boolean
): Promise<void> {
  const { rootDir, router, typescript } = projectInfo;
  const ext = typescript ? "ts" : "js";

  let filePath: string;
  let content: string;

  if (router === "app") {
    filePath = path.join(rootDir, `app${apiPath}/route.${ext}`);
    content = `import { s3, createS3Handler } from "@/lib/upload-config";

// Define upload routes with proper validation and lifecycle hooks  
const uploadRouter = s3.createRouter({
  // Image upload route with size and format validation
  imageUpload: s3
    .image()
    .max("5MB")
    .formats(["jpeg", "jpg", "png", "webp"])
    .middleware(async ({ file, metadata }) => {
      console.log("Processing image upload:", file.name);
      return {
        ...metadata,
        userId: "demo-user", // Replace with actual auth
        uploadedAt: new Date().toISOString(),
        category: "images",
      };
    })
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(\`✅ Image upload complete: \${file.name} -> \${url}\`, metadata);
    }),

  // File upload route  
  fileUpload: s3
    .file()
    .max("10MB")
    .types([
      "application/pdf",
      "application/msword", 
      "text/plain",
      "image/*"
    ])
    .middleware(async ({ file, metadata }) => {
      console.log("Processing file upload:", file.name);
      return {
        ...metadata,
        userId: "demo-user", // Replace with actual auth
        uploadedAt: new Date().toISOString(),
        category: "documents",
      };
    })
    .onUploadComplete(async ({ file, url, metadata }) => {
      console.log(\`✅ File upload complete: \${file.name} -> \${url}\`, metadata);
    }),
});

// Export router type for enhanced client type inference
export type AppUploadRouter = typeof uploadRouter;

// Export the HTTP handlers
export const { GET, POST } = createS3Handler(uploadRouter);
`;
  } else {
    filePath = path.join(rootDir, `pages${apiPath}.${ext}`);
    content = `import { s3, createS3Handler } from "../lib/upload-config";

const uploadRouter = s3.createRouter({
  imageUpload: s3.image().max("5MB").formats(["jpeg", "jpg", "png", "webp"]),
  fileUpload: s3.file().max("10MB").types(["application/pdf", "text/plain", "image/*"]),
});

export type AppUploadRouter = typeof uploadRouter;

const handler = createS3Handler(uploadRouter);
export default handler;
`;
  }

  await fs.writeFile(filePath, content);

  if (verbose) {
    console.log(chalk.gray(`  Created: ${path.relative(rootDir, filePath)}`));
  }
}

async function createUploadConfig(
  projectInfo: ProjectInfo,
  provider: ProviderType,
  verbose?: boolean
): Promise<void> {
  const { rootDir, typescript } = projectInfo;
  const ext = typescript ? "ts" : "js";
  const filePath = path.join(rootDir, `lib/upload-config.${ext}`);

  const providerMethod = getProviderMethodName(provider);
  const envVars = getProviderEnvVars(provider);

  const content = `import { uploadConfig } from "next-s3-uploader/server";

// Initialize upload configuration with simplified one-step process
const { s3, createS3Handler, config } = uploadConfig
  .${providerMethod}({
    ${envVars}
  })
  .defaults({
    maxFileSize: "10MB",
    acl: "public-read",
  })
  .build();

export { s3, createS3Handler, config };
`;

  await fs.writeFile(filePath, content);

  if (verbose) {
    console.log(chalk.gray(`  Created: ${path.relative(rootDir, filePath)}`));
  }
}

// NEW: Generate enhanced type-safe client
async function createUploadClient(
  projectInfo: ProjectInfo,
  apiPath: string,
  verbose?: boolean
): Promise<void> {
  const { rootDir, typescript } = projectInfo;
  const ext = typescript ? "ts" : "js";
  const filePath = path.join(rootDir, `lib/upload-client.${ext}`);

  const routePath =
    projectInfo.router === "app"
      ? `"@/app${apiPath}/route"`
      : `"../pages${apiPath}"`;

  const content = `/**
 * Enhanced Upload Client with Property-Based Access
 * 
 * This provides type-safe upload functionality with enhanced developer experience.
 */

import { createUploadClient } from "next-s3-uploader/client";
import type { AppUploadRouter } from ${routePath};

/**
 * Type-safe upload client with property-based access
 * 
 * Usage:
 * const { uploadFiles, files, isUploading, reset } = upload.imageUpload();
 * const { uploadFiles, files, isUploading, reset } = upload.fileUpload();
 */
export const upload = createUploadClient<AppUploadRouter>({
  endpoint: "${apiPath}",
});

// Export types for manual usage
export type { AppUploadRouter };
`;

  await fs.writeFile(filePath, content);

  if (verbose) {
    console.log(chalk.gray(`  Created: ${path.relative(rootDir, filePath)}`));
  }
}

async function createComponents(
  projectInfo: ProjectInfo,
  verbose?: boolean
): Promise<void> {
  const { rootDir, typescript } = projectInfo;
  const ext = typescript ? "tsx" : "jsx";

  // Enhanced Upload Zone with better UX
  const uploadZonePath = path.join(rootDir, `components/ui/upload-zone.${ext}`);
  const uploadZoneContent = `"use client";

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
      className={\`
        border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        \${isDragActive && !isDragReject ? "border-blue-500 bg-blue-50" : ""}
        \${isDragReject ? "border-red-500 bg-red-50" : ""}
        \${!isDragActive && !isDragReject ? "border-gray-300 hover:border-gray-400" : ""}
        \${disabled ? "opacity-50 cursor-not-allowed" : ""}
        \${className || ""}
      \`}
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
`;

  await fs.writeFile(uploadZonePath, uploadZoneContent);

  // Enhanced File List with progress and status
  const fileListPath = path.join(rootDir, `components/ui/file-list.${ext}`);
  const fileListContent = `"use client";

import { formatETA, formatUploadSpeed } from "next-s3-uploader";

interface FileListProps {
  files: Array<{
    id: string;
    name: string;
    size: number;
    status: 'pending' | 'uploading' | 'success' | 'error';
    progress: number;
    url?: string;
    error?: string;
    uploadSpeed?: number;
    eta?: number;
  }>;
  onRemove?: (fileId: string) => void;
}

export function FileList({ files, onRemove }: FileListProps) {
  if (!files.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium">Upload Progress</h3>
      {files.map((file) => (
        <div key={file.id} className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {file.name}
              </p>
              <p className="text-xs text-gray-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            
            <div className="flex gap-2 items-center">
              <span className={\`text-xs px-2 py-1 rounded-full \${
                file.status === "success"
                  ? "bg-green-100 text-green-800"
                  : file.status === "error"
                  ? "bg-red-100 text-red-800"
                  : "bg-blue-100 text-blue-800"
              }\`}>
                {file.status === "success" && "✅ Complete"}
                {file.status === "error" && "❌ Error"}
                {file.status === "uploading" && \`📤 \${file.progress}%\`}
                {file.status === "pending" && "⏳ Pending"}
              </span>
              
              {onRemove && file.status !== "uploading" && (
                <button
                  onClick={() => onRemove(file.id)}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {(file.status === "uploading" || file.status === "pending") && (
            <div className="mb-2 w-full h-2 bg-gray-200 rounded-full">
              <div
                className="h-2 bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: \`\${file.progress}%\` }}
              />
            </div>
          )}

          {/* Upload Stats */}
          {file.status === "uploading" && file.uploadSpeed && file.eta && (
            <div className="flex justify-between text-xs text-gray-500">
              <span>{formatUploadSpeed(file.uploadSpeed)}</span>
              <span>ETA: {formatETA(file.eta)}</span>
            </div>
          )}

          {/* Success State */}
          {file.status === "success" && file.url && (
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 underline hover:text-blue-800"
            >
              View uploaded file →
            </a>
          )}

          {/* Error State */}
          {file.status === "error" && file.error && (
            <p className="mt-1 text-sm text-red-600">{file.error}</p>
          )}
        </div>
      ))}
    </div>
  );
}
`;

  await fs.writeFile(fileListPath, fileListContent);

  if (verbose) {
    console.log(
      chalk.gray(`  Created: ${path.relative(rootDir, uploadZonePath)}`)
    );
    console.log(
      chalk.gray(`  Created: ${path.relative(rootDir, fileListPath)}`)
    );
  }
}

async function createExamplePage(
  projectInfo: ProjectInfo,
  apiPath: string,
  verbose?: boolean
): Promise<void> {
  const { rootDir, router, typescript } = projectInfo;
  const ext = typescript ? "tsx" : "jsx";

  const filePath =
    router === "app"
      ? path.join(rootDir, `app/upload/page.${ext}`)
      : path.join(rootDir, `pages/upload.${ext}`);

  const content = `"use client";

import { useState } from "react";
import { upload } from "@/lib/upload-client";
import { UploadZone } from "@/components/ui/upload-zone";
import { FileList } from "@/components/ui/file-list";

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
          className={\`px-4 py-2 font-medium text-sm border-b-2 \${
            activeTab === "images"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }\`}
        >
          🖼️ Images (.jpg, .png, .webp)
        </button>
        <button
          onClick={() => setActiveTab("files")}
          className={\`px-4 py-2 font-medium text-sm border-b-2 \${
            activeTab === "files"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }\`}
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
              {currentUpload.files.filter(f => f.status === "success").length} of{" "}
              {currentUpload.files.length} files uploaded
            </div>
            
            <div className="flex gap-2">
              {currentUpload.isUploading && (
                <div className="text-sm text-blue-600">
                  Uploading {currentUpload.files.filter(f => f.status === "uploading").length} files...
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
            <h4 className="mb-2 text-sm font-medium text-red-800">Upload Errors:</h4>
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
`;

  await fs.writeFile(filePath, content);

  if (verbose) {
    console.log(chalk.gray(`  Created: ${path.relative(rootDir, filePath)}`));
  }
}

async function updateEnvFile(
  projectInfo: ProjectInfo,
  provider: ProviderType,
  credentials: ProviderCredentials,
  verbose?: boolean
): Promise<void> {
  const { rootDir } = projectInfo;
  const envPath = path.join(rootDir, ".env.local");

  const envVars = generateEnvVariables(credentials, provider);

  let content = "";
  if (await fs.pathExists(envPath)) {
    content = await fs.readFile(envPath, "utf-8");
  }

  if (!content.includes("# Upload Configuration")) {
    content += "\n# Upload Configuration\n";
  }

  Object.entries(envVars).forEach(([key, value]) => {
    if (!content.includes(`${key}=`)) {
      content += `${key}=${value}\n`;
    }
  });

  await fs.writeFile(envPath, content);

  if (verbose) {
    console.log(chalk.gray(`  Updated: .env.local`));
  }
}

function getProviderMethodName(provider: ProviderType): string {
  switch (provider) {
    case "aws":
      return "aws";
    case "cloudflare-r2":
      return "cloudflareR2";
    case "digitalocean":
      return "digitalocean";
    case "minio":
      return "minio";
    case "gcs":
      return "gcs";
    default:
      return provider;
  }
}

function getProviderEnvVars(provider: ProviderType): string {
  switch (provider) {
    case "aws":
      return "region: process.env.AWS_REGION!,\n      bucket: process.env.S3_BUCKET!,";
    case "cloudflare-r2":
      return "accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,\n      bucket: process.env.R2_BUCKET!,";
    case "digitalocean":
      return "region: process.env.DO_SPACES_REGION!,\n      bucket: process.env.DO_SPACES_BUCKET!,";
    case "minio":
      return "endpoint: process.env.MINIO_ENDPOINT!,\n      bucket: process.env.MINIO_BUCKET!,";
    case "gcs":
      return "projectId: process.env.GCS_PROJECT_ID!,\n      bucket: process.env.GCS_BUCKET!,";
    default:
      return "";
  }
}
