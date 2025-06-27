![Banner](./docs/public/banner.png)

# 🦆 Pushduck - Universal S3 File Upload Library

[![NPM Version](https://img.shields.io/npm/v/pushduck)](https://www.npmjs.com/package/pushduck)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/pushduck)](https://bundlephobia.com/package/pushduck)
[![GitHub Stars](https://img.shields.io/github/stars/abhay-ramesh/pushduck)](https://github.com/abhay-ramesh/pushduck)

**The fastest way to add file uploads to any web application. Enterprise security, edge-ready.**

Upload files directly to S3-compatible storage with just 3 lines of code. No heavy AWS SDK dependencies - works with Next.js, React, Express, Fastify, and more. Built by [Abhay Ramesh](https://github.com/abhay-ramesh).

## ✨ Features

- 🚀 **Lightning Fast** - Optimized bundles with tree-shaking support
- 🪶 **Ultra Lightweight** - No heavy AWS SDK bloat, minimal dependencies
- 🎯 **Type Safe** - Full TypeScript support with intelligent inference
- ☁️ **Multi-Provider** - AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO
- 🎨 **Framework Agnostic** - Next.js, Express, Fastify, and more
- 📱 **Modern React** - Hooks and utilities for seamless integration
- 🔒 **Enterprise Security** - Presigned URLs, CORS handling, file validation
- 🌍 **Edge Runtime** - Runs on Vercel Edge, Cloudflare Workers, and more
- 📊 **Progress Tracking** - Real-time progress, upload speed, and ETA estimation
- 🗄️ **Storage Operations** - Complete file management API (list, delete, metadata)
- 🛠️ **CLI Tools** - Interactive setup and project scaffolding
- 🛡️ **Production Ready** - Used by thousands of applications

## 🚀 Quick Start

### Installation

```bash
# Install the core package
npm install pushduck
# or
pnpm add pushduck
# or
yarn add pushduck

# Optional: Install CLI for easy setup
npm install -g @pushduck/cli
pnpm add -g @pushduck/cli
```

### Quick Setup with CLI

```bash
# Interactive setup (recommended)
npx @pushduck/cli@latest init

# Add upload route to existing project
npx @pushduck/cli add-route

# Test your S3 connection
npx @pushduck/cli test
```

### Manual Setup

#### 1. Configure Your Storage (Server)

```typescript
// lib/upload.ts
import { createUploadConfig } from "pushduck/server";

const { s3 } = createUploadConfig()
  .provider("aws", {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION!,
    bucket: process.env.AWS_S3_BUCKET_NAME!,
  })
  .build();

export { s3 };
```

```typescript
// app/api/upload/route.ts
import { s3 } from "@/lib/upload";

const router = s3.createRouter({
  imageUpload: s3
    .image()
    .max("5MB")
    .formats(["jpeg", "jpg", "png", "webp"])
    .middleware(async ({ file, metadata }) => {
      // Add authentication and user context
      return {
        ...metadata,
        userId: "user-123",
        uploadedAt: new Date().toISOString(),
      };
    }),

  documentUpload: s3
    .file()
    .max("10MB")
    .types(["application/pdf", "text/plain"])
    .paths({
      prefix: "documents",
    }),
});

export const { GET, POST } = router.handlers;
export type AppRouter = typeof router;
```

#### 2. Create Upload Client

```typescript
// lib/upload-client.ts
import { createUploadClient } from "pushduck/client";
import type { AppRouter } from "@/app/api/upload/route";

export const upload = createUploadClient<AppRouter>({
  endpoint: "/api/upload",
});
```

#### 3. Upload Files (Client)

```tsx
"use client";
import { upload } from "@/lib/upload-client";
import { formatETA, formatUploadSpeed } from "pushduck";

export default function FileUpload() {
  const { 
    uploadFiles, 
    files, 
    isUploading, 
    errors 
  } = upload.imageUpload();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      await uploadFiles(Array.from(selectedFiles));
    }
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileSelect}
        disabled={isUploading}
        className="file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
      />

      {isUploading && (
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-600">Uploading files...</span>
        </div>
      )}

      {errors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{errors.join(", ")}</p>
        </div>
      )}

      {files.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {files.map((file) => (
            <div key={file.id} className="space-y-2">
              <img
                src={file.url}
                alt="Uploaded image"
                className="w-full h-32 object-cover rounded-lg border"
              />
              <p className="text-xs text-gray-500 truncate">{file.name}</p>
              
              {/* Individual file progress with speed and ETA */}
              {file.status === "uploading" && (
                <div className="space-y-1">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{file.progress}%</span>
                    <div className="flex gap-2">
                      {file.uploadSpeed && (
                        <span>{formatUploadSpeed(file.uploadSpeed)}</span>
                      )}
                      {file.eta && file.eta > 0 && (
                        <span>ETA: {formatETA(file.eta)}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {file.status === "error" && (
                <p className="text-xs text-red-500">{file.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

That's it! Your files are now uploading directly to S3 with enterprise-grade security.

## 📊 Advanced Features

### Storage Operations API

```typescript
import { storage } from "pushduck/storage";

// List files with filtering
const files = await storage.list.files({
  prefix: "uploads/",
  maxResults: 50,
  sortBy: "lastModified"
});

// Get file metadata
const fileInfo = await storage.metadata.getInfo("uploads/image.jpg");
console.log(fileInfo.size, fileInfo.lastModified, fileInfo.contentType);

// Delete operations
await storage.delete.file("uploads/old-file.jpg");
await storage.delete.byPrefix("temp/"); // Delete all files with prefix
await storage.delete.files(["file1.jpg", "file2.pdf"]); // Batch delete

// Generate download URLs
const downloadUrl = await storage.download.presignedUrl("uploads/document.pdf", 3600);

// Advanced listing with pagination
for await (const batch of storage.list.paginatedGenerator({ maxResults: 100 })) {
  console.log(`Processing ${batch.files.length} files`);
  // Process large datasets efficiently
}

// Filter by file properties
const images = await storage.list.byExtension("jpg", "photos/");
const largeFiles = await storage.list.bySize(1024 * 1024); // Files > 1MB
const recentFiles = await storage.list.byDate(new Date("2024-01-01"));
```

## 📚 Documentation

- **[Getting Started](https://pushduck.dev/docs/quick-start)** - Complete setup guide
- **[API Reference](https://pushduck.dev/docs/api)** - Full API documentation
- **[Examples](https://pushduck.dev/docs/examples)** - Real-world examples
- **[Providers](https://pushduck.dev/docs/providers)** - S3, R2, Spaces, MinIO
- **[Security](https://pushduck.dev/docs/security)** - Security best practices
- **[CLI Guide](https://pushduck.dev/docs/cli)** - CLI commands and usage

## 🎯 Why Pushduck?

### Before Pushduck

```typescript
// 200+ lines of boilerplate code
// Heavy AWS SDK dependencies (2MB+ bundle size)
// Manual presigned URL generation
// CORS configuration headaches  
// Security vulnerabilities
// Framework-specific implementations
```

### After Pushduck

```typescript
// 3 lines of code + ultra-lightweight (no heavy AWS SDK)
const { uploadFiles } = upload.imageUpload();
await uploadFiles(selectedFiles);
```

## 🪶 Ultra Lightweight Architecture

Unlike other solutions that bundle the entire AWS SDK (2MB+), Pushduck uses **[aws4fetch](https://github.com/mhart/aws4fetch)** - a tiny, zero-dependency AWS request signer that works everywhere:

- ✅ **Tiny Bundle** - Only 1 dependency, works on edge runtimes
- ✅ **Zero Dependencies** - `aws4fetch` has no dependencies itself
- ✅ **Edge Compatible** - Runs on Vercel Edge, Cloudflare Workers, Deno Deploy
- ✅ **Modern Fetch** - Uses native `fetch()` API, no legacy HTTP clients
- ✅ **Tree Shakeable** - Only import what you need

```typescript
// What you get with Pushduck
import { createUploadConfig } from "pushduck/server"; // ~5KB
// vs other solutions
import { S3Client } from "@aws-sdk/client-s3"; // ~500KB+
```

## 🏗️ Architecture

Pushduck follows a **secure-by-default** architecture:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Your Client   │    │   Your Server   │    │   S3 Storage    │
│                 │    │                 │    │                 │
│ 1. Select File  │───▶│ 2. Generate     │───▶│ 3. Direct       │
│                 │    │    Presigned    │    │    Upload       │
│ 4. Upload to S3 │◀───│    URL          │    │                 │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

- **Client** never sees your AWS credentials
- **Server** generates secure, time-limited upload URLs
- **Files** upload directly to S3 (no server bandwidth used)
- **Edge Compatible** - runs anywhere modern JavaScript runs

## 🔧 Advanced Usage

### Custom Configuration

```typescript
import { createUploadConfig } from "pushduck/server";

const { s3 } = createUploadConfig()
  .provider("aws", {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION!,
    bucket: process.env.AWS_S3_BUCKET_NAME!,
  })
  .defaults({
    maxFileSize: "10MB",
    acl: "public-read",
  })
  .paths({
    prefix: "uploads",
    generateKey: (file, metadata) => {
      const userId = metadata.userId || "anonymous";
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      return `${userId}/${timestamp}/${randomId}/${file.name}`;
    },
  })
  .security({
    allowedOrigins: ["https://yourdomain.com"],
    rateLimiting: {
      maxUploads: 10,
      windowMs: 60000, // 1 minute
    },
  })
  .hooks({
    onUploadComplete: async ({ file, url, metadata }) => {
      // Save to database, send notifications, etc.
      console.log(`✅ Upload complete: ${file.name} -> ${url}`);
    },
  })
  .build();

const router = s3.createRouter({
  imageUpload: s3
    .image()
    .max("5MB")
    .formats(["jpeg", "jpg", "png", "webp"])
    .middleware(async ({ file, metadata }) => {
      // Add authentication and user context
      const user = await authenticateUser(req);
      return {
        ...metadata,
        userId: user.id,
        uploadedAt: new Date().toISOString(),
      };
    }),
});
```

### Framework Adapters

```typescript
// Next.js App Router (default)
import { createUploadConfig } from "pushduck/server";

// Next.js Pages Router
import { createUploadConfig } from "pushduck/adapters/nextjs-pages";

// Express
import { createUploadConfig } from "pushduck/adapters/express";

// Fastify
import { createUploadConfig } from "pushduck/adapters/fastify";
```

### Multiple Providers

```typescript
// AWS S3
const { s3: awsS3 } = createUploadConfig()
  .provider("aws", {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION!,
    bucket: process.env.AWS_S3_BUCKET_NAME!,
  })
  .build();

// Cloudflare R2 (S3-compatible)
const { s3: r2S3 } = createUploadConfig()
  .provider("cloudflareR2", {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY!,
    bucket: process.env.CLOUDFLARE_BUCKET_NAME!,
    region: "auto",
  })
  .build();

// DigitalOcean Spaces (S3-compatible)
const { s3: spacesS3 } = createUploadConfig()
  .provider("digitalOceanSpaces", {
    accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID!,
    secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY!,
    region: process.env.DO_SPACES_REGION!,
    bucket: process.env.DO_SPACES_BUCKET_NAME!,
  })
  .build();

// MinIO (S3-compatible)
const { s3: minioS3 } = createUploadConfig()
  .provider("minio", {
    endpoint: process.env.MINIO_ENDPOINT!,
    accessKeyId: process.env.MINIO_ACCESS_KEY_ID!,
    secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY!,
    bucket: process.env.MINIO_BUCKET_NAME!,
    useSSL: false,
  })
  .build();
```

## 🚀 Framework Support

Pushduck works with all major frameworks:

- **Next.js** - App Router, Pages Router
- **Express** - RESTful APIs
- **Fastify** - High-performance APIs
- **Remix** - Full-stack React
- **SvelteKit** - Svelte applications
- **Nuxt** - Vue applications
- **Astro** - Static site generation
- **Hono** - Edge runtime APIs

## 📦 Packages

| Package | Description | Version |
|---------|-------------|---------|
| `pushduck` | Core library | ![NPM Version](https://img.shields.io/npm/v/pushduck) |
| `@pushduck/cli` | CLI tools | ![NPM Version](https://img.shields.io/npm/v/@pushduck/cli) |
| `@pushduck/ui` | React components | ![NPM Version](https://img.shields.io/npm/v/@pushduck/ui) |

## 🤝 Contributing

We love contributions! Please read our [Contributing Guide](CONTRIBUTING.md) to get started.

### Quick Setup

```bash
git clone https://github.com/abhay-ramesh/pushduck.git
cd pushduck
pnpm install
pnpm dev
```

### Development Scripts

```bash
pnpm dev              # Start development servers
pnpm build            # Build all packages
pnpm test             # Run test suite
pnpm lint             # Lint code
pnpm type-check       # TypeScript type checking
pnpm format           # Format code with Prettier
```

## 📄 License

MIT © [Abhay Ramesh](https://github.com/abhay-ramesh)

## 🙏 Acknowledgments

Built with ❤️ using:

- [TypeScript](https://www.typescriptlang.org/)
- [aws4fetch](https://github.com/mhart/aws4fetch) - Lightweight AWS signing (the secret sauce!)

## 🌟 Support

- ⭐ **Star us on GitHub** — it helps!
- 🐛 **Report bugs** — [Create an issue](https://github.com/abhay-ramesh/pushduck/issues)
- 💡 **Request features** — [Start a discussion](https://github.com/abhay-ramesh/pushduck/discussions)
- 📧 **Contact** — [abhayramesh@duck.com](mailto:abhayramesh@duck.com)

---

<div align="center">
  <strong>🦆 Made with love by the Pushduck team</strong>
  <br>
  <a href="https://github.com/abhay-ramesh/pushduck">GitHub</a> •
  <a href="https://pushduck.dev">Documentation</a> •
  <a href="https://twitter.com/abhayramesh">Twitter</a>
</div>
