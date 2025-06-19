# Provider System & Upload Configuration

The new provider system in `next-s3-uploader` provides a clean, type-safe way to configure different cloud storage providers with environment-based configuration and better developer experience.

## Quick Start

### 1. Create `upload.ts` Configuration File

Create an `upload.ts` file next to your API route or in your app root:

```typescript
// upload.ts
import { uploadConfig, initializeUploadConfig } from "next-s3-uploader";

const config = uploadConfig
  .cloudflareR2() // Auto-loads from environment variables
  .defaults({
    maxFileSize: "10MB",
    allowedFileTypes: ["image/*", "application/pdf"],
  })
  .build();

initializeUploadConfig(config);
export default config;
```

### 2. Use in Your API Route

```typescript
// app/api/upload/route.ts
import "./upload"; // Import to initialize configuration
import { createS3Handler, s3 } from "next-s3-uploader";

const s3Router = createS3Router({
  imageUpload: s3.image().max("5MB"),
  documentUpload: s3.file().max("10MB"),
});

export const { GET, POST } = createS3Handler(s3Router);
```

### 3. Use in Components

```typescript
// components/upload.tsx
import { useUploadRoute } from "next-s3-uploader";

export function UploadComponent() {
  const { uploadFiles, files } = useUploadRoute("imageUpload");
  // Component automatically uses the configured provider
}
```

## Supported Providers

### Cloudflare R2

```typescript
uploadConfig.cloudflareR2({
  accountId: "your-account-id", // or CLOUDFLARE_ACCOUNT_ID
  accessKeyId: "your-key",      // or R2_ACCESS_KEY_ID
  secretAccessKey: "your-secret", // or R2_SECRET_ACCESS_KEY
  bucket: "your-bucket",        // or R2_BUCKET
})
```

**Environment Variables:**

- `CLOUDFLARE_ACCOUNT_ID` or `R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID` or `R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY` or `R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET` or `R2_BUCKET`

### AWS S3

```typescript
uploadConfig.aws({
  region: "us-east-1",          // or AWS_REGION
  bucket: "your-bucket",        // or AWS_S3_BUCKET
  accessKeyId: "your-key",      // or AWS_ACCESS_KEY_ID
  secretAccessKey: "your-secret", // or AWS_SECRET_ACCESS_KEY
})
```

**Environment Variables:**

- `AWS_REGION` or `S3_REGION`
- `AWS_S3_BUCKET` or `S3_BUCKET`
- `AWS_ACCESS_KEY_ID` or `S3_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY` or `S3_SECRET_ACCESS_KEY`

### DigitalOcean Spaces

```typescript
uploadConfig.digitalOceanSpaces({
  region: "nyc3",               // or DO_SPACES_REGION
  bucket: "your-space",         // or DO_SPACES_BUCKET
  accessKeyId: "your-key",      // or DO_SPACES_ACCESS_KEY_ID
  secretAccessKey: "your-secret", // or DO_SPACES_SECRET_ACCESS_KEY
})
```

### MinIO

```typescript
uploadConfig.minio({
  endpoint: "localhost:9000",   // or MINIO_ENDPOINT
  bucket: "your-bucket",        // or MINIO_BUCKET
  accessKeyId: "your-key",      // or MINIO_ACCESS_KEY_ID
  secretAccessKey: "your-secret", // or MINIO_SECRET_ACCESS_KEY
  useSSL: false,                // or MINIO_USE_SSL
})
```

### Google Cloud Storage

```typescript
uploadConfig.gcs({
  projectId: "your-project",    // or GOOGLE_CLOUD_PROJECT_ID
  bucket: "your-bucket",        // or GCS_BUCKET
  keyFilename: "/path/to/key.json", // or GOOGLE_APPLICATION_CREDENTIALS
})
```

## Configuration Options

### File Defaults

```typescript
.defaults({
  maxFileSize: "10MB",
  allowedFileTypes: ["image/*", "application/pdf", "text/*"],
  acl: "private",
  metadata: {
    uploadedBy: "system",
  },
})
```

### Path Configuration

```typescript
.paths({
  prefix: "uploads",
  generateKey: (file, metadata) => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    return `${metadata.userId}/${timestamp}/${randomId}/${file.name}`;
  },
})
```

### Security Settings

```typescript
.security({
  requireAuth: true,
  allowedOrigins: ["https://yourdomain.com"],
  rateLimiting: {
    maxUploads: 10,
    windowMs: 60000, // 1 minute
  },
})
```

### Lifecycle Hooks

