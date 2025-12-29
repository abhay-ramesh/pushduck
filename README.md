# Pushduck - Universal S3 File Upload Library

![Banner](./docs/public/banner.png)

[![NPM Version](https://img.shields.io/npm/v/pushduck?style=flat&colorA=18181B&colorB=374151)](https://www.npmjs.com/package/pushduck)
[![NPM Downloads](https://img.shields.io/npm/dm/pushduck?style=flat&colorA=18181B&colorB=374151)](https://www.npmjs.com/package/pushduck)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/pushduck?style=flat&colorA=18181B&colorB=374151)](https://bundlephobia.com/package/pushduck)
[![GitHub Stars](https://img.shields.io/github/stars/abhay-ramesh/pushduck?style=flat&colorA=18181B&colorB=374151)](https://github.com/abhay-ramesh/pushduck)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat&colorA=18181B&colorB=3178C6)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat&colorA=18181B&colorB=F59E0B)](https://opensource.org/licenses/MIT)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/abhay-ramesh/pushduck/ci.yml?style=flat&colorA=18181B&colorB=374151)](https://github.com/abhay-ramesh/pushduck/actions)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-7289DA?style=flat&colorA=18181B&colorB=7289DA)](https://pushduck.dev/discord)
[![Twitter](https://img.shields.io/badge/Twitter-Share%20on%20Twitter-1DA1F2?style=flat&colorA=18181B&colorB=1DA1F2)](https://twitter.com/intent/tweet?text=Just%20discovered%20%40pushduck%20-%20the%20fastest%20way%20to%20add%20file%20uploads%20to%20any%20web%20app!%20🦆%20https%3A//github.com/abhay-ramesh/pushduck)

**Add file uploads to any web application. Secure, edge-ready.**

Upload files directly to S3-compatible storage with just 3 lines of code. No heavy AWS SDK dependencies - works with Next.js, React, Express, Fastify, and more. Built by [Abhay Ramesh](https://github.com/abhay-ramesh).

## Features

- **Fast** - Optimized bundles with tree-shaking support
- **Lightweight** - No heavy AWS SDK bloat, minimal dependencies
- **Type Safe** - Full TypeScript support with intelligent inference
- **Multi-Provider** - AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO
- **Framework Agnostic** - Next.js, Express, Fastify, and more
- **Modern React** - Hooks and utilities for easy integration
- **Secure** - Presigned URLs, CORS handling, file validation
- **Edge Runtime** - Runs on Vercel Edge, Cloudflare Workers, and more
- **Progress Tracking** - Real-time progress, upload speed, and ETA estimation
- **Lifecycle Callbacks** - Complete upload control with `onStart`, `onProgress`, `onSuccess`, and `onError`
- **Storage Operations** - Complete file management API (list, delete, metadata)
- **CLI Tools** - Interactive setup and project scaffolding
- **Production Ready** - Used in production by many applications

## Quick Start

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

### Manual Setup (3 Steps)

**Step 1: Create API Route** (`app/api/upload/route.ts`)

```typescript
import { createUploadConfig } from "pushduck/server";

const { s3 } = createUploadConfig()
  .provider("aws", {
    bucket: process.env.AWS_BUCKET_NAME!,
    region: process.env.AWS_REGION!,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  })
  .build();

const router = s3.createRouter({
  imageUpload: s3.image().maxFileSize('5MB'),
});

export const { GET, POST } = router.handlers;
export type AppRouter = typeof router;
```

**Step 2: Create Upload Client** (`lib/upload-client.ts`)

```tsx
import { createUploadClient } from "pushduck/client";
import type { AppRouter } from "@/app/api/upload/route";

export const upload = createUploadClient<AppRouter>({
  endpoint: "/api/upload"
});
```

**Step 3: Use in Component** (`app/upload.tsx`)

```tsx
"use client";
import { upload } from "@/lib/upload-client";

export default function Upload() {
  const { uploadFiles, files, isUploading } = upload.imageUpload();

  return (
    <div>
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
        disabled={isUploading}
      />

      {files.map((file) => (
        <div key={file.id}>
          {file.name} - {file.progress}%
          {file.status === "success" && <img src={file.url} alt={file.name} />}
        </div>
      ))}
    </div>
  );
}
```

**Done!** 3 files, ~50 lines of code, production-ready uploads.

## Advanced Features

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

## Documentation

- **[Getting Started](https://pushduck.dev/docs/quick-start)** - Complete setup guide
- **[Philosophy & Scope](https://pushduck.dev/docs/philosophy)** - What we do (and don't do)
- **[API Reference](https://pushduck.dev/docs/api)** - Full API documentation
- **[Examples](https://pushduck.dev/docs/examples)** - Real-world examples
- **[Providers](https://pushduck.dev/docs/providers)** - S3, R2, Spaces, MinIO
- **[Security](https://pushduck.dev/docs/guides/security)** - Security best practices
- **[CLI Guide](https://pushduck.dev/docs/api/cli)** - CLI commands and usage

## Why Pushduck?

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
// 3 lines of code + lightweight (no heavy AWS SDK)
const { uploadFiles } = upload.imageUpload();
await uploadFiles(selectedFiles);
```

## Lightweight Architecture

Unlike other solutions that bundle the entire AWS SDK (2MB+), Pushduck uses **[aws4fetch](https://github.com/mhart/aws4fetch)** - a tiny, zero-dependency AWS request signer that works everywhere:

- **Tiny Bundle** - Only 1 dependency, works on edge runtimes
- **Zero Dependencies** - `aws4fetch` has no dependencies itself
- **Edge Compatible** - Runs on Vercel Edge, Cloudflare Workers, Deno Deploy
- **Modern Fetch** - Uses native `fetch()` API, no legacy HTTP clients
- **Tree Shakeable** - Only import what you need

```typescript
// What you get with Pushduck
import { createUploadConfig } from "pushduck/server"; // ~5KB
// vs other solutions
import { S3Client } from "@aws-sdk/client-s3"; // ~500KB+
```

## Architecture

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

## Advanced Usage

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
      console.log(`Upload complete: ${file.name} -> ${url}`);
    },
  })
  .build();

const router = s3.createRouter({
  imageUpload: s3
    .image()
    .maxFileSize("5MB")
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

## Framework Support

Pushduck works with all major frameworks:

- **Next.js** - App Router, Pages Router
- **Express** - RESTful APIs
- **Fastify** - High-performance APIs
- **Remix** - Full-stack React
- **SvelteKit** - Svelte applications
- **Nuxt** - Vue applications
- **Astro** - Static site generation
- **Hono** - Edge runtime APIs

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| `pushduck` | Core library | ![NPM Version](https://img.shields.io/npm/v/pushduck) |
| `@pushduck/cli` | CLI tools | ![NPM Version](https://img.shields.io/npm/v/@pushduck/cli) |
| `@pushduck/ui` | React components | ![NPM Version](https://img.shields.io/npm/v/@pushduck/ui) |

## Contributing

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

## License

MIT © [Abhay Ramesh](https://github.com/abhay-ramesh)

## Acknowledgments

Built using:

- [TypeScript](https://www.typescriptlang.org/)
- [aws4fetch](https://github.com/mhart/aws4fetch) - Lightweight AWS signing (the secret sauce!)

## Support

- **Star us on GitHub** — it helps!
- **Report bugs** — [Create an issue](https://github.com/abhay-ramesh/pushduck/issues)
- **Request features** — [Start a discussion](https://github.com/abhay-ramesh/pushduck/discussions)
- **Contact** — [ramesh.abhay14@gmail.com](ramesh.abhay14@gmail.com)

---

<div align="center">
  <strong>Built by the Pushduck team</strong>
  <br>
  <a href="https://github.com/abhay-ramesh/pushduck">GitHub</a> •
  <a href="https://pushduck.dev">Documentation</a> •
  <a href="https://pushduck.dev/discord">Discord</a> •
  <a href="https://twitter.com/abhayramesh">Twitter</a>
</div>
