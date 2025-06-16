# Enhanced Type Inference Specification for next-s3-uploader

## Overview

This document outlines the implementation of **template literal types** and **client-side type inference** for next-s3-uploader, achieving full end-to-end type safety similar to tRPC/React Query patterns while maintaining 100% backward compatibility with existing server and client APIs.

## Current State vs Enhanced State

### Current Limitations

- ⚠️ **Missing**: Template literal types for full inference
- ⚠️ **Missing**: Client-side type inference from server routes
- ✅ **Working**: Server-side router type safety
- ✅ **Working**: Schema validation and inference

### Enhanced Goals

- ✅ **Template literal types** for route name inference (`"imageUpload" | "documentUpload"`)
- ✅ **Client-side type inference** from server router definitions
- ✅ **Full end-to-end type safety** from server route → client hook
- ✅ **Zero breaking changes** to existing APIs
- ✅ **React Query-style patterns** for type-safe client usage

## API Design Overview

### Server Side (No Changes)

The server-side API remains **exactly the same** - all existing code continues to work:

```typescript
// lib/upload.ts - UNCHANGED
const { s3, createS3Handler } = initializeUploadConfig(uploadConfig.build());

// app/api/upload/route.ts - UNCHANGED  
const router = s3.createRouter({
  imageUpload: s3.image().max("5MB").formats(["jpeg", "png"]),
  documentUpload: s3.file().max("10MB").formats(["pdf", "docx"]),
});

export const { GET, POST } = createS3Handler(router);
```

### Client Side (Enhanced with Type Inference)

#### Current Client Usage (Still Works)

```typescript
// Current approach - still fully supported
const { uploadedFiles, uploadFiles } = useS3FileUpload({
  maxFileSize: 5242880,
});

await uploadFiles(files, null, "/api/upload");
```

#### New Enhanced Client Usage

**Option 1: Property-Based Access (Most Ergonomic)**

```typescript
// Import router type and create client
import { createUploadClient } from "next-s3-uploader/client";
import type { AppRouter } from "@/lib/upload";

const upload = createUploadClient<AppRouter>({
  endpoint: "/api/upload",
});

// Direct property access with full type safety
const { uploadedFiles, uploadFiles } = upload.imageUpload;
//                                            ^ Full autocomplete: .imageUpload | .documentUpload
//                                              No strings needed!

// TypeScript knows exact constraints
await uploadFiles(files); // Max 5MB, JPEG/PNG only
```

**Option 2: Proxy-Based Magic (Zero Boilerplate)**

```typescript
// Automatic route detection with proxy
const upload = createTypedUploader<AppRouter>("/api/upload");

// Just use it - routes are auto-detected from server
const imageUpload = upload.imageUpload(); // Returns typed hook
const docUpload = upload.documentUpload(); // Returns typed hook

// Direct usage with perfect types
const { uploadFiles } = imageUpload;
await uploadFiles(files); // Fully typed, no strings anywhere
```

**Option 3: Functional Chaining (tRPC-Style)**

```typescript
// Functional approach similar to tRPC
const trpc = createUploadClient<AppRouter>({ endpoint: "/api/upload" });

// Chained API with perfect inference
const { uploadFiles } = trpc.imageUpload.useUpload();
//                           ^ .imageUpload | .documentUpload
//                                        ^ .useUpload() | .useBatch() | .useProgress()

// Advanced patterns
const mutation = trpc.imageUpload.useMutation({
  onSuccess: (data) => { /* data is fully typed */ },
});
```

**Option 4: Hook Factory Pattern (React Query Style)**

```typescript
// Create typed hooks factory
const { useImageUpload, useDocumentUpload } = createUploadHooks<AppRouter>({
  endpoint: "/api/upload",
});

// Direct hook usage - no strings needed
const { uploadFiles } = useImageUpload();
//                      ^ Generated hook with exact types

// TypeScript knows everything about this route
await uploadFiles(files); // Max 5MB, JPEG/PNG, auto-validated
```

