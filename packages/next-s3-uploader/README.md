# Next.js S3 Uploader

![npm](https://img.shields.io/npm/dm/next-s3-uploader)
![npm](https://img.shields.io/npm/v/next-s3-uploader)
![GitHub](https://img.shields.io/github/license/abhay-ramesh/next-s3-uploader)
![example workflow](https://github.com/abhay-ramesh/next-s3-uploader/actions/workflows/release.yml/badge.svg)

**Next S3 Uploader** is a powerful utility package for handling file uploads to Amazon S3 or compatible services like MinIO in Next.js applications. It provides a seamless integration with modern features like chunked uploads, progress tracking, and comprehensive error handling.

## Features

- **Easy Integration**: Seamlessly integrate file upload functionality into your Next.js applications
- **Chunked Uploads**: Support for large file uploads with automatic chunking
- **Progress Tracking**: Real-time upload progress with time remaining estimation
- **Error Handling**: Comprehensive error handling with retries and validation
- **Type Safety**: Full TypeScript support with detailed type definitions
- **Cancellation**: Support for cancelling ongoing uploads
- **Configurable**: Flexible configuration for both S3 and MinIO services
- **Private Buckets**: Support for both public and private bucket uploads
- **Validation**: Built-in file type and size validation
- **Modern**: Built for the Next.js App Router and modern React

## Installation

```bash
# Using npm
npm install next-s3-uploader

# Using yarn
yarn add next-s3-uploader

# Using pnpm
pnpm add next-s3-uploader
```

## Quick Start

1. Set up your environment variables:

```env
# .env.local
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
AWS_BUCKET_NAME=your_bucket_name
```

2. Create an API route for generating presigned URLs:

```typescript
// app/api/s3upload/route.ts
import { createS3Client, generatePresignedUrls } from 'next-s3-uploader';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { keys, isPrivate } = await request.json();

    const s3Client = createS3Client({
      provider: 'aws', // or 'minio'
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const urls = await generatePresignedUrls(
      s3Client,
      keys,
      process.env.AWS_BUCKET_NAME!,
      'uploads/', // optional prefix
      isPrivate
    );

    return NextResponse.json(urls);
  } catch (error) {
    console.error('Error generating presigned URLs:', error);
    return NextResponse.json(
      { error: 'Failed to generate presigned URLs' },
      { status: 500 }
    );
  }
}
```

3. Use the hook in your component:

```typescript
// app/upload/page.tsx
'use client';

import { useS3FileUpload } from 'next-s3-uploader';

export default function UploadPage() {
  const {
    uploadedFiles,
    uploadFiles,
    reset,
    cancelUpload,
    isUploading,
  } = useS3FileUpload({
    multiple: true,
    maxFiles: 5,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedFileTypes: ['image/jpeg', 'image/png'],
    isPrivate: false,
    onProgress: (progress, file) => {
      console.log(`Upload progress for ${file.name}: ${progress}%`);
    },
    onError: (error, file) => {
      console.error(`Error uploading ${file.name}:`, error);
    },
    onSuccess: (url, file) => {
      console.log(`Successfully uploaded ${file.name} to ${url}`);
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      try {
        await uploadFiles(files);
      } catch (error) {
        console.error('Upload failed:', error);
      }
    }
  };

  return (
    <div>
      <input
        type="file"
        multiple
        onChange={handleFileChange}
        accept="image/jpeg,image/png"
      />
      
      {uploadedFiles.map((file, index) => (
        <div key={index}>
          <p>File: {file.key}</p>
          <p>Status: {file.status}</p>
          <p>Progress: {file.progress}%</p>
          {file.timeLeft && <p>Time left: {file.timeLeft}</p>}
          {file.status === 'uploading' && (
            <button onClick={() => cancelUpload(file.key)}>Cancel</button>
          )}
          {file.status === 'success' && (
            <img src={file.url} alt={file.key} width={200} />
          )}
          {file.status === 'error' && (
            <p>Error: {file.error?.message}</p>
          )}
        </div>
      ))}
      
      <button onClick={() => reset()}>Reset</button>
    </div>
  );
}
```

## API Reference

### `useS3FileUpload` Hook

The main hook for handling file uploads.

#### Options

```typescript
type UploadOptions = {
  multiple?: boolean;              // Allow multiple file uploads
  maxFiles?: number;              // Maximum number of files
  maxFileSize?: number;           // Maximum file size in bytes
  allowedFileTypes?: string[];    // Allowed MIME types
  isPrivate?: boolean;            // Use private bucket
  onProgress?: (progress: number, file: File) => void;
  onError?: (error: Error, file: File) => void;
  onSuccess?: (url: string, file: File) => void;
  retryAttempts?: number;         // Number of retry attempts
  chunkSize?: number;             // Size of chunks in bytes
};
```

#### Return Value

```typescript
{
  uploadedFiles: UploadedFile[];  // Array of uploaded files
  uploadFiles: (files: FileList | File[], customKeys?: string[]) => Promise<void>;
  reset: (ref?: RefObject<HTMLInputElement>) => void;
  cancelUpload: (key: string) => void;
  isUploading: boolean;           // Upload status
}
```

### `createS3Client`

Creates an S3 client instance.

```typescript
type S3Config = {
  provider: "aws" | "minio" | "other";
  endpoint?: string;              // Required for non-AWS providers
  region: string;
  forcePathStyle?: boolean;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  maxRetries?: number;
  timeout?: number;
  customUserAgent?: string;
};
```

### `generatePresignedUrls`

Generates presigned URLs for file uploads.

```typescript
function generatePresignedUrls(
  s3Client: S3Client,
  keys: string[],
  bucket: string,
  prefix?: string,
  privateBucket?: boolean,
  operation?: "upload" | "download",
  options?: {
    expiresIn?: number;
    contentType?: string;
    metadata?: Record<string, string>;
    acl?: string;
  }
): Promise<Array<{
  key: string;
  presignedPutUrl: string;
  s3ObjectUrl: string;
}>>;
```

## Advanced Usage

### Chunked Uploads

For large files, the package automatically handles chunked uploads:

```typescript
const { uploadFiles } = useS3FileUpload({
  chunkSize: 5 * 1024 * 1024, // 5MB chunks
  onProgress: (progress) => {
    console.log(`Overall progress: ${progress}%`);
  },
});
```

### Private Bucket Access

For private buckets, the package generates signed URLs for both upload and download:

```typescript
const { uploadFiles } = useS3FileUpload({
  isPrivate: true,
});
```

### Custom Upload Keys

You can specify custom keys for uploaded files:

```typescript
const handleUpload = async (files: FileList) => {
  const customKeys = Array.from(files).map(
    file => `custom/${Date.now()}-${file.name}`
  );
  await uploadFiles(files, customKeys);
};
```

### MinIO Configuration

For MinIO or other S3-compatible services:

```typescript
const s3Client = createS3Client({
  provider: 'minio',
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
  },
});
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- Documentation: [next-s3-uploader.abhayramesh.com](https://next-s3-uploader.abhayramesh.com)
- Issues: [GitHub Issues](https://github.com/abhay-ramesh/next-s3-uploader/issues)
- Discussions: [GitHub Discussions](https://github.com/abhay-ramesh/next-s3-uploader/discussions)
