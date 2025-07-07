# Enhanced Demo

This example demonstrates the **Enhanced Property-Based Upload Client** with per-route configuration support - the most advanced and flexible way to handle file uploads in React.

## 🌟 What's New in Enhanced Client

The structured client now supports **per-route configuration** while maintaining superior type safety:

```typescript
// ✅ Simple usage (unchanged)
const { uploadFiles, files } = upload.imageUpload()

// 🆕 With per-route callbacks and configuration
const { uploadFiles, files } = upload.imageUpload({
  onSuccess: (results) => console.log('Success!', results),
  onError: (error) => console.error('Error:', error),
  onProgress: (progress) => setProgress(progress),
  endpoint: '/api/custom-upload',
})
```

## Features Demonstrated

### 1. **Enhanced Property-Based Client**

- Property-based access (`upload.imageUpload()`)
- **NEW**: Per-route callbacks (`onSuccess`, `onError`, `onProgress`)
- **NEW**: Per-route configuration (custom endpoints, disable/enable)
- Full TypeScript inference and compile-time validation
- Superior developer experience with IntelliSense

### 2. **Hook-Based Client** (for comparison)

- Traditional React hook pattern
- String-based route names
- Same functionality, different API style

### 3. **File Management Demo**

- S3-compatible storage operations
- File listing, upload, and deletion
- Presigned URL generation and usage

## Quick Start

1. **Clone and Install**

   ```bash
   git clone https://github.com/pushduck/pushduck
   cd pushduck/examples/enhanced-demo
   npm install
   ```

2. **Configure Environment**

   ```bash
   cp env.example .env.local
   # Edit .env.local with your S3 credentials
   ```

3. **Start Development Server**

   ```bash
   npm run dev
   ```

## File Structure

```
enhanced-demo/
├── app/
│   ├── api/s3-upload/route.ts     # Server router with typed routes
│   └── page.tsx                   # Main demo page
├── components/
│   ├── property-based-upload.tsx  # 🆕 Enhanced structured client demo
│   ├── simple-upload.tsx         # Hook-based client demo
│   └── file-management-demo.tsx   # S3 operations demo
├── lib/
│   ├── upload-client.ts          # 🆕 Enhanced client configuration
│   └── upload.ts                 # S3 provider setup
└── README.md                     # This file
```

## Code Examples

### Enhanced Structured Client

```typescript
// lib/upload-client.ts
import { createUploadClient } from "pushduck/client";
import type { AppS3Router } from "./upload";

export const upload = createUploadClient<AppS3Router>({
  endpoint: "/api/s3-upload",
  
  // Global defaults (optional)
  defaultOptions: {
    onProgress: (progress) => console.log(`Global progress: ${progress}%`),
    onError: (error) => console.error("Global error:", error)
  }
});
```

```typescript
// components/enhanced-upload.tsx
import { upload } from "@/lib/upload-client";

export function EnhancedUpload() {
  const { uploadFiles, files, isUploading, reset } = upload.imageUpload({
    onSuccess: (results) => {
      console.log('✅ Upload successful!', results);
      toast.success(`Uploaded ${results.length} images!`);
    },
    onError: (error) => {
      console.error('❌ Upload failed:', error);
      toast.error(`Upload failed: ${error.message}`);
    },
    onProgress: (progress) => {
      console.log(`📊 Progress: ${progress}%`);
      setProgress(progress);
    }
  });

  return (
    <div>
      <input 
        type="file" 
        multiple 
        accept="image/*"
        onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
        disabled={isUploading}
      />
      
      {files.map(file => (
        <div key={file.id}>
          <span>{file.name}</span>
          <progress value={file.progress} max={100} />
          {file.status === 'success' && (
            <a href={file.url} target="_blank">View →</a>
          )}
        </div>
      ))}
      
      <button onClick={reset}>Reset</button>
    </div>
  );
}
```

### Multiple Routes with Different Configurations

```typescript
export function MultiUploadDemo() {
  // Images with progress tracking
  const images = upload.imageUpload({
    onProgress: (progress) => setImageProgress(progress)
  });
  
  // Documents with different endpoint
  const documents = upload.documentUpload({
    endpoint: '/api/secure-upload',
    onSuccess: (results) => updateDocumentLibrary(results)
  });
  
  // Videos with conditional logic in component
  const videos = upload.videoUpload({
    onSuccess: (results) => processVideoThumbnails(results)
  });

  return (
    <div>
      <FileUploadSection {...images} accept="image/*" />
      <FileUploadSection {...documents} accept=".pdf,.doc" />
      <FileUploadSection {...videos} accept="video/*" />
    </div>
  );
}
```

## API Comparison

| Feature | Enhanced Structured Client | Hook-Based Client |
|---------|---------------------------|-------------------|
| **Type Safety** | ✅ **Superior** - Property-based | ✅ Good - Generic types |
| **Per-route Callbacks** | ✅ **NEW!** Full support | ✅ Full support |
| **IntelliSense** | ✅ **Full route autocomplete** | ⚠️ String-based routes |
| **Refactoring** | ✅ **Safe rename across codebase** | ⚠️ Manual find/replace |
| **Multiple Endpoints** | ✅ **NEW!** Per-route endpoints | ✅ Per-route endpoints |
| **Upload Control** | ✅ **NEW!** Enable/disable per route | ✅ Enable/disable per route |
| **Bundle Size** | ✅ Same | ✅ Same |
| **Performance** | ✅ Identical | ✅ Identical |

## Migration Benefits

If you're using the hook-based approach, here's why you should consider migrating:

```typescript
// Before: Hook-based
const { uploadFiles, files } = useUploadRoute<AppRouter>('imageUpload', {
  onSuccess: handleSuccess,
  onError: handleError
});

// After: Enhanced structured client  
const { uploadFiles, files } = upload.imageUpload({
  onSuccess: handleSuccess,
  onError: handleError
});
```

**Benefits:**

- 🎯 **Better type safety** - Route names validated at compile time
- 🔍 **Enhanced IntelliSense** - Autocomplete for all routes
- 🏗️ **Centralized config** - Single place for endpoint and defaults
- 🛡️ **Refactoring safety** - Rename routes safely across codebase
- ⚡ **Same performance** - Zero runtime overhead

## Environment Setup

Create `.env.local` with your S3-compatible storage credentials:

```env
# S3-Compatible Storage (Cloudflare R2, AWS S3, etc.)
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_REGION=auto
S3_BUCKET_NAME=your_bucket_name
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com

# Optional: Custom domain for file URLs
S3_DOMAIN=https://your-custom-domain.com
```

## Learn More

- [📚 Documentation](../../docs/README.md)
- [🚀 Quick Start Guide](../../docs/content/docs/quick-start.mdx)
- [🎯 Client Approaches](../../docs/content/docs/guides/client-approaches.mdx)
- [⚙️ Configuration Options](../../docs/content/docs/api/configuration/client-options.mdx)

---

**Pushduck** - Own your file uploads. The most comprehensive upload solution for Next.js.
