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

  // Create necessary directories
  await ensureDirectories(projectInfo, apiPath, generateExamples);

  // Generate API route
  await generateApiRoute(projectInfo, apiPath, verbose);

  // Generate upload configuration
  await generateUploadConfig(projectInfo, provider, credentials, verbose);

  // Generate UI components if requested
  if (generateExamples) {
    await generateComponents(projectInfo, verbose);
    await generateExamplePage(projectInfo, apiPath, verbose);
  }

  // Update environment variables
  await updateEnvFile(projectInfo, provider, credentials, verbose);

  // Generate utils if needed
  if (projectInfo.cssFramework === "tailwind") {
    await generateUtilsFile(projectInfo, verbose);
  }
}

async function ensureDirectories(
  projectInfo: ProjectInfo,
  apiPath: string,
  generateExamples: boolean
): Promise<void> {
  const { rootDir, router } = projectInfo;

  // API route directory
  const apiDir =
    router === "app"
      ? path.join(rootDir, `app${apiPath}`)
      : path.join(rootDir, `pages${apiPath}.ts`).replace(".ts", "");

  await fs.ensureDir(apiDir);

  // Config directory
  await fs.ensureDir(path.join(rootDir, "lib"));

  if (generateExamples) {
    // Components directory
    await fs.ensureDir(path.join(rootDir, "components/ui"));

    // Example page directory
    if (router === "app") {
      await fs.ensureDir(path.join(rootDir, "app/upload"));
    }
  }
}

async function generateApiRoute(
  projectInfo: ProjectInfo,
  apiPath: string,
  verbose?: boolean
): Promise<void> {
  const { rootDir, router, typescript } = projectInfo;
  const ext = typescript ? "ts" : "js";

  let filePath: string;
  let template: string;

  if (router === "app") {
    filePath = path.join(rootDir, `app${apiPath}/route.${ext}`);
    template = getAppRouterTemplate(typescript);
  } else {
    filePath = path.join(rootDir, `pages${apiPath}.${ext}`);
    template = getPagesRouterTemplate(typescript);
  }

  await fs.writeFile(filePath, template);

  if (verbose) {
    console.log(chalk.gray(`  Created: ${path.relative(rootDir, filePath)}`));
  }
}

async function generateUploadConfig(
  projectInfo: ProjectInfo,
  provider: ProviderType,
  credentials: ProviderCredentials,
  verbose?: boolean
): Promise<void> {
  const { rootDir, typescript } = projectInfo;
  const ext = typescript ? "ts" : "js";
  const filePath = path.join(rootDir, `lib/upload-config.${ext}`);

  const template = getUploadConfigTemplate(provider, typescript);

  await fs.writeFile(filePath, template);

  if (verbose) {
    console.log(chalk.gray(`  Created: ${path.relative(rootDir, filePath)}`));
  }
}

async function generateComponents(
  projectInfo: ProjectInfo,
  verbose?: boolean
): Promise<void> {
  const { rootDir, typescript, cssFramework } = projectInfo;
  const ext = typescript ? "tsx" : "jsx";

  // Upload Zone component
  const uploadZonePath = path.join(rootDir, `components/ui/upload-zone.${ext}`);
  const uploadZoneTemplate = getUploadZoneTemplate(typescript, cssFramework);
  await fs.writeFile(uploadZonePath, uploadZoneTemplate);

  // File List component
  const fileListPath = path.join(rootDir, `components/ui/file-list.${ext}`);
  const fileListTemplate = getFileListTemplate(typescript, cssFramework);
  await fs.writeFile(fileListPath, fileListTemplate);

  if (verbose) {
    console.log(
      chalk.gray(`  Created: ${path.relative(rootDir, uploadZonePath)}`)
    );
    console.log(
      chalk.gray(`  Created: ${path.relative(rootDir, fileListPath)}`)
    );
  }
}

