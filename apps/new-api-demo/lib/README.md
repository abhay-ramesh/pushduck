# Upload Client Library

This directory contains the centralized upload client configuration for the demo app.

## Files

### `upload-client.ts`

Creates and exports the typed upload client with enhanced type inference.

**Key Features:**

- Property-based access (`upload.imageUpload`, `upload.documentUpload`)
- Full TypeScript inference from server router
- Compile-time type safety
- Enhanced IntelliSense support

**Usage:**

```typescript
import { upload, type TypedUploadedFile } from "../lib/upload-client";

// Property-based access with full type safety
const { uploadFiles, files, isUploading, errors, reset } = upload.imageUpload;

// Upload files with automatic route inference
await uploadFiles(selectedFiles);
```

## Benefits of Centralization

1. **Single Source of Truth**: One place to configure the upload client
2. **Consistent Configuration**: All components use the same endpoint and settings
3. **Easy Maintenance**: Update client configuration in one place
4. **Type Safety**: Centralized type exports prevent import inconsistencies
5. **Reusability**: Import the same client across multiple components

## Architecture

```
lib/
├── upload-client.ts      # Typed upload client configuration
├── upload.ts            # S3 provider configuration (server-side)
└── README.md           # This file

components/
├── property-based-upload.tsx    # Uses lib/upload-client.ts
└── simple-upload.tsx           # Uses direct hooks (for comparison)

app/api/s3-upload/
└── route.ts                    # Server router definition
```

The upload client in `lib/upload-client.ts` connects to the server router in `app/api/s3-upload/route.ts` for full end-to-end type safety.
