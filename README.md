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

## Stop writing S3 boilerplate

<table>
<tr>
<td width="50%" valign="top">

**❌ Without Pushduck**

```tsx
// app/api/upload/route.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
// (~500KB added to your bundle)

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: Request) {
  const { filename, contentType } = await req.json();
  if (!["image/jpeg", "image/png"].includes(contentType))
    return Response.json({ error: "Invalid type" }, { status: 400 });

  const url = await getSignedUrl(s3,
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: `uploads/${Date.now()}-${filename}`,
      ContentType: contentType,
    }),
    { expiresIn: 3600 }
  );
  return Response.json({ url });
}

// app/upload.tsx
"use client";
import { useState } from "react";

type FileState = {
  file: File;
  progress: number;
  status: "idle" | "uploading" | "success" | "error";
  url?: string;
  error?: string;
};

export default function Upload() {
  const [files, setFiles] = useState<FileState[]>([]);

  async function handleChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const selected = Array.from(e.target.files || []);
    for (const file of selected) {
      setFiles(p => [...p, { file, progress: 0, status: "uploading" }]);
      try {
        const { url } = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
          }),
        }).then(r => r.json());

        // fetch() has no progress — must use XHR
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = (e) => {
            const pct = Math.round((e.loaded / e.total) * 100);
            setFiles(p => p.map(f =>
              f.file === file ? { ...f, progress: pct } : f
            ));
          };
          xhr.onload = () => {
            setFiles(p => p.map(f =>
              f.file === file
                ? { ...f, status: "success", url: url.split("?")[0] }
                : f
            ));
            resolve();
          };
          xhr.onerror = () => {
            setFiles(p => p.map(f =>
              f.file === file
                ? { ...f, status: "error", error: "Upload failed" }
                : f
            ));
            reject();
          };
          xhr.open("PUT", url);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });
      } catch {
        setFiles(p => p.map(f =>
          f.file === file
            ? { ...f, status: "error", error: "Request failed" }
            : f
        ));
      }
    }
  }

  return (
    <div>
      <input type="file" multiple onChange={handleChange} />
      {files.map((f, i) => (
        <div key={i}>
          <span>{f.file.name}</span>
          {f.status === "uploading" && <span>{f.progress}%</span>}
          {f.status === "success" && <img src={f.url} />}
          {f.status === "error" && <span>{f.error}</span>}
        </div>
      ))}
    </div>
  );
}
```

</td>
<td width="50%" valign="top">

**✅ With Pushduck**

```tsx
// app/api/upload/route.ts
import { createUploadConfig } from "pushduck/server";
// (~5KB, no AWS SDK)

const { s3 } = createUploadConfig()
  .provider("aws", {
    bucket: process.env.AWS_BUCKET_NAME!,
    region: process.env.AWS_REGION!,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  })
  .build();

const router = s3.createRouter({
  imageUpload: s3.image().maxFileSize("5MB"),
});

export const { GET, POST } = router.handlers;
export type AppRouter = typeof router;

// app/upload.tsx
"use client";
import { upload } from "@/lib/upload-client";

export default function Upload() {
  const { uploadFiles, files } = upload.imageUpload();

  return (
    <div>
      <input
        type="file"
        multiple
        onChange={e =>
          uploadFiles(Array.from(e.target.files!))
        }
      />
      {files.map(file => (
        <div key={file.id}>
          <span>{file.name}</span>
          {file.status === "uploading" && (
            <span>{file.progress}%</span>
          )}
          {file.status === "success" && (
            <img src={file.url} />
          )}
          {file.status === "error" && (
            <span>{file.error}</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

</td>
</tr>
</table>

### Storage operations too

<table>
<tr>
<td width="50%" valign="top">

**❌ Without Pushduck**

```typescript
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// List files
const { Contents } = await s3.send(
  new ListObjectsV2Command({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Prefix: "uploads/",
    MaxKeys: 50,
  })
);
const files = Contents?.map(item => ({
  key: item.Key,
  size: item.Size,
  lastModified: item.LastModified,
})) ?? [];

// Delete a file
await s3.send(new DeleteObjectCommand({
  Bucket: process.env.AWS_BUCKET_NAME!,
  Key: "uploads/old-file.jpg",
}));

// Get a download URL
const url = await getSignedUrl(
  s3,
  new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: "uploads/document.pdf",
  }),
  { expiresIn: 3600 }
);
```

</td>
<td width="50%" valign="top">

**✅ With Pushduck**

```typescript
import { storage } from "pushduck/storage";

// List files
const { files } = await storage.list.files({
  prefix: "uploads/",
  maxResults: 50,
});

// Delete a file
await storage.delete.file("uploads/old-file.jpg");

// Get a download URL
const url = await storage.download.presignedUrl(
  "uploads/document.pdf",
  3600
);
```

</td>
</tr>
</table>

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
- **Production Ready** - Used in production by many applications

## Quick Start

### Installation

```bash
npm install pushduck
# or
pnpm add pushduck
# or
yarn add pushduck
```

### Setup (3 Steps)

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

## Documentation

- **[Getting Started](https://pushduck.dev/docs/quick-start)** - Complete setup guide
- **[Philosophy & Scope](https://pushduck.dev/docs/philosophy)** - What we do (and don't do)
- **[API Reference](https://pushduck.dev/docs/api)** - Full API documentation
- **[Examples](https://pushduck.dev/docs/examples)** - Real-world examples
- **[Providers](https://pushduck.dev/docs/providers)** - S3, R2, Spaces, MinIO setup
- **[Security](https://pushduck.dev/docs/guides/security)** - Security best practices
- **[Advanced Usage](https://pushduck.dev/docs/guides/advanced)** - Custom config, storage ops, middleware, multiple providers

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
  <strong>Built by <a href="https://github.com/abhay-ramesh">Abhay Ramesh</a></strong>
  <br>
  <a href="https://github.com/abhay-ramesh/pushduck">GitHub</a> •
  <a href="https://pushduck.dev">Documentation</a> •
  <a href="https://pushduck.dev/discord">Discord</a> •
  <a href="https://twitter.com/abhayramesh">Twitter</a>
</div>
