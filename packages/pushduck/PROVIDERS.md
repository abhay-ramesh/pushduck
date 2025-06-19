# Provider System & Upload Configuration

The new provider system in `pushduck` provides a clean, type-safe way to configure different cloud storage providers with environment-based configuration and better developer experience.

## Quick Start

### 1. Create `upload.ts` Configuration File

Create an `upload.ts` file next to your API route or in your app root:

```typescript
// upload.ts
import { uploadConfig, initializeUploadConfig } from "pushduck";

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
import { createS3Handler, s3 } from "pushduck";

const s3Router = createS3Router({
  imageUpload: s3.image().max("5MB"),
  documentUpload: s3.file().max("10MB"),
});

export const { GET, POST } = createS3Handler(s3Router);
```

### 3. Use in Components

```typescript
// components/upload.tsx
import { useUploadRoute } from "pushduck";

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
import { createUploadConfig, providers } from "pushduck";

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
import { getUploadConfig } from "pushduck";

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

# S3-Compatible Provider Support

This document outlines the S3-compatible providers supported by pushduck and provides a framework for adding new providers.

## Currently Supported Providers ✅

### Tier 1: Production Ready

- **AWS S3** - The original object storage service
- **Cloudflare R2** - Zero egress fees, global edge network
- **DigitalOcean Spaces** - Simple pricing, built-in CDN
- **MinIO** - Self-hosted, high-performance object storage

## Future Provider Support Framework 🚀

### Tier 2: Enterprise/Hyperscale Providers

- **Azure Blob Storage** - Enterprise integration with Azure ecosystem
- **IBM Cloud Object Storage** - Enterprise-grade with AI/Watson integration
- **Oracle Cloud Infrastructure (OCI)** - Enterprise with generous free tier

### Tier 3: Cost-Optimized Providers

- **Wasabi Hot Cloud Storage** - Single tier, no egress fees, 80% cheaper than AWS
- **Backblaze B2** - Very competitive pricing, free egress via Cloudflare
- **Storj DCS** - Decentralized storage, end-to-end encryption

### Tier 4: Performance/Specialized Providers

- **Telnyx Storage** - Global edge network, private backbone
- **Tigris Data** - Globally distributed, single endpoint
- **Cloudian HyperStore** - On-premises/hybrid deployments

## Provider Implementation Guide

### Step 1: Add Provider Type Definition

Add the provider interface to `src/core/providers.ts`:

```typescript
export interface NewProviderConfig extends BaseProviderConfig {
  provider: "new-provider";
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  // Add provider-specific fields
}
```

### Step 2: Update Union Type

Add to the `ProviderConfig` union type:

```typescript
export type ProviderConfig =
  | AWSProviderConfig
  | CloudflareR2Config
  // ... existing providers
  | NewProviderConfig; // Add here
```

### Step 3: Add S3 Client Configuration

Add case to `getS3CompatibleConfig()` in `src/core/s3-client.ts`:

```typescript
case "new-provider":
  return {
    ...baseConfig,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region || "us-east-1",
    endpoint: config.endpoint || "https://default.endpoint.com",
    forcePathStyle: true, // or false, depending on provider
  };
```

### Step 4: Add Provider Builder Function

Add to the `providers` object in `src/core/providers.ts`:

```typescript
newProvider: (config?: Partial<NewProviderConfig>): NewProviderConfig => ({
  provider: "new-provider",
  accessKeyId: config?.accessKeyId || process.env.NEW_PROVIDER_ACCESS_KEY_ID || "",
  secretAccessKey: config?.secretAccessKey || process.env.NEW_PROVIDER_SECRET_ACCESS_KEY || "",
  endpoint: config?.endpoint || process.env.NEW_PROVIDER_ENDPOINT,
  bucket: config?.bucket || process.env.NEW_PROVIDER_BUCKET || "",
  region: config?.region || process.env.NEW_PROVIDER_REGION || "us-east-1",
  acl: config?.acl || "private",
  customDomain: config?.customDomain || process.env.NEW_PROVIDER_CUSTOM_DOMAIN,
}),
```

### Step 5: Add Validation

Add validation case to `validateProviderConfig()`:

```typescript
case "new-provider":
  if (!config.accessKeyId) errors.push("Access Key ID is required");
  if (!config.secretAccessKey) errors.push("Secret Access Key is required");
  if (!config.endpoint) errors.push("Endpoint is required");
  break;
