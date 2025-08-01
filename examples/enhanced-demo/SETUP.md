# pushduck Demo Setup

This demo shows the configuration-first approach using `createUploadConfig()` where everything flows from the `upload.ts` initialization.

## 🚀 Quick Start

### 1. Configure Environment Variables

Create `.env.local` with your provider credentials:

```bash
# For AWS S3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket

# For Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_ACCESS_KEY_ID=your-access-key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-secret-key
CLOUDFLARE_R2_BUCKET=your-bucket

# For DigitalOcean Spaces
DO_SPACES_ACCESS_KEY_ID=your-access-key
DO_SPACES_SECRET_ACCESS_KEY=your-secret-key
DO_SPACES_REGION=nyc3
DO_SPACES_BUCKET=your-bucket
```

### 2. Configuration File (`upload.ts`)

The `upload.ts` file initializes the configuration and returns configured instances:

```typescript
import { createUploadConfig } from "pushduck/server";

// Initialize and get configured instances
const { s3, config } = createUploadConfig()
  .provider("cloudflareR2", {
    // Provider auto-detected from env vars
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    bucket: process.env.CLOUDFLARE_R2_BUCKET,
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  })
  .defaults({ maxFileSize: "10MB" })
  .security({ allowedOrigins: ["http://localhost:3000"] })
  .build();

// Export the configured instances
export { s3 }; 
```

### 3. API Route (`app/api/s3-upload/route.ts`)

The API route imports the pre-configured instances:

```typescript
import { s3 } from "../../../upload";

const s3Router = s3.createRouter({
  imageUpload: s3.image().maxFileSize("5MB").formats(["jpeg", "png"]),
  documentUpload: s3.file().maxFileSize("10MB").types(["application/pdf"]),
});

// Uses the configuration from upload.ts automatically!
export const { GET, POST } = s3Router.handlers;
```

## 🎯 Key Benefits

1. **Configuration-First**: Everything flows from `upload.ts`
2. **Auto-Detection**: Automatically detects provider from environment
3. **Type-Safe**: Full TypeScript support with IntelliSense
4. **Multi-Cloud**: Easy switching between AWS, Cloudflare R2, DigitalOcean, etc.
5. **Zero Boilerplate**: No configuration needed in API routes

## 🔄 Provider Switching

Change providers by updating environment variables or the config:

```typescript
// Explicit provider configuration
const { s3 } = createUploadConfig()
    .cloudflareR2() // or .aws(), .digitalOceanSpaces(), .minio()
    .defaults({ maxFileSize: "10MB" })
    .build()
);
```

## 🛠️ Development

```bash
npm run dev
```

Visit `http://localhost:3000` to test uploads!
