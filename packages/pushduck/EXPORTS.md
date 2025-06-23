# Export Structure Guide

This document explains the clean export structure of `pushduck` and how to import functionality based on your use case.

## 📦 Import Paths

### 1. Main Entry Point (`pushduck`)

**Use for:** Client-side components and configuration setup

```typescript
import { 
  useUploadRoute,
  formatETA,
  formatUploadSpeed,
  providers,
  uploadConfig 
} from 'pushduck'
```

**What's included:**

- ✅ Client-side hooks (`useUploadRoute`, `useS3RouteUpload`)
- ✅ Utility functions (`formatETA`, `formatUploadSpeed`)
- ✅ Configuration builders (`uploadConfig`, `createUploadConfig`)
- ✅ Provider configurations (for reference)
- ✅ TypeScript types for client usage
- ❌ Server-only functionality (schemas, routers, S3 client)

### 2. Server Entry Point (`pushduck/server`)

**Use for:** API routes and server-side functionality

```typescript
import { 
  s3,
  
  createS3Router,
  initializeUploadConfig,
  createS3Client 
} from 'pushduck/server'
```

**What's included:**

- ✅ Schema builders (`s3.file()`, `s3.image()`, `s3.object()`)
- ✅ Router system (`createS3Router`)  (createS3Handler is deprecated)
- ✅ S3 client functionality (`createS3Client`, `uploadFileToS3`)
- ✅ Configuration initialization (`initializeUploadConfig`)
- ✅ Provider system (`providers`, `validateProviderConfig`)
- ✅ All server-side TypeScript types
- ❌ Client-side hooks (would cause server-side errors)

### 3. Client-Only Entry Point (`pushduck/client`)

**Use for:** Explicit client-side imports (optional)

```typescript
import { useUploadRoute } from 'pushduck/client'
```

**What's included:**

- ✅ Only client-safe functionality
- ✅ Same as main entry point but more explicit
- ✅ Useful for strict client/server separation

## 🎯 Usage Examples

### Client Component

```typescript
// ✅ Correct - use main entry point
import { useUploadRoute, formatETA } from 'pushduck'

// ✅ Also correct - explicit client import
import { useUploadRoute } from 'pushduck/client'

export function FileUpload() {
  const { files, uploadFiles } = useUploadRoute('avatar')
  // ... component logic
}
```

### API Route

```typescript
// ✅ Correct - use server entry point
import { s3 } from 'pushduck/server' 

const s3Router = s3.createRouter({
  avatar: s3.image().max('2MB'),
  documents: s3.file().max('10MB')
})

export const { GET, POST } = s3Router.handlers
```

### Configuration Setup

```typescript
// upload.ts (server-side configuration)
import { initializeUploadConfig, providers } from 'pushduck/server'

export const { s3 } = initializeUploadConfig({
  provider: providers.provider("aws",{
    region: 'us-east-1',
    bucket: 'my-bucket'
  })
})
```

## 🚫 Common Mistakes

### ❌ Don't import server functionality in client components

```typescript
// ❌ This will cause errors
import { s3 } from 'pushduck'
import { createS3Client } from 'pushduck' // Server-only!
```

### ❌ Don't import client hooks in API routes

```typescript
// ❌ This will cause server-side errors
import { useUploadRoute } from 'pushduck/server' // Not available!
```

### ✅ Correct separation

```typescript
// Client component
import { useUploadRoute } from 'pushduck'

// API route  
import { s3 } from 'pushduck/server'
```

## 📋 Migration Guide

### From Old Exports

```typescript
// ❌ Old way (still works but deprecated)
import {  useUploadRoute } from 'pushduck'

// ✅ New way - clear separation
import { useUploadRoute } from 'pushduck'           // Client
import { s3 } from 'pushduck/server'    // Server
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
import type { S3UploadedFile, S3RouteUploadConfig } from 'pushduck'

// Server types  
import type { S3RouterDefinition, ProviderConfig } from 'pushduck/server'

// Mixed usage
import type { S3UploadedFile } from 'pushduck'
import type { S3RouterDefinition } from 'pushduck/server'
```

This structure ensures you get the right functionality for your environment while maintaining excellent developer experience! 🎉