```

### Step 6: Add Display Name

Add to `getProviderDisplayName()`:

```typescript
const names = {
  // ... existing names
  "new-provider": "New Provider Display Name",
};
```

### Step 7: Add Environment Detection (Optional)

Add to `detectProvider()` function:

```typescript
// Check for New Provider
if (process.env.NEW_PROVIDER_ACCESS_KEY_ID || process.env.NEW_PROVIDER_ENDPOINT) {
  return "new-provider";
}
```

## Provider Configuration Patterns

### Standard S3-Compatible Pattern

Most providers follow this pattern:

- Access Key ID + Secret Access Key authentication
- Custom endpoint URL
- Standard S3 API compatibility
- Path-style or virtual hosted-style URLs

### Common Configuration Options

```typescript
interface ProviderConfig {
  provider: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  endpoint?: string;
  bucket: string;
  acl?: string;
  customDomain?: string;
  forcePathStyle?: boolean;
}
```

### Provider-Specific Considerations

#### Path Style vs Virtual Hosted Style

- **Path Style**: `https://endpoint.com/bucket/key`
- **Virtual Hosted Style**: `https://bucket.endpoint.com/key`

Set `forcePathStyle: true` for providers that require path-style URLs.

#### Region Handling

- Some providers use standard AWS regions (`us-east-1`, `eu-west-1`)
- Others use custom regions (`auto` for Cloudflare R2, `global` for some providers)
- Some providers ignore region entirely

#### Authentication

- Most use Access Key ID + Secret Access Key
- Some have additional authentication parameters
- Azure uses different authentication model (Account Key)

## Testing New Providers

### Basic Functionality Test

```typescript
import { createS3Client, generatePresignedUploadUrl } from './src/core/s3-client';

// Test presigned URL generation
const url = await generatePresignedUploadUrl({
  key: 'test-file.txt',
  contentType: 'text/plain'
});

console.log('Generated URL:', url);
```

### Integration Test

```typescript
import { validateS3Connection } from './src/core/s3-client';

const result = await validateS3Connection();
console.log('Connection valid:', result.success);
if (!result.success) {
  console.error('Error:', result.error);
}
```

## Provider Documentation Template

When adding a new provider, include:

1. **Provider Overview**: Brief description and key features
2. **Pricing Model**: Cost structure and any special pricing features
3. **Setup Instructions**: How to obtain credentials and configure
4. **Endpoint Configuration**: How to determine the correct endpoint
5. **Region Support**: Available regions and how to specify them
6. **Special Features**: Any provider-specific capabilities or limitations
7. **Environment Variables**: List of supported environment variables

## Generic S3-Compatible Provider

For providers not explicitly supported, use the generic `s3-compatible` provider:

```typescript
const config = {
  provider: "s3-compatible",
  accessKeyId: "your-access-key",
  secretAccessKey: "your-secret-key",
  endpoint: "https://your-provider-endpoint.com",
  bucket: "your-bucket",
  region: "us-east-1", // or provider-specific region
  forcePathStyle: true // adjust based on provider requirements
};
```

## Contributing

When contributing new provider support:

1. Follow the implementation guide above
2. Add comprehensive tests
3. Update documentation
4. Ensure error messages are helpful
5. Test with real provider credentials (if possible)
6. Add example configuration in documentation

## Error Handling

Providers should throw descriptive errors:

```typescript
case "new-provider":
  throw new Error(
    "New Provider support coming soon. Brief description of what's needed for implementation."
  );
```

This helps users understand what providers are planned and provides context for future implementation.