## Implementation Architecture

### 1. Template Literal Type System

```typescript
// Enhanced router types with template literals
export type RouterRouteNames<T> = T extends S3Router<infer TRoutes> 
  ? keyof TRoutes extends string 
    ? keyof TRoutes 
    : never
  : never;

export type RouterRoutePath<T, TRoute extends RouterRouteNames<T>> = 
  `/${string}` | `/api/${string}`;

// Template literal inference for route validation
export type ValidateRouteName<
  TRouter,
  TRouteName extends string
> = TRouteName extends RouterRouteNames<TRouter> 
  ? TRouteName 
  : never;
```

### 2. Enhanced Client-Side Type Inference System

```typescript
// Client-side router type extraction with property access
export type InferClientRouter<T> = T extends S3Router<infer TRoutes>
  ? {
      [K in keyof TRoutes]: TypedRouteHook<T, K>;
    }
  : never;

// Property-based client (Option 1)
export function createUploadClient<TRouter extends S3Router<any>>(
  config: ClientConfig
): InferClientRouter<TRouter> {
  return new Proxy({} as InferClientRouter<TRouter>, {
    get(_, routeName: string) {
      return useTypedRoute<TRouter, typeof routeName>(routeName, config);
    },
  });
}

// Proxy-based magic client (Option 2)
export function createTypedUploader<TRouter extends S3Router<any>>(
  endpoint: string
): {
  [K in RouterRouteNames<TRouter>]: () => TypedRouteHook<TRouter, K>;
} {
  return new Proxy({} as any, {
    get(_, routeName: string) {
      return () => useTypedRoute<TRouter, typeof routeName>(routeName, { endpoint });
    },
  });
}

// tRPC-style client (Option 3)
export function createTRPCStyleClient<TRouter extends S3Router<any>>(
  config: ClientConfig
): {
  [K in RouterRouteNames<TRouter>]: {
    useUpload: () => TypedRouteHook<TRouter, K>;
    useMutation: (opts?: MutationOptions<TRouter, K>) => TypedMutation<TRouter, K>;
    useBatch: () => TypedBatchHook<TRouter, K>;
    useProgress: () => TypedProgressHook<TRouter, K>;
  };
} {
  return new Proxy({} as any, {
    get(_, routeName: string) {
      return {
        useUpload: () => useTypedRoute<TRouter, typeof routeName>(routeName, config),
        useMutation: (opts) => useTypedMutation<TRouter, typeof routeName>(routeName, config, opts),
        useBatch: () => useTypedBatch<TRouter, typeof routeName>(routeName, config),
        useProgress: () => useTypedProgress<TRouter, typeof routeName>(routeName, config),
      };
    },
  });
}

// Hook factory pattern (Option 4)
export function createUploadHooks<TRouter extends S3Router<any>>(
  config: ClientConfig
): {
  [K in RouterRouteNames<TRouter> as `use${Capitalize<string & K>}`]: () => TypedRouteHook<TRouter, K>;
} {
  const routes = getRouterRoutes<TRouter>();
  const hooks = {} as any;
  
  for (const routeName of routes) {
    const hookName = `use${capitalize(routeName)}`;
    hooks[hookName] = () => useTypedRoute<TRouter, typeof routeName>(routeName, config);
  }
  
  return hooks;
}
```

### 3. Enhanced Hooks with Type Inference

```typescript
// Type-safe route hook
export function useTypedRoute<
  TRouter extends S3Router<any>,
  TRouteName extends RouterRouteNames<TRouter>
>(
  routeName: TRouteName,
  config: ClientConfig
): TypedRouteHook<TRouter, TRouteName> {
  
  type RouteConfig = GetRoute<TRouter, TRouteName>;
  type RouteInput = InferRouteInput<RouteConfig>;
  type RouteOutput = InferRouteOutput<RouteConfig>;
  
  const { uploadedFiles, uploadFiles: baseUploadFiles, reset } = useS3FileUpload({
    endpoint: config.endpoint,
  });

  const uploadFiles = useCallback(async (
    files: File[],
    metadata?: Partial<RouteInput>
  ): Promise<RouteOutput[]> => {
    // Type-safe upload with validation
    return baseUploadFiles(files, null, `${config.endpoint}?route=${routeName}`, {
      body: JSON.stringify({ metadata }),
    });
  }, [routeName, config.endpoint]);

  return {
    uploadedFiles: uploadedFiles as TypedUploadedFile<RouteOutput>[],
    uploadFiles,
    reset,
    routeName, // Typed as TRouteName
  };
}
```

