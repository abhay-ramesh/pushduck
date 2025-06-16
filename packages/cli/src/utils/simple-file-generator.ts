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
  await updateEnvFile(projectInfo, provider, credentials, verbose);

  if (generateExamples) {
    await createComponents(projectInfo, verbose);
    await createExamplePage(projectInfo, verbose);
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

export type UploadRouter = typeof uploadRouter;
export const { GET, POST } = createS3Handler(uploadRouter);
`;
  } else {
    filePath = path.join(rootDir, `pages${apiPath}.${ext}`);
    content = `import { s3, createS3Handler } from "../lib/upload-config";

const uploadRouter = s3.createRouter({
  imageUpload: s3.image().max("5MB").formats(["jpeg", "jpg", "png", "webp"]),
  fileUpload: s3.file().max("10MB").types(["application/pdf", "text/plain", "image/*"]),
});

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
  const typeExport = "";

  const content = `import { initializeUploadConfig, uploadConfig } from "next-s3-uploader/server";

// Initialize upload configuration and get configured instances
const { s3, createS3Handler } = initializeUploadConfig(
  uploadConfig
    .${providerMethod}({
      ${envVars}
    })
    .defaults({
      maxFileSize: "10MB",
      acl: "public-read",
    })
    .build()
);

export { s3, createS3Handler };${typeExport}
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

  // Upload Zone
  const uploadZonePath = path.join(rootDir, `components/ui/upload-zone.${ext}`);
  const uploadZoneContent = `"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

export function UploadZone({ onDrop, disabled, className }) {
  const handleDrop = useCallback((files) => onDrop(files), [onDrop]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={\`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer \${
        isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
      } \${disabled ? "opacity-50" : ""} \${className || ""}\`}
    >
      <input {...getInputProps()} />
      <p className="text-lg">
        {isDragActive ? "Drop files here" : "Drag & drop files or click"}
      </p>
    </div>
  );
}
`;

  await fs.writeFile(uploadZonePath, uploadZoneContent);

  // File List
  const fileListPath = path.join(rootDir, `components/ui/file-list.${ext}`);
  const fileListContent = `"use client";

export function FileList({ files }) {
  if (!files.length) return null;

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div key={file.id} className="flex justify-between p-2 rounded border">
          <span>{file.name}</span>
          <span>{file.progress}%</span>
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
  verbose?: boolean
): Promise<void> {
  const { rootDir, router, typescript } = projectInfo;
  const ext = typescript ? "tsx" : "jsx";

  const filePath =
    router === "app"
      ? path.join(rootDir, `app/upload/page.${ext}`)
      : path.join(rootDir, `pages/upload.${ext}`);

  const content = `"use client";

import { useS3Upload } from "next-s3-uploader";
import { UploadZone } from "@/components/ui/upload-zone";
import { FileList } from "@/components/ui/file-list";

export default function UploadPage() {
  const { uploadFiles, files, isUploading } = useS3Upload("fileUpload");

  return (
    <div className="container px-4 py-8 mx-auto">
      <h1 className="mb-6 text-2xl font-bold">File Upload</h1>
      
      <UploadZone
        onDrop={uploadFiles}
        disabled={isUploading}
        className="mb-6"
      />
      
      <FileList files={files} />
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
