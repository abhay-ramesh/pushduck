# Next S3 Uploader Demo

This demo showcases the new **File Router Architecture** (Phase 1.2) of the next-s3-uploader library.

## 🚀 Features

- **Type-Safe Routes**: End-to-end TypeScript safety from server to client
- **Schema Validation**: Built-in file type, size, and format validation  
- **Middleware System**: Authentication, logging, and custom processing
- **Lifecycle Hooks**: onUploadStart, onUploadComplete, onUploadError
- **Progress Tracking**: Real-time upload progress and status updates
- **Error Handling**: Comprehensive error states and user feedback

## 🛠️ Setup

1. **Install dependencies**:

   ```bash
   pnpm install
   ```

2. **Configure AWS S3** (create `.env.local`):

   ```env
   AWS_ACCESS_KEY_ID=your_access_key_here
   AWS_SECRET_ACCESS_KEY=your_secret_key_here
   AWS_REGION=us-east-1
   AWS_S3_BUCKET_NAME=your-bucket-name
   ```

3. **Run the development server**:

   ```bash
   pnpm dev
   ```

4. **Open [http://localhost:3000](http://localhost:3000)** to see the demo.

## 📝 Usage Example

### 1. Define Your Router (API Route)

```typescript
// app/api/s3-upload/route.ts
import { createS3Router, createS3Handler, s3 } from "next-s3-uploader";

const s3Router = createS3Router({
  imageUpload: s3
    .image()
    .max("5MB")
    .formats(["jpeg", "jpg", "png", "webp"])
    .middleware(async ({ req }) => {
      // Add authentication, logging, etc.
      return { uploadedAt: new Date() };
    })
    .onUploadComplete(async ({ file, metadata, url }) => {
      // Save to database, send notifications, etc.
      console.log(`Upload complete: ${file.name} -> ${url}`);
    }),
});

export const { GET, POST } = createS3Handler(s3Router);
export type S3RouterType = typeof s3Router;
```

### 2. Use in Your Component

```typescript
// components/upload.tsx
import { useUploadRoute } from "next-s3-uploader";
import type { S3RouterType } from "../app/api/s3-upload/route";

export function ImageUpload() {
  const { uploadFiles, files, isUploading, errors } = useUploadRoute<
    S3RouterType,
    "imageUpload"
  >("imageUpload");

  const handleUpload = async (selectedFiles: File[]) => {
    await uploadFiles(selectedFiles);
  };

  return (
    <div>
      {/* Your upload UI */}
    </div>
  );
}
```

## 🎯 What's New

This demo implements **Phase 1.2: File Router Architecture** from the [Gold Standard DX Roadmap](../../packages/next-s3-uploader/GOLD_STANDARD_DX_ROADMAP.md).

### Key Improvements

- **Uploadthing-inspired API**: Familiar developer experience
- **Route-based organization**: Clean separation of upload logic
- **Full type safety**: TypeScript inference across the entire stack
- **Middleware support**: Extensible processing pipeline
- **Lifecycle hooks**: Complete control over upload flow

## 🔮 Coming Next

**Phase 1.3**: Zero-config setup with automatic environment detection and built-in UI components.

## 📚 Learn More

- [Gold Standard DX Roadmap](../../packages/next-s3-uploader/GOLD_STANDARD_DX_ROADMAP.md)
- [Migration Guide](../../packages/next-s3-uploader/MIGRATION_GUIDE.md)
- [Complete Setup Guide](../../packages/next-s3-uploader/examples/COMPLETE_SETUP_GUIDE.md)
