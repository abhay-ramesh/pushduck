# Pushduck CLI

[![NPM Version](https://img.shields.io/npm/v/@pushduck/cli?style=flat&colorA=18181B&colorB=374151)](https://www.npmjs.com/package/@pushduck/cli)
[![NPM Downloads](https://img.shields.io/npm/dm/@pushduck/cli?style=flat&colorA=18181B&colorB=374151)](https://www.npmjs.com/package/@pushduck/cli)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat&colorA=18181B&colorB=3178C6)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat&colorA=18181B&colorB=F59E0B)](https://opensource.org/licenses/MIT)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-7289DA?style=flat&colorA=18181B&colorB=7289DA)](https://discord.gg/pushduck)
[![Twitter](https://img.shields.io/badge/Twitter-Share%20on%20Twitter-1DA1F2?style=flat&colorA=18181B&colorB=1DA1F2)](https://twitter.com/intent/tweet?text=Just%20discovered%20%40pushduck%20-%20the%20fastest%20way%20to%20add%20file%20uploads%20to%20any%20web%20app!%20🦆%20https%3A//github.com/abhay-ramesh/pushduck)

Zero-configuration setup for Next.js file uploads. Get production-ready S3 uploads working in under 2 minutes.

## Quick Start

```bash
npx @pushduck/cli@latest init
```

That's it! The CLI will guide you through setting up:

- ✅ Provider configuration (AWS S3, Cloudflare R2, etc.)
- ✅ API route generation with TypeScript
- ✅ Example upload components  
- ✅ Environment variable setup
- ✅ Bucket creation (optional)

## Commands

### `init` - Initialize Your Project

```bash
npx @pushduck/cli@latest init [options]
```

**Options:**

- `--provider <type>` - Skip provider selection (aws|cloudflare-r2|digitalocean|minio|gcs)
- `--skip-examples` - Don't generate example components
- `--skip-bucket` - Don't create S3 bucket automatically  
- `--api-path <path>` - Custom API route path (default: `/api/upload`)
- `--dry-run` - Show what would be created without creating
- `--verbose` - Show detailed output

**Examples:**

```bash
# Interactive setup with all prompts
npx @pushduck/cli@latest init

# Use AWS S3 directly, skip examples
npx @pushduck/cli@latest init --provider aws --skip-examples

# Custom API path  
npx @pushduck/cli@latest init --api-path /api/files

# Preview without creating files
npx @pushduck/cli@latest init --dry-run
```

### `add` - Add Upload Routes

```bash
npx @pushduck/cli@latest add
```

Add new upload routes to your existing configuration. Interactive route builder helps you:

- Define file types and validation
- Set up middleware and authentication
- Configure upload destinations
- Generate TypeScript types

### `test` - Validate Setup

```bash
npx @pushduck/cli@latest test [--verbose]
```

Validates your current configuration:

- ✅ Environment variables
- ✅ S3 bucket connectivity  
- ✅ CORS configuration
- ✅ API route functionality
- ✅ TypeScript compilation

## What Gets Created

The CLI generates a complete, production-ready setup:

```
your-project/
├── app/api/upload/route.ts        # Type-safe upload API
├── app/upload/page.tsx            # Demo upload page  
├── components/ui/
│   ├── upload-button.tsx          # Simple upload button
│   ├── upload-dropzone.tsx        # Drag & drop component
│   └── file-preview.tsx           # File preview component
├── lib/upload-client.ts           # Type-safe upload client
├── .env.local                     # Environment variables
└── .env.example                   # Environment template
```

### Generated API Route

```typescript
// app/api/upload/route.ts
import { createUploadRouter, uploadSchema } from 'pushduck/server'

export const router = createUploadRouter({
  imageUpload: uploadSchema({
    image: {
      maxSize: "5MB",
      maxCount: 1,
      formats: ["jpeg", "png", "webp"]
    }
  }).middleware(async ({ req }) => {
    // Add your authentication logic
    const userId = await getUserId(req)
    return { userId, folder: `uploads/${userId}` }
  }),

  documentUpload: uploadSchema({
    file: {
      maxSize: "10MB", 
      maxCount: 5,
      allowedTypes: ["application/pdf", "text/plain"]
    }
  }).middleware(async ({ req }) => {
    const userId = await getUserId(req)
    return { userId, folder: `documents/${userId}` }
  })
})

export type AppRouter = typeof router
export const { GET, POST } = router
```

### Generated Upload Client

```typescript
// lib/upload-client.ts
import { createUploadClient } from 'pushduck/client'
import type { AppRouter } from '@/app/api/upload/route'

export const upload = createUploadClient<AppRouter>({
  endpoint: '/api/upload'
})

// Property-based access with full type safety
export const { imageUpload, documentUpload } = upload
```

### Generated Components

```typescript
// components/ui/upload-button.tsx
'use client'

import { upload } from '@/lib/upload-client'

export function UploadButton() {
  const { uploadFiles, uploadedFiles, isUploading, progress } = upload.imageUpload()

  return (
    <div>
      <input
        type="file"
        onChange={(e) => uploadFiles(e.target.files)}
        disabled={isUploading}
      />
      {isUploading && <div>Progress: {progress}%</div>}
      {uploadedFiles.map(file => (
        <img key={file.key} src={file.url} alt="Uploaded" />
      ))}
    </div>
  )
}
```

## Provider Support

The CLI supports all major S3-compatible providers:

- **AWS S3** - The original and most feature-complete
- **Cloudflare R2** - Global edge network, S3-compatible
- **DigitalOcean Spaces** - Simple and affordable
- **Google Cloud Storage** - Enterprise-grade with global reach
- **MinIO** - Self-hosted, open source S3 alternative

### Provider-Specific Setup

Each provider has tailored setup:

```bash
# AWS S3 with automatic IAM policy creation
npx @pushduck/cli@latest init --provider aws

# Cloudflare R2 with edge optimization
npx @pushduck/cli@latest init --provider cloudflare-r2

# DigitalOcean Spaces with CDN setup
npx @pushduck/cli@latest init --provider digitalocean

# MinIO for local development
npx @pushduck/cli@latest init --provider minio
```

## Interactive Setup Flow

The CLI provides a guided setup experience:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   🚀 Welcome to Pushduck                       │
│                                                             │
│   Let's get your file uploads working in 2 minutes!        │
│                                                             │
└─────────────────────────────────────────────────────────────┘

🔍 Detecting your project...
  ✓ Next.js App Router detected
  ✓ TypeScript configuration found
  ✓ No existing upload configuration

? Which cloud storage provider would you like to use?
❯ AWS S3 (recommended)
  Cloudflare R2 (S3-compatible, global edge)
  DigitalOcean Spaces (simple, affordable)

🔧 Setting up AWS S3...
🔍 Checking for existing credentials...
  ✓ Found AWS_ACCESS_KEY_ID
  ✓ Found AWS_SECRET_ACCESS_KEY
  ✓ Found AWS_REGION

? Enter your S3 bucket name: my-app-uploads
? Create bucket automatically? Yes

🛠️ Generating files...
✨ Created files:
  ├── app/api/upload/route.ts
  ├── app/upload/page.tsx
  ├── components/ui/upload-button.tsx
  ├── lib/upload-client.ts
  └── .env.example

📦 Installing dependencies...
  ✓ pushduck
  ✓ @aws-sdk/client-s3

🎉 Setup complete! Your uploads are ready.
```

## Troubleshooting

### CLI Not Found

```bash
# If you get "command not found"
npm install -g pushduck

# Or use npx for one-time usage  
npx @pushduck/cli@latest@latest init
```

### Permission Errors

```bash
# If you get permission errors during setup
sudo npx @pushduck/cli@latest init

# Or fix npm permissions
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

### Bucket Creation Failed

```bash
# Test your credentials first
npx @pushduck/cli@latest test

# Skip automatic bucket creation
npx @pushduck/cli@latest init --skip-bucket

# Create bucket manually, then run:
npx @pushduck/cli@latest test
```

## Advanced Usage

### Non-Interactive Mode

```bash
# For CI/CD environments
npx @pushduck/cli@latest init \
  --provider aws \
  --skip-examples \
  --api-path /api/upload \
  --no-interactive
```

### Custom Templates

```bash
# Use enterprise template with security features
npx @pushduck/cli@latest init --template enterprise

# Use minimal template for existing projects
npx @pushduck/cli@latest init --template minimal
```

### Monorepo Support

```bash
# For monorepos, specify the Next.js app directory
cd apps/web
npx @pushduck/cli@latest init

# Or use the --cwd flag
npx @pushduck/cli@latest init --cwd apps/web
```

## Contributing

The CLI is part of the [pushduck monorepo](https://github.com/your-org/pushduck).

```bash
# Clone the repository
git clone https://github.com/your-org/pushduck.git

# Install dependencies
pnpm install

# Development
cd packages/cli
pnpm dev

# Build
pnpm build

# Test locally
npm link
pushduck init
```

## License

MIT © [Abhay Ramesh](https://github.com/abhayramesh)