async function generateExamplePage(
  projectInfo: ProjectInfo,
  apiPath: string,
  verbose?: boolean
): Promise<void> {
  const { rootDir, router, typescript, cssFramework } = projectInfo;
  const ext = typescript ? "tsx" : "jsx";

  let filePath: string;

  if (router === "app") {
    filePath = path.join(rootDir, `app/upload/page.${ext}`);
  } else {
    filePath = path.join(rootDir, `pages/upload.${ext}`);
  }

  const template = getExamplePageTemplate(typescript, cssFramework, router);
  await fs.writeFile(filePath, template);

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

  let existingEnv = "";
  if (await fs.pathExists(envPath)) {
    existingEnv = await fs.readFile(envPath, "utf-8");
  }

  // Add new variables, avoiding duplicates
  let newContent = existingEnv;

  if (
    !newContent.includes("# AWS S3 Configuration") &&
    !newContent.includes("# Upload Configuration")
  ) {
    newContent += "\n# Upload Configuration\n";
  }

  Object.entries(envVars).forEach(([key, value]) => {
    const envLine = `${key}=${value}`;
    if (!newContent.includes(`${key}=`)) {
      newContent += `${envLine}\n`;
    }
  });

  await fs.writeFile(envPath, newContent);

  if (verbose) {
    console.log(chalk.gray(`  Updated: .env.local`));
  }
}

async function generateUtilsFile(
  projectInfo: ProjectInfo,
  verbose?: boolean
): Promise<void> {
  const { rootDir, typescript } = projectInfo;
  const ext = typescript ? "ts" : "js";
  const filePath = path.join(rootDir, `lib/utils.${ext}`);

  // Only create if it doesn't exist
  if (await fs.pathExists(filePath)) {
    return;
  }

  const template = getCnUtilsTemplate(typescript);
  await fs.writeFile(filePath, template);

  if (verbose) {
    console.log(chalk.gray(`  Created: ${path.relative(rootDir, filePath)}`));
  }
}

// Template functions
function getAppRouterTemplate(typescript: boolean): string {
  return `import { createS3Handler } from "next-s3-uploader/server";
import { uploadRouter } from "@/lib/upload-config";

// Export the handler for App Router
export const { GET, POST } = createS3Handler(uploadRouter);

// Optional: Add custom configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
`;
}

function getPagesRouterTemplate(typescript: boolean): string {
  const type = typescript ? ": NextApiRequest, res: NextApiResponse" : "";

  return `import { createS3Handler } from "next-s3-uploader/server";
import { uploadRouter } from "../lib/upload-config";
${
  typescript
    ? 'import type { NextApiRequest, NextApiResponse } from "next";'
    : ""
}

const handler = createS3Handler(uploadRouter);

export default function uploadApi(req${type}) {
  return handler(req, res);
}
`;
}

function getUploadConfigTemplate(
  provider: ProviderType,
  typescript: boolean
): string {
  const importType = typescript
    ? '\nimport type { UploadRouter as BaseUploadRouter } from "next-s3-uploader/server";'
    : "";
  const exportType = typescript
    ? "\nexport type UploadRouter = typeof uploadRouter;"
    : "";

  const providerConfig = getProviderConfigForTemplate(provider);

  return `import { 
  createS3Router, 
  uploadConfig, 
  initializeUploadConfig 
} from "next-s3-uploader/server";${importType}

// Define your upload routes with validation
const uploadRouter = createS3Router({
  // General file upload
  fileUpload: uploadConfig
    ${providerConfig}
    .file()
    .maxSize("10MB")
    .allowedTypes([
      "image/*",           // All image types
      "application/pdf",   // PDF documents  
      "text/*",           // Text files
    ])
    .middleware(async ({ req }) => {
      // Add authentication here if needed
      // const user = await authenticate(req);
      // return { userId: user.id };
      return {};
    })
    .onUploadComplete(async ({ file, metadata }) => {
      console.log("Upload completed:", file.key);
      // Add database save, notifications, etc.
    })
    .build(),

  // Image-specific upload
  imageUpload: uploadConfig
    ${providerConfig}
    .image()
    .maxSize("5MB")
    .allowedTypes(["image/jpeg", "image/png", "image/webp"])
    .build(),
});

// Initialize the upload system
const { s3, createS3Handler } = initializeUploadConfig({
  provider: uploadConfig.${provider.replace("-", "")}({
    ${getProviderEnvVars(provider)}
  }).build()
});

export { uploadRouter, s3, createS3Handler };${exportType}
`;
}

