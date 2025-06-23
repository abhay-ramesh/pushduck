# Pushduck

![Pushduck - S3 File Uploader](pushduck.png)

![npm](https://img.shields.io/npm/dm/pushduck)
![npm](https://img.shields.io/npm/v/pushduck)
![GitHub](https://img.shields.io/github/license/abhay-ramesh/pushduck)
![example workflow](https://github.com/abhay-ramesh/pushduck/actions/workflows/release.yml/badge.svg)
<!-- ![GitHub last commit](https://img.shields.io/github/last-commit/abhay-ramesh/pushduck) -->
<!-- ![GitHub stars](https://img.shields.io/github/stars/abhay-ramesh/pushduck) -->

**Pushduck** is a utility package for handling file uploads to Amazon S3 or compatible services like MinIO in a Next.js application. It simplifies the process of integrating secure and scalable cloud storage for your Next.js projects.

## Features

- **Enhanced Type Safety**: Full TypeScript inference from server router to client hooks
- **Property-Based Access**: Direct property access eliminates string literals and typos (`upload.imageUpload` vs `"imageUpload"`)
- **tRPC-Style DX**: Familiar developer experience inspired by modern type-safe libraries
- **Zero Runtime Overhead**: Compile-time type safety with no performance impact
- **Multi-Provider Support**: AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO, and more
- **Progress Tracking**: Real-time upload progress with ETA calculations
- **Backward Compatible**: Works alongside existing patterns - migrate at your own pace

## Repository Structure

```
pushduck/
├── docs/                    # 📚 Documentation (root level)
├── examples/                # 💡 Copy-paste ready examples
│   └── enhanced-demo/       # Complete demo with modern patterns
├── apps/                    # 🔧 Internal development tools
│   ├── docs-legacy/         # Archived documentation
│   └── docu/                # New docs development
└── packages/                # 📦 Core packages
    ├── pushduck/    # Main library
    └── cli/                 # CLI tool for setup
```

> **Note**: This follows the structure of popular repositories like Next.js, React, and tRPC for better discoverability.

## Installation

Install the package using your preferred package manager:

```bash
# Using npm
npm install pushduck
```

```bash
# Using yarn
yarn add pushduck
```

```bash
# Using pnpm
pnpm add pushduck
```

## Usage

### Prerequisites

AWS S3 or compatible service (MinIO, etc.) with a `public` bucket. To be set with policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicRead",
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::your-bucket-name/*"]
    }
  ]
}
```

--- Or ---

AWS S3 or compatible service (MinIO, etc.) with a `private` bucket. To be set with policy:

In `generatePresignedUrls` function, set `privateBucket` to `true`.

### Frontend (Nextjs App Directory)

Import the `useS3FileUpload` hook and use it in your Nextjs component:

```jsx
"use client";

import { useS3FileUpload } from "pushduck";

function UploadPage() {
  const { uploadedFiles, uploadFiles } = useS3FileUpload({
    multiple: true, // Allow multiple flie uploads (optional)
    maxFiles: 10, // 10 files limit (optional)
    maxFileSize: 10 * 1024 * 1024, // 10MB limit (optional)
  });

  const handleFileChange = async (e) => {
    // Get selected files from input and check if length > 0 then upload files to S3
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadFiles(files);
    }
  };

  return (
    <div>
      <h1>File Upload to Amazon S3</h1>
      <input
        title="Upload File"
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
      />
      {/* Display uploaded files and progress */}
      <div>
        {uploadedFiles.map((file, index) => (
          <div key={index}>
            <p>File Key: {file.key}</p>
            <p>Status: {file.status}</p>
            <p>Progress: {file.progress}%</p>
            <p>Time Left: {file.timeLeft || "Calculating..."}</p>
            {file.status === "success" && (
              <img src={file.url} alt={`Uploaded File ${index}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default UploadPage;
```

### API Route

Use the `createS3Client` and `generatePresignedUrls` functions to create an API route for handling pre-signed URLs:

```javascript
import { createS3Client, generatePresignedUrls } from "pushduck";

export async function POST(req) {
  try {
    const { keys } = await req.json();

    // Configure S3 client
    const s3Client = createS3Client({
      provider: "minio", // Store in .env
      endpoint: "http://localhost:9000/", // Store in .env
      region: "ap-south-1", // Store in .env
      forcePathStyle: true, // Store in .env
      credentials: {
        accessKeyId: "ROOTNAME", // Store in .env
        secretAccessKey: "CHANGEME123", // Store in .env
      },
    });

    // Generate pre-signed URLs
    const bucket = "your-bucket-name";
    const prefix = `userId/images/`;
    const urls = await generatePresignedUrls(s3Client, keys, bucket, prefix);

    return new Response(JSON.stringify(urls), { status: 200 });
  } catch (error) {
    console.error("Error processing the request:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
```

## API

The package provides the following functions:

### `useS3FileUpload` Hook Options

The `useS3FileUpload` hook accepts an options object that allows customization of the file upload behavior. Available options include:

- `multiple` (boolean, optional): Allow multiple file uploads at once. Default is `false`.

- `maxFiles` (number, optional): Set the maximum number of files that can be uploaded.

- `maxFileSize` (number, optional): Specify the maximum allowed file size for uploads.

#### `uploadFiles` Function Options

The `uploadFiles` function initiates file uploads to Amazon S3 and supports customization:

- `files` (required): Array of `File` objects to be uploaded.

- `customKeys` (optional): Array of custom keys corresponding to uploaded files.

- `endpoint` (optional): API endpoint for generating pre-signed URLs. Default is `/api/s3upload`.

- `requestOptions` (optional): Additional options to pass to the `fetch` function.

#### `uploadedFiles` Array Properties

The `uploadedFiles` array contains information about each uploaded file:

- `key` (string): Unique key or filename for the uploaded file.

- `status` (string): Upload status (`'uploading'`, `'success'`, `'error'`).

- `progress` (number): Upload progress percentage (0 to 100).

- `url` (string): URL to access the uploaded file on Amazon S3.

- `timeLeft` (string): Estimate of remaining time for the upload to complete.

#### `reset` Function

The `reset` function resets the `uploadedFiles` array to its initial state. (Sets `uploadedFiles` to an empty array.)

---

### `createS3Client(config)`

This function creates an S3 client instance.

- `config`: An object containing S3 configuration options. The available properties are:
  - `provider` (string): The cloud storage provider to use (`"s3"` for Amazon S3 or `"minio"` for MinIO or `"other"` for other S3-compatible services).
  - `endpoint` (string, optional): The endpoint URL of the cloud storage service. Required\* for MinIO or other S3-compatible services.
  - `region` (string): The AWS region or MinIO region to use.
  - `forcePathStyle` (boolean, optional): Whether to use path-style addressing for S3 bucket access. Only required for MinIO or other S3-compatible services.
  - `credentials` (object): An object containing AWS access credentials.
    - `accessKeyId` (string): The access key ID.
    - `secretAccessKey` (string): The secret access key.

### `generatePresignedUrls(s3Client, keys, bucket, prefix?, privateBucket?)`

Generates pre-signed URLs for uploading objects to S3.

- `s3Client`: An instance of the S3 client.
- `keys`: An array of object keys to upload.
- `bucket`: The S3 bucket name.
- `prefix`: (Optional) Prefix for object keys.
- `privateBucket`: (Optional) Whether the bucket is private. Default is `false`.

## Example Usage

### Allow Multiple File Uploads

```jsx
const { uploadedFiles, uploadFiles } = useS3FileUpload({
  multiple: true,
});
```

### Limit Number of Uploaded Files

```jsx
const { uploadedFiles, uploadFiles } = useS3FileUpload({
  multiple: true,
  maxFiles: 3,
});
```

### Set Maximum File Size

```jsx
const { uploadedFiles, uploadFiles } = useS3FileUpload({
  maxFileSize: 5242880, // 5MB limit
});
```

### Custom Keys

```jsx
const { uploadedFiles, uploadFiles } = useS3FileUpload();

const handleFileChange = async (e) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    const customKeys = ["file1.jpg", "images/file2.jpg", "docs/file3.pdf"];
    await uploadFiles(files, customKeys);
  }
};
```

### Custom API Endpoint

```jsx
const { uploadedFiles, uploadFiles } = useS3FileUpload();

const handleFileChange = async (e) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    await uploadFiles(files, null, "/api/custom-upload-route");
  }
};
```

### AWS S3 Client

```javascript
const s3Client = createS3Client({
  provider: "s3", // Amazon S3 provider
  region: "us-east-1", // Specify the appropriate AWS region
  credentials: {
    accessKeyId: "YOUR_ACCESS_KEY_ID", // Your AWS access key ID
    secretAccessKey: "YOUR_SECRET_ACCESS_KEY", // Your AWS secret access key
  },
});
```

### Non-AWS S3 Compatible Client (MinIO/Non-AWS)

```javascript
const s3Client = createS3Client({
  provider: "minio", // Non-AWS S3 provider (minio/other)
  endpoint: "http://localhost:9000", // Specify the appropriate endpoint
  region: "us-east-1", // Specify the appropriate region
  forcePathStyle: true, // Required for MinIO
  credentials: {
    accessKeyId: "ROOTNAME", // Your access key
    secretAccessKey: "CHANGEME123", // Your secret key
  },
});
```

Certainly! Here are some different example usage scenarios for the `pushduck` package:

### Basic File Upload

This is the simplest use case where you want to allow users to upload files to your application.

```javascript
// Your API Route
import { createS3Client, generatePresignedUrls } from "pushduck";

export async function POST(req: Request) {
    const { keys } = await req.json();
    const bucket = "linkjs";

    const s3Client = createS3Client({
      provider: "aws",
      region: "ap-south-1",
      credentials: {
        accessKeyId: "YOUR_ACCESS_KEY_ID",
        secretAccessKey: "YOUR_SECRET_ACCESS_KEY",
      },
    });

    const urls = await generatePresignedUrls(s3Client, keys, bucket);

    return new Response(JSON.stringify(urls), { status: 200 });
}
```

### Authenticated Upload

In this scenario, you might require users to be authenticated before they can upload files.

```javascript
// Your API Route (with authentication check)
import { createS3Client, generatePresignedUrls } from "pushduck";

export async function POST(req: Request) {
    // Check user authentication here
    if (!authenticatedUser) {
    return new Response("Unauthorized", { status: 401 });
    }

    const { keys } = await req.json();
    const bucket = "linkjs";
    const userId = req.user.id;
    const prefix = `${userId}/images/`;

    const s3Client = createS3Client({
      provider: "aws",
      region: "ap-south-1",
      credentials: {
        accessKeyId: "YOUR_ACCESS_KEY_ID",
        secretAccessKey: "YOUR_SECRET_ACCESS_KEY",
      },
    });

    const urls = await generatePresignedUrls(s3Client, keys, bucket, prefix);

    return new Response(JSON.stringify(urls), { status: 200 });
}
```

### Project-Specific Upload

In this case, you might want to organize uploaded files into different projects or folders.

```javascript
// Your API Route (with project-specific prefix)
import { createS3Client, generatePresignedUrls } from "pushduck";

export async function POST(req: Request) {
    const { keys, projectId } = await req.json();
    const bucket = "linkjs";
    const prefix = `projects/${projectId}/images/`;

    const s3Client = createS3Client({
      provider: "aws",
      region: "ap-south-1",
      credentials: {
        accessKeyId: "YOUR_ACCESS_KEY_ID",
        secretAccessKey: "YOUR_SECRET_ACCESS_KEY",
      },
    });

    const urls = await generatePresignedUrls(s3Client, keys, bucket, prefix);

    return new Response(JSON.stringify(urls), { status: 200 });
}
```

### Organization/Company File Storage

If you're building an application for an organization or company, you might want to organize files by departments.

```javascript
// Your API Route (with organization-specific prefix)
import { createS3Client, generatePresignedUrls } from "pushduck";

export async function POST(req: Request) {
    const { keys, organizationId, departmentId } = await req.json();
    const bucket = "linkjs";
    const prefix = `orgs/${organizationId}/depts/${departmentId}/files/`;

    const s3Client = createS3Client({
    provider: "minio",
    endpoint: "http://localhost:9000/",
    region: "ap-south-1",
    forcePathStyle: true,
    credentials: {
        accessKeyId: "ROOTNAME",
        secretAccessKey: "CHANGEME123",
    },
    });

    const urls = await generatePresignedUrls(s3Client, keys, bucket, prefix);

    return new Response(JSON.stringify(urls), { status: 200 });
}
```

## Contributing

Contributions are welcome! Please submit issues and pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
