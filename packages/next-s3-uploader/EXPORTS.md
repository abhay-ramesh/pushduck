# Export Structure Guide

This document explains the clean export structure of `next-s3-uploader` and how to import functionality based on your use case.

## 📦 Import Paths

### 1. Main Entry Point (`next-s3-uploader`)

**Use for:** Client-side components and configuration setup

```typescript
import { 
  useUploadRoute,
  formatETA,
  formatUploadSpeed,
  providers,
  uploadConfig 
} from 'next-s3-uploader'
```

**What's included:**

- ✅ Client-side hooks (`useUploadRoute`, `useS3RouteUpload`)
- ✅ Utility functions (`formatETA`, `formatUploadSpeed`)
- ✅ Configuration builders (`uploadConfig`, `createUploadConfig`)
- ✅ Provider configurations (for reference)
- ✅ TypeScript types for client usage
- ❌ Server-only functionality (schemas, routers, S3 client)

### 2. Server Entry Point (`next-s3-uploader/server`)

**Use for:** API routes and server-side functionality

```typescript
import { 
  s3,
  createS3Handler,
  createS3Router,
  initializeUploadConfig,
  createS3Client 
} from 'next-s3-uploader/server'
```

**What's included:**

- ✅ Schema builders (`s3.file()`, `s3.image()`, `s3.object()`)
- ✅ Router system (`createS3Handler`, `createS3Router`)
- ✅ S3 client functionality (`createS3Client`, `uploadFileToS3`)
- ✅ Configuration initialization (`initializeUploadConfig`)
- ✅ Provider system (`providers`, `validateProviderConfig`)
- ✅ All server-side TypeScript types
- ❌ Client-side hooks (would cause server-side errors)

### 3. Client-Only Entry Point (`next-s3-uploader/client`)

**Use for:** Explicit client-side imports (optional)

```typescript
import { useUploadRoute } from 'next-s3-uploader/client'
```

**What's included:**

- ✅ Only client-safe functionality
- ✅ Same as main entry point but more explicit
- ✅ Useful for strict client/server separation

## 🎯 Usage Examples

### Client Component

```typescript
// ✅ Correct - use main entry point
import { useUploadRoute, formatETA } from 'next-s3-uploader'

// ✅ Also correct - explicit client import
import { useUploadRoute } from 'next-s3-uploader/client'

export function FileUpload() {
  const { files, uploadFiles } = useUploadRoute('avatar')
  // ... component logic
}
```

### API Route

```typescript
// ✅ Correct - use server entry point
import { s3, createS3Handler } from 'next-s3-uploader/server'

const s3Router = s3.createRouter({
  avatar: s3.image().max('2MB'),
  documents: s3.file().max('10MB')
})

export const { GET, POST } = createS3Handler(s3Router)
```

### Configuration Setup

```typescript
// upload.ts (server-side configuration)
import { initializeUploadConfig, providers } from 'next-s3-uploader/server'

export const { s3, createS3Handler } = initializeUploadConfig({
  provider: providers.aws({
    region: 'us-east-1',
    bucket: 'my-bucket'
  })
})
```

## 🚫 Common Mistakes

### ❌ Don't import server functionality in client components

```typescript
// ❌ This will cause errors
import { s3, createS3Handler } from 'next-s3-uploader'
import { createS3Client } from 'next-s3-uploader' // Server-only!
```

### ❌ Don't import client hooks in API routes

```typescript
// ❌ This will cause server-side errors
import { useUploadRoute } from 'next-s3-uploader/server' // Not available!
```

### ✅ Correct separation

```typescript
// Client component
import { useUploadRoute } from 'next-s3-uploader'

// API route  
import { createS3Handler } from 'next-s3-uploader/server'
```

## 📋 Migration Guide

### From Old Exports

```typescript
// ❌ Old way (still works but deprecated)
import { createS3Handler, useUploadRoute } from 'next-s3-uploader'

// ✅ New way - clear separation
import { useUploadRoute } from 'next-s3-uploader'           // Client
import { createS3Handler } from 'next-s3-uploader/server'    // Server
```

### Legacy Support

All old imports still work for backward compatibility, but the new structure provides:

- 🎯 **Better IntelliSense** - Only relevant exports shown
- 🚀 **Smaller bundles** - Client bundles don't include server code
- 🔒 **Type safety** - Prevents server/client mixing errors
- 📚 **Clearer documentation** - Obvious what runs where

## 🔧 TypeScript Support

Each entry point provides appropriate types:

```typescript
// Client types
import type { S3UploadedFile, S3RouteUploadConfig } from 'next-s3-uploader'

// Server types  
import type { S3RouterDefinition, ProviderConfig } from 'next-s3-uploader/server'

// Mixed usage
import type { S3UploadedFile } from 'next-s3-uploader'
import type { S3RouterDefinition } from 'next-s3-uploader/server'
```

This structure ensures you get the right functionality for your environment while maintaining excellent developer experience! 🎉