## Enhanced Type Definitions

### 1. Template Literal Route Types

```typescript
// Route name template literals
export type RouteNameLiteral<T extends string> = T;

// Path template literals  
export type ApiPath<TPath extends string = string> = `/api/${TPath}`;
export type RoutePath<TRoute extends string = string> = `/${TRoute}`;

// Combined path + route template literals
export type FullRoutePath<
  TPath extends string,
  TRoute extends string
> = `${ApiPath<TPath>}?route=${TRoute}`;
```

### 2. Client Type Inference

```typescript
// Infer complete client schema from server router
export type ClientSchema<TRouter> = TRouter extends S3Router<infer TRoutes>
  ? {
      routes: {
        [K in keyof TRoutes]: {
          name: K;
          input: InferRouteInput<TRoutes[K]>;
          output: InferRouteOutput<TRoutes[K]>;
          constraints: InferRouteConstraints<TRoutes[K]>;
        };
      };
      routeNames: keyof TRoutes;
    }
  : never;

// Enhanced file constraints inference
export type InferRouteConstraints<T> = T extends S3Route<infer TSchema, any>
  ? TSchema extends S3ImageSchema
    ? {
        maxSize: string;
        formats: readonly string[];
        dimensions?: { width?: number; height?: number; };
      }
    : TSchema extends S3FileSchema
    ? {
        maxSize: string;
        formats: readonly string[];
      }
    : unknown
  : never;
```

### 3. Enhanced Upload Result Types

```typescript
// Type-safe upload results with route-specific data
export interface TypedUploadedFile<TOutput = any> {
  key: string;
  url: string;
  status: 'uploading' | 'success' | 'error';
  progress: number;
  timeLeft?: string;
  metadata: TOutput;
  constraints: InferRouteConstraints<any>;
  routeName: string;
}

// Enhanced hook return with route-specific types
export interface TypedRouteHook<
  TRouter,
  TRouteName extends RouterRouteNames<TRouter>
> {
  uploadedFiles: TypedUploadedFile<InferRouteOutput<GetRoute<TRouter, TRouteName>>>[];
  uploadFiles: (
    files: File[],
    metadata?: Partial<InferRouteInput<GetRoute<TRouter, TRouteName>>>
  ) => Promise<InferRouteOutput<GetRoute<TRouter, TRouteName>>[]>;
  reset: () => void;
  routeName: TRouteName;
}

// tRPC-style mutation types
export interface TypedMutation<
  TRouter,
  TRouteName extends RouterRouteNames<TRouter>
> {
  mutate: (
    files: File[],
    metadata?: Partial<InferRouteInput<GetRoute<TRouter, TRouteName>>>
  ) => void;
  mutateAsync: (
    files: File[],
    metadata?: Partial<InferRouteInput<GetRoute<TRouter, TRouteName>>>
  ) => Promise<InferRouteOutput<GetRoute<TRouter, TRouteName>>[]>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  data: InferRouteOutput<GetRoute<TRouter, TRouteName>>[] | undefined;
  reset: () => void;
}

// Batch upload types
export interface TypedBatchHook<
  TRouter,
  TRouteName extends RouterRouteNames<TRouter>
> {
  batchUpload: (
    batches: Array<{
      files: File[];
      metadata?: Partial<InferRouteInput<GetRoute<TRouter, TRouteName>>>;
    }>
  ) => Promise<InferRouteOutput<GetRoute<TRouter, TRouteName>>[]>;
  progress: {
    total: number;
    completed: number;
    percentage: number;
  };
  isUploading: boolean;
}

// Progress tracking types
export interface TypedProgressHook<
  TRouter,
  TRouteName extends RouterRouteNames<TRouter>
> {
  overallProgress: number;
  fileProgress: Record<string, number>;
  estimatedTimeRemaining: string | null;
  uploadSpeed: string;
  errors: Array<{
    file: File;
    error: Error;
    timestamp: Date;
  }>;
}

// Mutation options for tRPC-style API
export interface MutationOptions<
  TRouter,
  TRouteName extends RouterRouteNames<TRouter>
> {
  onSuccess?: (data: InferRouteOutput<GetRoute<TRouter, TRouteName>>[]) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
  onSettled?: () => void;
}

// Utility types for better ergonomics
export type Capitalize<S extends string> = S extends `${infer F}${infer R}`
  ? `${Uppercase<F>}${R}`
  : S;

export interface ClientConfig {
  endpoint: string;
  fetcher?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
}
```