function getProviderConfigForTemplate(provider: ProviderType): string {
  const method = provider.replace("-", "");
  return `.${method}({
      ${getProviderEnvVars(provider)}
    })`;
}

function getProviderEnvVars(provider: ProviderType): string {
  switch (provider) {
    case "aws":
      return `region: process.env.AWS_REGION!,
      bucket: process.env.S3_BUCKET!,`;
    case "cloudflare-r2":
      return `accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
      bucket: process.env.R2_BUCKET!,`;
    case "digitalocean":
      return `region: process.env.DO_SPACES_REGION!,
      bucket: process.env.DO_SPACES_BUCKET!,`;
    case "minio":
      return `endpoint: process.env.MINIO_ENDPOINT!,
      bucket: process.env.MINIO_BUCKET!,`;
    case "gcs":
      return `projectId: process.env.GCS_PROJECT_ID!,
      bucket: process.env.GCS_BUCKET!,`;
    default:
      return "";
  }
}

function getUploadZoneTemplate(
  typescript: boolean,
  cssFramework: string
): string {
  const typeImports = typescript
    ? `
interface UploadZoneProps {
  onDrop: (files: File[]) => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}`
    : "";

  const props = typescript ? ": UploadZoneProps" : "";
  const cnImport =
    cssFramework === "tailwind" ? 'import { cn } from "@/lib/utils";' : "";
  const cnUsage = cssFramework === "tailwind" ? "cn(" : "";
  const cnClose = cssFramework === "tailwind" ? ")" : "";

  return `"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X } from "lucide-react";
${cnImport}${typeImports}

export function UploadZone({
  onDrop,
  accept,
  maxSize = 10 * 1024 * 1024, // 10MB default
  maxFiles = 5,
  disabled = false,
  className,
  children,
}${props}) {
  const handleDrop = useCallback((acceptedFiles${
    typescript ? ": File[]" : ""
  }) => {
    onDrop(acceptedFiles);
  }, [onDrop]);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    fileRejections,
  } = useDropzone({
    onDrop: handleDrop,
    accept,
    maxSize,
    maxFiles,
    disabled,
  });

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={${cnUsage}\`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 \${
          isDragActive && !isDragReject
            ? "border-blue-500 bg-blue-50"
            : isDragReject
            ? "border-red-500 bg-red-50"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
        } \${disabled ? "opacity-50 cursor-not-allowed" : ""} \${className || ""}\`${cnClose}}
      >
        <input {...getInputProps()} />
        
        {children || (
          <div className="flex flex-col gap-2 items-center">
            <Upload className="w-10 h-10 text-gray-400" />
            <div>
              <p className="text-lg font-medium">
                {isDragActive
                  ? isDragReject
                    ? "File type not supported"
                    : "Drop files here"
                  : "Drag & drop files or click to browse"}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Maximum {maxFiles} files, up to {Math.round(maxSize / 1024 / 1024)}MB each
              </p>
            </div>
          </div>
        )}
      </div>

      {fileRejections.length > 0 && (
        <div className="mt-4 space-y-2">
          {fileRejections.map(({ file, errors }) => (
            <div
              key={file.name}
              className="flex gap-2 items-center p-2 text-sm text-red-600 bg-red-50 rounded"
            >
              <X className="w-4 h-4" />
              <span className="font-medium">{file.name}</span>
              <span>-</span>
              <span>{errors[0]?.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
`;
}

