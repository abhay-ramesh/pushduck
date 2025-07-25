import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import type { ProjectInfo } from "./project-detector";
import type { ProviderCredentials, ProviderType } from "./provider-setup";
import { generateEnvVariables } from "./provider-setup";

// Utility function to resolve import paths based on tsconfig path mappings
function resolveImportPath(
  projectInfo: ProjectInfo,
  targetPath: string, // e.g., "lib/upload-config"
  fromPath: string // e.g., "src/app/api/upload" or "app/api/upload"
): string {
  const { pathMappings, baseUrl, useSrcDir } = projectInfo;

  // First, try to find a matching path mapping
  for (const mapping of pathMappings) {
    const { alias, target } = mapping;

    // Check if we can use this alias for the target path
    if (alias.endsWith("/*")) {
      const aliasBase = alias.slice(0, -2); // Remove "/*"
      const targetBase = target.replace(/^\.\//, "").replace(/\/\*$/, ""); // Clean up target

      // For common patterns like "@/*" -> "./src/*" or "@/*" -> "./*"
      if (aliasBase === "@") {
        // Check if the target path matches the expected structure
        const expectedBase = useSrcDir ? "src" : "";

        if (target === "./*" || target === "./src/*" || target === "src/*") {
          // Use alias if target structure matches our actual structure
          const shouldUseAlias =
            (target.includes("src") && useSrcDir) ||
            (!target.includes("src") && !useSrcDir) ||
            target === "./*"; // ./* works for both

          if (shouldUseAlias) {
            return `"@/${targetPath}"`;
          }
        }
      }
    }
  }

  // Fall back to relative imports
  const fromDir = path.dirname(fromPath);

  // Calculate the correct target path based on the actual file structure
  let targetFullPath: string;
  if (targetPath.startsWith("lib/")) {
    // For lib imports (like lib/upload-config)
    const libDir = useSrcDir ? "src/lib" : "lib";
    targetFullPath = path.join(libDir, targetPath.replace(/^lib\//, ""));
  } else if (targetPath.startsWith("components/")) {
    // For component imports (like components/ui/upload-zone)
    const componentsDir = useSrcDir ? "src/components" : "components";
    targetFullPath = path.join(
      componentsDir,
      targetPath.replace(/^components\//, "")
    );
  } else if (targetPath.startsWith("app/")) {
    // For app imports (like app/api/upload/route)
    const appDir = useSrcDir ? "src/app" : "app";
    targetFullPath = path.join(appDir, targetPath.replace(/^app\//, ""));
  } else {
    // Default case
    targetFullPath = targetPath;
  }

  const relativePath = path.relative(fromDir, targetFullPath);

  // Ensure forward slashes for imports and add ./ if needed
  const normalizedPath = relativePath.replace(/\\/g, "/");
  return `"${
    normalizedPath.startsWith(".") ? normalizedPath : `./${normalizedPath}`
  }"`;
}

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
  const { rootDir, router, useSrcDir } = projectInfo;

  if (router === "app") {
    const appDir = useSrcDir ? "src/app" : "app";
    await fs.ensureDir(path.join(rootDir, `${appDir}${apiPath}`));
  }

  const libDir = useSrcDir ? "src/lib" : "lib";
  await fs.ensureDir(path.join(rootDir, libDir));

  if (generateExamples) {
    const componentsDir = useSrcDir ? "src/components/ui" : "components/ui";
    await fs.ensureDir(path.join(rootDir, componentsDir));
    if (router === "app") {
      const appDir = useSrcDir ? "src/app" : "app";
      await fs.ensureDir(path.join(rootDir, `${appDir}/upload`));
    }
  }
}

async function createApiRoute(
  projectInfo: ProjectInfo,
  apiPath: string,
  verbose?: boolean
): Promise<void> {
  const { rootDir, router, typescript, useSrcDir } = projectInfo;
  const ext = typescript ? "ts" : "js";

  let filePath: string;
  let content: string;

  if (router === "app") {
    const appDir = useSrcDir ? "src/app" : "app";
    filePath = path.join(rootDir, `${appDir}${apiPath}/route.${ext}`);
    const uploadConfigImport = resolveImportPath(
      projectInfo,
      "lib/upload-config",
      `${appDir}${apiPath}`
    );
    content = `import { s3 } from ${uploadConfigImport}; 

// Define upload routes with proper validation and lifecycle hooks  
const uploadRouter = s3.createRouter({
  // Image upload route with size and format validation
  imageUpload: s3
    .image()
    .maxFileSize("5MB")
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
    .maxFileSize("10MB")
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
export const { GET, POST } = uploadRouter.handlers;
`;
  } else {
    const pagesDir = useSrcDir ? "src/pages" : "pages";
    filePath = path.join(rootDir, `${pagesDir}${apiPath}.${ext}`);
    const importPath = useSrcDir
      ? "../../lib/upload-config"
      : "../lib/upload-config";
    content = `import { s3 } from "${importPath}";

const uploadRouter = s3.createRouter({
      imageUpload: s3.image().maxFileSize("5MB").formats(["jpeg", "jpg", "png", "webp"]),
      fileUpload: s3.file().maxFileSize("10MB").types(["application/pdf", "text/plain", "image/*"]),
});

export type AppUploadRouter = typeof uploadRouter;

export const { GET, POST } = uploadRouter.handlers;
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
  const { rootDir, typescript, useSrcDir } = projectInfo;
  const ext = typescript ? "ts" : "js";
  const libDir = useSrcDir ? "src/lib" : "lib";
  const filePath = path.join(rootDir, `${libDir}/upload-config.${ext}`);

  const providerKey = getProviderConfigKey(provider);
  const envVars = getProviderEnvVars(provider);

  const content = `import { createUploadConfig } from "pushduck/server";

// Initialize upload configuration with simplified one-step process
const { s3, config } = createUploadConfig()
  .provider("${providerKey}", {
    ${envVars}
  })
  .defaults({
    maxFileSize: "10MB",
    acl: "public-read",
  })
  .build();

export { s3, config };
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
  const { rootDir, typescript, router, useSrcDir } = projectInfo;
  const ext = typescript ? "ts" : "js";
  const libDir = useSrcDir ? "src/lib" : "lib";
  const filePath = path.join(rootDir, `${libDir}/upload-client.${ext}`);

  let routePath: string;
  if (router === "app") {
    const appDir = useSrcDir ? "src/app" : "app";
    routePath = resolveImportPath(
      projectInfo,
      `app${apiPath}/route`,
      `${libDir}`
    );
  } else {
    // For pages router, use relative import
    const pagesDir = useSrcDir ? "src/pages" : "pages";
    const relativePath = path.relative(libDir, `${pagesDir}${apiPath}`);
    const normalizedPath = relativePath.replace(/\\/g, "/");
    routePath = `"${
      normalizedPath.startsWith(".") ? normalizedPath : `./${normalizedPath}`
    }"`;
  }

  const content = `/**
 * Enhanced Upload Client with Property-Based Access
 * 
 * This provides type-safe upload functionality with enhanced developer experience.
 */

import { createUploadClient } from "pushduck/client";
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
  const { rootDir, typescript, useSrcDir } = projectInfo;
  const ext = typescript ? "tsx" : "jsx";
  const componentsDir = useSrcDir ? "src/components/ui" : "components/ui";

  // Enhanced Upload Zone with better UX
  const uploadZonePath = path.join(
    rootDir,
    `${componentsDir}/upload-zone.${ext}`
  );
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
  const fileListPath = path.join(rootDir, `${componentsDir}/file-list.${ext}`);
  const fileListContent = `"use client";

import { formatETA, formatUploadSpeed } from "pushduck";

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
  const { rootDir, router, typescript, useSrcDir } = projectInfo;
  const ext = typescript ? "tsx" : "jsx";

  let filePath: string;
  if (router === "app") {
    const appDir = useSrcDir ? "src/app" : "app";
    filePath = path.join(rootDir, `${appDir}/upload/page.${ext}`);
  } else {
    const pagesDir = useSrcDir ? "src/pages" : "pages";
    filePath = path.join(rootDir, `${pagesDir}/upload.${ext}`);
  }

  // Resolve import paths based on tsconfig
  const currentDir =
    router === "app"
      ? useSrcDir
        ? `src/app/upload`
        : `app/upload`
      : useSrcDir
      ? `src/pages`
      : `pages`;

  const uploadClientImport = resolveImportPath(
    projectInfo,
    "lib/upload-client",
    currentDir
  );

  const uploadZoneImport = resolveImportPath(
    projectInfo,
    "components/ui/upload-zone",
    currentDir
  );

  const fileListImport = resolveImportPath(
    projectInfo,
    "components/ui/file-list",
    currentDir
  );

  const content = `"use client";

import { useState } from "react";
import { upload } from ${uploadClientImport};
import { UploadZone } from ${uploadZoneImport};
import { FileList } from ${fileListImport};

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
        
        {/* Image Gallery */}
        {activeTab === "images" &&
          currentUpload.files.filter((f) => f.status === "success" && f.url)
            .length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">
                📸 Uploaded Images
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {currentUpload.files
                  .filter((f) => f.status === "success" && f.url)
                  .map((file) => (
                    <div
                      key={file.id}
                      className="group relative aspect-square border border-gray-200 rounded-lg overflow-hidden bg-gray-50 hover:border-gray-300 transition-colors"
                    >
                      <img
                        src={file.url}
                        alt={file.name}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity" />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                        <p className="text-white text-xs truncate font-medium">
                          {file.name}
                        </p>
                        <p className="text-white/80 text-xs">
                          {(file.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-white rounded-full p-1.5"
                        title="Open full size"
                      >
                        <svg
                          className="w-4 h-4 text-gray-700"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    </div>
                  ))}
              </div>
            </div>
          )}

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

function getProviderConfigKey(provider: ProviderType): string {
  switch (provider) {
    case "aws":
      return "aws";
    case "cloudflare-r2":
      return "cloudflareR2";
    case "digitalocean":
      return "digitalOceanSpaces";
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
      return "region: process.env.AWS_REGION!,\n      bucket: process.env.S3_BUCKET!,\n      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,\n      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,";
    case "cloudflare-r2":
      return "accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,\n      bucket: process.env.R2_BUCKET!,\n      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,\n      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,";
    case "digitalocean":
      return "region: process.env.DO_SPACES_REGION!,\n      bucket: process.env.DO_SPACES_BUCKET!,\n      accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID!,\n      secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY!,";
    case "minio":
      return "endpoint: process.env.MINIO_ENDPOINT!,\n      bucket: process.env.MINIO_BUCKET!,\n      accessKeyId: process.env.MINIO_ACCESS_KEY_ID!,\n      secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY!,\n      region: process.env.MINIO_REGION!,";
    case "gcs":
      return "projectId: process.env.GCS_PROJECT_ID!,\n      bucket: process.env.GCS_BUCKET!,\n      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS!,\n      region: process.env.GCS_REGION!,";
    default:
      return "";
  }
}
