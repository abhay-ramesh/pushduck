# Next.js S3 Uploader CLI

Zero-configuration setup for Next.js file uploads. Get production-ready S3 uploads working in under 2 minutes.

## Quick Start

```bash
npx next-s3-uploader init
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
npx next-s3-uploader init [options]
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
npx next-s3-uploader init

# Use AWS S3 directly, skip examples
npx next-s3-uploader init --provider aws --skip-examples

# Custom API path  
npx next-s3-uploader init --api-path /api/files

# Preview without creating files
npx next-s3-uploader init --dry-run
```

### `add` - Add Upload Routes

```bash
npx next-s3-uploader add
```

Add new upload routes to your existing configuration. Interactive route builder helps you:

- Define file types and validation
- Set up middleware and authentication
- Configure upload destinations
- Generate TypeScript types

### `test` - Validate Setup

```bash
npx next-s3-uploader test [--verbose]
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
import { createUploadRouter, uploadSchema } from 'next-s3-uploader/server'

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
import { createUploadClient } from 'next-s3-uploader/client'
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
npx next-s3-uploader init --provider aws

# Cloudflare R2 with edge optimization
npx next-s3-uploader init --provider cloudflare-r2

# DigitalOcean Spaces with CDN setup
npx next-s3-uploader init --provider digitalocean

# MinIO for local development
npx next-s3-uploader init --provider minio
```

## Interactive Setup Flow

The CLI provides a guided setup experience:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   🚀 Welcome to Next.js S3 Uploader                       │
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
  ✓ next-s3-uploader
  ✓ @aws-sdk/client-s3

🎉 Setup complete! Your uploads are ready.
```

## Troubleshooting

### CLI Not Found

```bash
# If you get "command not found"
npm install -g next-s3-uploader

# Or use npx for one-time usage  
npx next-s3-uploader@latest init
```

### Permission Errors

```bash
# If you get permission errors during setup
sudo npx next-s3-uploader init

# Or fix npm permissions
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

### Bucket Creation Failed

```bash
# Test your credentials first
npx next-s3-uploader test

# Skip automatic bucket creation
npx next-s3-uploader init --skip-bucket

# Create bucket manually, then run:
npx next-s3-uploader test
```

## Advanced Usage

### Non-Interactive Mode

```bash
# For CI/CD environments
npx next-s3-uploader init \
  --provider aws \
  --skip-examples \
  --api-path /api/upload \
  --no-interactive
```

### Custom Templates

```bash
# Use enterprise template with security features
npx next-s3-uploader init --template enterprise

# Use minimal template for existing projects
npx next-s3-uploader init --template minimal
```

### Monorepo Support

```bash
# For monorepos, specify the Next.js app directory
cd apps/web
npx next-s3-uploader init

# Or use the --cwd flag
npx next-s3-uploader init --cwd apps/web
```

## Contributing

The CLI is part of the [next-s3-uploader monorepo](https://github.com/your-org/next-s3-uploader).

```bash
# Clone the repository
git clone https://github.com/your-org/next-s3-uploader.git

# Install dependencies
pnpm install

# Development
cd packages/cli
pnpm dev

# Build
pnpm build

# Test locally
npm link
next-s3-uploader init
```

## License

MIT © [Abhay Ramesh](https://github.com/abhayramesh)