function getFileListTemplate(
  typescript: boolean,
  cssFramework: string
): string {
  const typeImports = typescript
    ? `
interface FileListProps {
  files: Array<{
    id: string;
    name: string;
    size: number;
    progress: number;
    status: "pending" | "uploading" | "success" | "error";
    error?: string;
    url?: string;
  }>;
  className?: string;
}`
    : "";

  const props = typescript ? ": FileListProps" : "";
  const cnImport =
    cssFramework === "tailwind" ? 'import { cn } from "@/lib/utils";' : "";

  return `"use client";

import { CheckCircle, XCircle, Loader2, File } from "lucide-react";
${cnImport}${typeImports}

export function FileList({ files, className }${props}) {
  if (files.length === 0) return null;

  const formatFileSize = (bytes${typescript ? ": number" : ""}) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatusIcon = (status${typescript ? ": string" : ""}) => {
    switch (status) {
      case "uploading":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <File className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className={\`space-y-2 \${className || ""}\`}>
      <h3 className="text-sm font-medium text-gray-500">
        Upload Progress
      </h3>
      
      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex gap-3 items-center p-3 bg-white rounded-lg border"
          >
            {getStatusIcon(file.status)}
            
            <div className="flex-1 min-w-0">
              <div className="flex gap-2 justify-between items-center">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <span className="text-xs text-gray-500">
                  {formatFileSize(file.size)}
                </span>
              </div>
              
              {file.status === "uploading" && (
                <div className="mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: \`\${file.progress}%\` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {file.progress}% complete
                  </p>
                </div>
              )}
              
              {file.status === "error" && file.error && (
                <p className="mt-1 text-xs text-red-600">{file.error}</p>
              )}
              
              {file.status === "success" && file.url && (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1 text-xs text-blue-600 hover:underline"
                >
                  View file
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
`;
}

function getExamplePageTemplate(
  typescript: boolean,
  cssFramework: string,
  router: string
): string {
  const typeImport = typescript
    ? '\nimport type { UploadRouter } from "@/lib/upload-config";'
    : "";
  const typeGeneric = typescript ? "<UploadRouter>" : "";

  return `"use client";

import { useS3Upload } from "next-s3-uploader";
import { UploadZone } from "@/components/ui/upload-zone";
import { FileList } from "@/components/ui/file-list";${typeImport}

export default function UploadPage() {
  const { uploadFiles, files, isUploading, reset } = useS3Upload${typeGeneric}("fileUpload");

  const handleDrop = async (newFiles${typescript ? ": File[]" : ""}) => {
    try {
      await uploadFiles(newFiles);
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  return (
    <div className="container px-4 py-8 mx-auto max-w-4xl">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">File Upload</h1>
          <p className="mt-2 text-gray-600">
            Upload your files securely to the cloud. Supports images, PDFs, and text files up to 10MB.
          </p>
        </div>

        <UploadZone
          onDrop={handleDrop}
          accept={{
            "image/*": [".jpeg", ".jpg", ".png", ".webp"],
            "application/pdf": [".pdf"],
            "text/*": [".txt", ".md", ".csv"],
          }}
          maxSize={10 * 1024 * 1024} // 10MB
          maxFiles={5}
          disabled={isUploading}
          className="min-h-[200px]"
        />

        <FileList files={files} />

        {files.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Clear All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
`;
}

function getCnUtilsTemplate(typescript: boolean): string {
  const types = typescript ? '\nimport type { ClassValue } from "clsx";' : "";
  const returnType = typescript ? ": string" : "";
  const paramType = typescript ? "ClassValue[]" : "";

  return `import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";${types}

export function cn(...inputs${
    typescript ? `: ${paramType}` : ""
  })${returnType} {
  return twMerge(clsx(inputs));
}
`;
}