## Usage Examples

### 1. Basic Enhanced Usage

```typescript
// Server setup (unchanged)
const router = s3.createRouter({
  profileImage: s3.image().max("2MB").formats(["jpeg", "png"]).dimensions({ width: 400 }),
  document: s3.file().max("10MB").formats(["pdf", "docx"]),
  gallery: s3.image().max("5MB").formats(["jpeg", "png", "webp"]),
});

// Client setup with type inference
const client = createUploadClient<typeof router>({
  endpoint: "/api/upload",
});

// Type-safe route usage
const { uploadedFiles, uploadFiles } = client.useRoute("profileImage");
//                                                     ^ "profileImage" | "document" | "gallery"

// TypeScript knows the constraints automatically
await uploadFiles(files); // Max 2MB, only JPEG/PNG, 400px width
```

### 2. Advanced Type Inference

```typescript
// Infer all route information at compile time
type MyRoutes = RouterRouteNames<typeof router>;
// Type: "profileImage" | "document" | "gallery"

type ProfileImageInput = InferRouteInput<GetRoute<typeof router, "profileImage">>;
type ProfileImageOutput = InferRouteOutput<GetRoute<typeof router, "profileImage">>;

// Template literal path validation
type ValidPaths = FullRoutePath<"upload", MyRoutes>;
// Type: "/api/upload?route=profileImage" | "/api/upload?route=document" | "/api/upload?route=gallery"
```

### 3. Advanced Usage Patterns

**Proxy Magic with Zero Strings**

```typescript
// The most ergonomic API possible - no strings anywhere!
const upload = createTypedUploader<AppRouter>("/api/upload");

// Direct property access returns typed hooks
const imageHook = upload.imageUpload();
const docHook = upload.documentUpload();
const galleryHook = upload.gallery();

// Use the hooks with perfect type safety
const { uploadFiles: uploadImage } = imageHook;
const { uploadFiles: uploadDoc } = docHook;

// TypeScript knows each route's exact constraints
await uploadImage(files); // Max 2MB, JPEG/PNG only
await uploadDoc(files);   // Max 10MB, PDF/DOCX only
```

**tRPC-Style with Chaining**

```typescript
const trpc = createTRPCStyleClient<AppRouter>({ endpoint: "/api/upload" });

// Chained API with perfect inference
const { mutate, isLoading, error } = trpc.profileImage.useMutation({
  onSuccess: (data) => {
    // data is ProfileImageOutput[] with exact types
    console.log("Uploaded:", data[0].url);
  },
});

// Advanced operations
const batchUpload = trpc.gallery.useBatch();
const progress = trpc.profileImage.useProgress();
```

**Hook Factory with Generated Names**