```typescript
.hooks({
  onUploadStart: async ({ file, metadata }) => {
    console.log(`Starting upload: ${file.name}`);
    // Log to analytics, validate user permissions, etc.
  },
  onUploadComplete: async ({ file, url, metadata }) => {
    console.log(`Upload complete: ${url}`);
    // Save to database, send notifications, etc.
  },
  onUploadError: async ({ file, error, metadata }) => {
    console.error(`Upload failed:`, error);
    // Log errors, send alerts, etc.
  },
})
```

## Advanced Usage

### Multiple Configurations

```typescript
// Different configs for different environments
const prodConfig = uploadConfig
  .aws({ region: "us-east-1" })
  .security({ requireAuth: true })
  .build();

const devConfig = uploadConfig
  .minio({ endpoint: "localhost:9000" })
  .security({ requireAuth: false })
  .build();

const config = process.env.NODE_ENV === "production" ? prodConfig : devConfig;
initializeUploadConfig(config);
```

### Custom Provider Configuration

```typescript
import { createUploadConfig, providers } from "next-s3-uploader";

const customConfig = createUploadConfig()
  .provider(providers.aws({
    region: "eu-west-1",
    bucket: "my-custom-bucket",
    // Custom S3-compatible endpoint
    endpoint: "https://my-custom-s3.example.com",
  }))
  .build();
```

### Runtime Configuration

```typescript
import { getUploadConfig } from "next-s3-uploader";

// Get the current configuration anywhere in your app
const config = getUploadConfig();
console.log(`Using provider: ${config.provider.provider}`);
```

## Migration from Legacy Config

The new system is backward compatible. Legacy configurations are automatically converted:

```typescript
// Old way (still works)
const legacyConfig = {
  region: "us-east-1",
  bucket: "my-bucket",
  accessKeyId: "...",
  secretAccessKey: "...",
};

// New way (recommended)
const newConfig = uploadConfig
  .aws({
    region: "us-east-1",
    bucket: "my-bucket",
  })
  .build();
```

## Environment Variable Reference

### Cloudflare R2

- `CLOUDFLARE_ACCOUNT_ID` or `R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID` or `R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY` or `R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET` or `R2_BUCKET`
- `R2_CUSTOM_DOMAIN`

### AWS S3

- `AWS_REGION` or `S3_REGION`
- `AWS_S3_BUCKET` or `S3_BUCKET`
- `AWS_ACCESS_KEY_ID` or `S3_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY` or `S3_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`
- `S3_ACL`
- `S3_CUSTOM_DOMAIN`

### DigitalOcean Spaces

- `DO_SPACES_REGION` or `DIGITALOCEAN_SPACES_REGION`
- `DO_SPACES_BUCKET` or `DIGITALOCEAN_SPACES_BUCKET`
- `DO_SPACES_ACCESS_KEY_ID` or `DIGITALOCEAN_SPACES_ACCESS_KEY_ID`
- `DO_SPACES_SECRET_ACCESS_KEY` or `DIGITALOCEAN_SPACES_SECRET_ACCESS_KEY`
- `DO_SPACES_ENDPOINT` or `DIGITALOCEAN_SPACES_ENDPOINT`
- `DO_SPACES_CUSTOM_DOMAIN`

### MinIO

- `MINIO_ENDPOINT`
- `MINIO_BUCKET`
- `MINIO_ACCESS_KEY_ID` or `MINIO_ACCESS_KEY`
- `MINIO_SECRET_ACCESS_KEY` or `MINIO_SECRET_KEY`
- `MINIO_USE_SSL`
- `MINIO_PORT`
- `MINIO_REGION`
- `MINIO_CUSTOM_DOMAIN`

### Google Cloud Storage

- `GOOGLE_CLOUD_PROJECT_ID` or `GCS_PROJECT_ID`
- `GCS_BUCKET` or `GOOGLE_CLOUD_STORAGE_BUCKET`
- `GOOGLE_APPLICATION_CREDENTIALS` or `GCS_KEY_FILE`
- `GCS_REGION`
- `GCS_CUSTOM_DOMAIN`

## Benefits

### 🎯 **Clean Configuration**

- Single configuration file
- Environment-based setup
- Type-safe configuration

### 🔧 **Multi-Provider Support**

- AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO, GCS
- Explicit provider configuration
- Consistent API across providers

### 🛡️ **Enhanced Security**

- Built-in rate limiting
- Origin validation
- Authentication hooks

### 📊 **Better Observability**

- Lifecycle hooks for monitoring
- Error tracking
- Upload analytics

### 🚀 **Developer Experience**

- Zero-config for common setups
- Intelligent defaults
- Comprehensive TypeScript support
