# Pushduck

![npm](https://img.shields.io/npm/dm/pushduck)
![npm](https://img.shields.io/npm/v/pushduck)
![GitHub](https://img.shields.io/github/license/abhay-ramesh/pushduck)
![example workflow](https://github.com/abhay-ramesh/pushduck/actions/workflows/ci.yml/badge.svg)

![](https://pushduck.dev/banner.png)

**Pushduck** is a powerful, type-safe file upload library for Next.js applications with S3-compatible storage providers. Built with modern React patterns and comprehensive TypeScript support.

## Features

- **🔧 Easy Integration**: Seamless setup with Next.js App Router
- **🏗️ Config-Aware Architecture**: Type-safe configuration with multiple provider support
- **🔒 Type Safety**: Full TypeScript support with schema validation
- **📊 Progress Tracking**: Real-time upload progress with comprehensive state management
- **🎯 Lifecycle Callbacks**: Complete upload lifecycle with `onStart`, `onProgress`, `onSuccess`, and `onError`
- **🔄 Error Handling**: Robust error handling with retry mechanisms
- **🚫 Cancellation**: Cancel uploads with AbortController support
- **🌐 Multi-Provider**: AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO, and more
- **🔐 Security**: Private/public bucket support with presigned URLs
- **✅ Validation**: Built-in file type, size, and custom validation
- **🎯 Modern**: Built for React 18+ and Next.js App Router

## Installation

```bash
# Using npm
npm install pushduck

# Using yarn
yarn add pushduck

# Using pnpm
pnpm add pushduck
```

## Quick Start

### 1. Configure Your Upload Settings

```typescript
// lib/upload.ts
import { createUploadConfig } from 'pushduck/server';

const { s3, config } = createUploadConfig()
  .provider("aws", {
    bucket: process.env.AWS_BUCKET_NAME!,
    region: process.env.AWS_REGION!,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  })
  .defaults({
    maxFileSize: '10MB',
    acl: 'public-read',
  })
  .paths({
    prefix: 'uploads',
    generateKey: (file, metadata) => {
      const userId = metadata.userId || 'anonymous';
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      return `${userId}/${timestamp}/${randomId}/${file.name}`;
    },
  })
  .build();

// Create router with your upload routes
const router = s3.createRouter({
  imageUpload: s3.image().max('5MB'),
  documentUpload: s3.file({ maxSize: '10MB' }),
  avatarUpload: s3.image().max('2MB').middleware(async ({ metadata }) => ({
    ...metadata,
    userId: metadata.userId || 'anonymous',
  })),
});

export { router };
export type AppRouter = typeof router;
```

### 2. Create API Route

```typescript
// app/api/upload/route.ts
import { router } from '@/lib/upload';

export const { GET, POST } = router.handlers;
```

### 3. Use in Your Components

```typescript
// app/upload/page.tsx
'use client';

import { useUpload } from 'pushduck/client';
import type { AppRouter } from '@/lib/upload';

export default function UploadPage() {
  const { uploadFiles, files, isUploading, error, reset } = useUpload<AppRouter>('imageUpload');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    uploadFiles(selectedFiles);
  };

  return (
    <div className="p-6">
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileSelect}
        disabled={isUploading}
        className="mb-4"
      />

      {files.map((file) => (
        <div key={file.id} className="mb-2 p-2 border rounded">
          <div className="flex justify-between items-center">
            <span className="font-medium">{file.name}</span>
            <span className="text-sm text-gray-500">{file.status}</span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${file.progress}%` }}
            />
          </div>
          
          {file.status === 'success' && file.url && (
            <a 
              href={file.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              View uploaded file
            </a>
          )}
          
          {file.status === 'error' && (
            <p className="text-red-600 text-sm mt-1">Error: {file.error}</p>
          )}
        </div>
      ))}

      <button 
        onClick={reset} 
        disabled={isUploading}
        className="px-4 py-2 bg-gray-500 text-white rounded disabled:opacity-50"
      >
        Reset
      </button>
    </div>
  );
}
```

## Upload Lifecycle Callbacks

Pushduck provides comprehensive callback support for handling the complete upload lifecycle:

```typescript
const { uploadFiles } = useUpload<AppRouter>('imageUpload', {
  // Called when upload process begins (after validation passes)
  onStart: (files) => {
    console.log(`🚀 Starting upload of ${files.length} files`);
    setUploadStarted(true);
  },
  
  // Called with progress updates (0-100)
  onProgress: (progress) => {
    console.log(`📊 Progress: ${progress}%`);
    setProgress(progress);
  },
  
  // Called when all uploads complete successfully
  onSuccess: (results) => {
    console.log('✅ Upload complete!', results);
    setUploadStarted(false);
    // Update your UI with uploaded file URLs
  },
  
  // Called when upload fails
  onError: (error) => {
    console.error('❌ Upload failed:', error.message);
    setUploadStarted(false);
    // Show error message to user
  },
});
```

### Callback Execution Order

The callbacks follow a predictable sequence:

- **Validation errors** (size limits, file types): Only `onError` is called
- **Successful uploads**: `onStart` → `onProgress(0)` → `onProgress(n)` → `onSuccess`
- **Upload errors** (network issues): `onStart` → `onProgress(0)` → `onError`

### Using onStart for Better UX

The `onStart` callback is perfect for:

```typescript
onStart: (files) => {
  // Show loading state immediately
  setIsUploading(true);
  
  // Display file list being uploaded
  setUploadingFiles(files);
  
  // Show toast notification
  toast.info(`Uploading ${files.length} files...`);
  
  // Disable form submission
  setFormDisabled(true);
}
```

## Configuration

### Provider Setup

#### AWS S3

```typescript
createUploadConfig().provider("aws", {
  bucket: 'your-bucket',
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
})
```

#### Cloudflare R2

```typescript
createUploadConfig().provider("cloudflareR2", {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  bucket: process.env.R2_BUCKET!,
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  region: 'auto',
})
```

#### DigitalOcean Spaces

```typescript
createUploadConfig().provider("digitalOceanSpaces", {
  region: 'nyc3',
  bucket: 'your-space',
  accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID!,
  secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY!,
})
```

#### MinIO

```typescript
createUploadConfig().provider("minio", {
  endpoint: 'localhost:9000',
  bucket: 'your-bucket',
  accessKeyId: process.env.MINIO_ACCESS_KEY_ID!,
  secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY!,
  useSSL: false,
})
```

### Advanced Configuration

#### File Validation & Defaults

```typescript
.defaults({
  maxFileSize: '10MB',
  allowedFileTypes: ['image/*', 'application/pdf'],
  acl: 'public-read',
  metadata: {
    uploadedBy: 'system',
    environment: process.env.NODE_ENV,
  },
})
```

#### Path Configuration

```typescript
.paths({
  prefix: 'uploads',
  generateKey: (file, metadata) => {
    const userId = metadata.userId || 'anonymous';
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${userId}/${timestamp}/${randomId}/${sanitizedName}`;
  },
})
```

#### Lifecycle Hooks

```typescript
.hooks({
  onUploadStart: async ({ file, metadata }) => {
    console.log(`Starting upload: ${file.name}`);
  },
  onUploadComplete: async ({ file, metadata, url, key }) => {
    console.log(`Upload complete: ${file.name} -> ${url}`);
    // Save to database, send notifications, etc.
  },
  onUploadError: async ({ file, metadata, error }) => {
    console.error(`Upload failed: ${file.name}`, error);
    // Log error, send alerts, etc.
  },
})
```

## API Reference

### Router Schema Methods

```typescript
// Image validation
s3.image().max('5MB')

// File validation
s3.file({ maxSize: '10MB', allowedTypes: ['application/pdf'] })

// Custom validation
s3.file().validate(async (file) => {
  if (file.name.includes('virus')) {
    throw new Error('Suspicious file detected');
  }
})

// Middleware for metadata
s3.image().middleware(async ({ file, metadata }) => ({
  ...metadata,
  processedAt: new Date().toISOString(),
}))

// Route-specific paths
s3.image().paths({
  prefix: 'avatars',
  generateKey: (file, metadata) => `user-${metadata.userId}/avatar.${file.name.split('.').pop()}`,
})

// Lifecycle hooks per route
s3.image().onUploadComplete(async ({ file, url, metadata }) => {
  await updateUserAvatar(metadata.userId, url);
})
```

### Client Hooks

#### useUpload Hook

```typescript
const {
  uploadFiles,     // (files: File[]) => Promise<void>
  files,          // UploadFile[] - reactive file state
  isUploading,    // boolean
  error,          // Error | null
  reset,          // () => void
} = useUpload<AppRouter>('routeName', {
  onSuccess: (results) => console.log('Success:', results),
  onError: (error) => console.error('Error:', error),
});
```

#### useUploadRoute Hook

```typescript
const {
  uploadFiles,
  files,
  isUploading,
  progress,
  cancel,
  retry,
} = useUploadRoute('routeName', {
  onProgress: (progress) => console.log(`${progress.percentage}%`),
  onComplete: (results) => console.log('Complete:', results),
});
```

### Upload Client

For more control, use the upload client directly:

```typescript
import { createUploadClient } from 'pushduck/client';
import type { AppRouter } from '@/lib/upload';

const client = createUploadClient<AppRouter>({
  endpoint: '/api/upload',
});

// Upload files
await client.imageUpload.upload(files, {
  onProgress: (progress) => console.log(`${progress.percentage}%`),
  metadata: { userId: '123' },
});
```

## Examples

### Multi-Route Upload Form

```typescript
function MultiUploadForm() {
  const imageUpload = useUpload<AppRouter>('imageUpload');
  const documentUpload = useUpload<AppRouter>('documentUpload');

  return (
    <div>
      <div>
        <h3>Images</h3>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => imageUpload.uploadFiles(Array.from(e.target.files || []))}
        />
        {/* Render image upload state */}
      </div>

      <div>
        <h3>Documents</h3>
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          multiple
          onChange={(e) => documentUpload.uploadFiles(Array.from(e.target.files || []))}
        />
        {/* Render document upload state */}
      </div>
    </div>
  );
}
```

### Custom Upload Component

```typescript
function CustomUploader() {
  const { uploadFiles, files, isUploading } = useUpload<AppRouter>('imageUpload');
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    uploadFiles(droppedFiles);
  };

  return (
    <div
      className={`border-2 border-dashed p-8 text-center ${
        dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={() => setDragActive(true)}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      {isUploading ? (
        <p>Uploading...</p>
      ) : (
        <p>Drag and drop files here, or click to select</p>
      )}
    </div>
  );
}
```

## Environment Variables

```bash
# AWS S3
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your_bucket

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_R2_ACCESS_KEY_ID=your_access_key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET=your_bucket

# DigitalOcean Spaces
DO_SPACES_ACCESS_KEY_ID=your_access_key
DO_SPACES_SECRET_ACCESS_KEY=your_secret_key

# MinIO
MINIO_ACCESS_KEY_ID=your_access_key
MINIO_SECRET_ACCESS_KEY=your_secret_key
```

## Migration Guide

If you're upgrading from an older version, see our [Migration Guide](https://pushduck.abhayramesh.com/docs/guides/migration) for step-by-step instructions.

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [pushduck.abhayramesh.com](https://pushduck.abhayramesh.com)
- **Issues**: [GitHub Issues](https://github.com/abhay-ramesh/pushduck/issues)
- **Discussions**: [GitHub Discussions](https://github.com/abhay-ramesh/pushduck/discussions)