```typescript
// Automatically generated hook names from router
const { 
  useProfileImage,    // From "profileImage" route
  useDocument,        // From "document" route
  useGallery         // From "gallery" route
} = createUploadHooks<AppRouter>({ endpoint: "/api/upload" });

// Each hook is perfectly typed for its route
const { uploadFiles } = useProfileImage();
//                      ^ TypeScript knows: max 2MB, JPEG/PNG, 400px width

// No need to specify constraints - they're inferred!
await uploadFiles(files);
```

**React Query Integration Pattern**

```typescript
// Full React Query integration with type safety
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
const queryClient = useQueryClient();

// Type-safe mutations with caching
const uploadMutation = useMutation({
  mutationFn: upload.profileImage.uploadFiles,
  onSuccess: (data) => {
    // data is ProfileImageOutput[] with exact types
    queryClient.invalidateQueries(['uploads', 'profileImage']);
  },
});

// Query existing uploads with types
const { data: uploads } = useQuery({
  queryKey: ['uploads', 'profileImage'],
  queryFn: upload.profileImage.queryUploads,
  // data is ProfileImageOutput[] automatically
});
```

## Implementation Strategy

### Phase 1: Template Literal Types (Week 1)

1. **Enhanced Router Types**: Add template literal support to existing router system
2. **Route Name Inference**: Implement `RouterRouteNames<T>` type utility
3. **Path Template Literals**: Add `FullRoutePath<TPath, TRoute>` support
4. **Backward Compatibility**: Ensure all existing APIs continue working

### Phase 2: Client Type Inference (Week 2)

1. **Client Schema Extraction**: Implement `InferClientRouter<T>` utility
2. **Typed Hook Factory**: Create `createUploadClient<T>()` function
3. **Enhanced Hook Types**: Add `TypedRouteHook<TRouter, TRouteName>`
4. **Constraint Inference**: Implement `InferRouteConstraints<T>`

### Phase 3: Advanced Features (Week 3)

1. **Batch Operations**: Type-safe batch uploads across multiple routes
2. **Query Utils**: React Query-style utilities for caching/invalidation
3. **Error Inference**: Type-safe error handling with route-specific errors
4. **Development Tools**: Enhanced TypeScript IntelliSense and debugging

## Backward Compatibility Guarantee

### Existing APIs Continue Working

- ✅ `useS3FileUpload()` hook unchanged
- ✅ Server router API unchanged  
- ✅ `createS3Handler()` unchanged
- ✅ All existing types exported
- ✅ No breaking changes to any public APIs

### Migration Path

- **Optional**: Users can gradually adopt enhanced types
- **Zero pressure**: Existing code works indefinitely
- **Incremental**: Can mix old and new patterns in same codebase

## File Structure

```
packages/next-s3-uploader/src/
├── client/                    # New client-side package
│   ├── index.ts              # Main exports
│   ├── upload-client.ts      # Enhanced client factory
│   ├── typed-hooks.ts        # Type-safe hooks
│   └── query-utils.ts        # React Query utilities
├── types/                    # Enhanced type system
│   ├── template-literals.ts  # Template literal types
│   ├── client-inference.ts   # Client type inference
│   └── router-types.ts       # Enhanced router types
└── core/                     # Existing core (unchanged)
    ├── router-v2.ts          # Enhanced with new types
    ├── schema.ts             # Enhanced constraint inference
    └── ...                   # All existing files
```

## Benefits

### For Developers

- **🚀 Enhanced DX**: Full autocomplete and type safety end-to-end
- **⚡ Faster Development**: Catch errors at compile time, not runtime
- **🎯 Better IntelliSense**: Route names, constraints, and outputs all typed
- **🔄 Zero Migration Cost**: Existing code continues working exactly as before

### For Library

- **📈 Competitive Advantage**: Best-in-class TypeScript experience
- **🏗️ Foundation for Future**: Enables advanced features like React Query integration
- **🛡️ Type Safety**: Eliminates entire classes of runtime errors
- **📚 Self-Documenting**: Types serve as living documentation

This enhancement transforms next-s3-uploader from a well-typed library to a **gold-standard TypeScript experience** that rivals tRPC and other type-safe libraries, while maintaining perfect backward compatibility.
