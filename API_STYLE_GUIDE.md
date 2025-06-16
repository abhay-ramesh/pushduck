# 🎯 API Style Guide: Choosing Your Upload Pattern

## Overview

`next-s3-uploader` offers multiple API styles to accommodate different development preferences, project requirements, and team structures. This guide helps you choose the right pattern for your specific needs.

## 🚀 Available API Styles

### 1. Property-Based Client (Recommended for New Projects)

```typescript
// Setup once
const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });

// Use anywhere with property access
const { uploadFiles, files, isUploading } = upload.imageUpload;
await uploadFiles(selectedFiles);
```

### 2. Enhanced Hook (Recommended for Existing Projects)

```typescript
// Direct hook usage with type safety
const { uploadFiles, files, isUploading } = 
  useUploadRoute<AppRouter>("imageUpload");
await uploadFiles(selectedFiles);
```

### 3. Traditional Hook (Backward Compatible)

```typescript
// Legacy style - still works but without type checking
const { uploadFiles, files, isUploading } = 
  useUploadRoute("imageUpload", { endpoint: "/api/upload" });
```

> **Note:** The older `useS3FileUpload` hook has been removed. Please use `useUploadRoute` instead.

---

## 🎯 Decision Matrix

| Factor | Property-Based Client | Enhanced Hook | Traditional Hook |
|--------|----------------------|---------------|------------------|
| **Type Safety** | ✅ Excellent | ✅ Excellent | ⚠️ Limited |
| **Learning Curve** | 📈 Medium | 📈 Low | 📈 Low |
| **Team Onboarding** | 📈 Medium | 📈 Easy | 📈 Easy |
| **Migration Effort** | 📈 Medium | 📈 Minimal | 📈 None |
| **IntelliSense** | ✅ Excellent | ✅ Excellent | ⚠️ Basic |
| **Runtime Errors** | ✅ Descriptive | ✅ Good | ⚠️ Generic |
| **Scalability** | ✅ Excellent | ✅ Good | ⚠️ Limited |

---

## 👥 Who Should Use Which?

### 🏢 **Property-Based Client** - Choose If You Are

#### **✅ Perfect For:**

- **New greenfield projects** starting from scratch
- **Teams familiar with tRPC** or similar property-based APIs
- **Large applications** with 5+ upload routes
- **Component library authors** building reusable upload components
- **Type-first development teams** who prioritize compile-time safety
- **Teams building complex upload workflows** with multiple file types

#### **📊 Team Characteristics:**

- **Experience Level:** Intermediate to Advanced TypeScript
- **Team Size:** 3+ developers who value consistent patterns
- **Codebase:** Medium to large applications
- **Architecture:** Component-driven, reusable patterns

#### **🎯 Use Cases:**

```typescript
// Multi-route applications
const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });

// Clean, discoverable API
const imageUpload = upload.imageUpload;     // ✅ IntelliSense shows this
const docUpload = upload.documentUpload;    // ✅ IntelliSense shows this  
const videoUpload = upload.videoUpload;     // ✅ IntelliSense shows this

// Centralized configuration
export { upload } from './lib/upload-client';
```

---

### 🔧 **Enhanced Hook** - Choose If You Are

#### **✅ Perfect For:**

- **Existing React applications** with established hook patterns
- **Teams migrating** from legacy upload solutions
- **Small to medium applications** with 1-5 upload routes
- **React-heavy teams** who think "hooks first"
- **Gradual migration** from existing codebases
- **One-off upload components** that don't need centralization

#### **📊 Team Characteristics:**

- **Experience Level:** Beginner to Advanced React developers
- **Team Size:** Any size, especially smaller teams
- **Codebase:** Existing React applications
- **Architecture:** Hook-based, component-local state

#### **🎯 Use Cases:**

```typescript
// Simple, familiar React pattern
function ImageUploadComponent() {
  const { uploadFiles, files, isUploading } = 
    useUploadRoute<AppRouter>("imageUpload");
    
  // Rest of component logic...
}

// Easy migration from existing hooks
// Before: const result = useOldUploadHook("images");
// After:  const result = useUploadRoute<Router>("imageUpload");
```

---

### ⚠️ **Traditional Hook** - Choose If You Are

#### **⚠️ Limited Recommendation:**

- **Legacy codebases** that cannot be updated immediately
- **Prototyping** where type safety isn't critical
- **Teams avoiding TypeScript generics** entirely

#### **🚨 Migration Path:**

This style is **backward compatible** but offers limited benefits. Consider upgrading to Enhanced Hook with minimal changes:

```typescript
// Easy upgrade path
// Before: useUploadRoute("imageUpload")
// After:  useUploadRoute<AppRouter>("imageUpload")
```

> **Breaking Change:** The legacy `useS3FileUpload` hook has been removed. Migrate to `useUploadRoute` for continued support.

---

## 🏗️ Architecture Patterns

### **Property-Based Client Architecture**

```typescript
// lib/upload-client.ts (centralized)
export const upload = createUploadClient<AppRouter>({ 
  endpoint: "/api/upload" 
});

// components/image-upload.tsx
import { upload } from "@/lib/upload-client";
const { uploadFiles, files } = upload.imageUpload;

// components/document-upload.tsx  
import { upload } from "@/lib/upload-client";
const { uploadFiles, files } = upload.documentUpload;
```

**Benefits:**

- ✅ **Centralized configuration** - one place to change endpoint
- ✅ **Consistent imports** - same `upload` object everywhere
- ✅ **Route discovery** - IntelliSense shows all available routes
- ✅ **Refactoring safety** - rename routes in one place

### **Enhanced Hook Architecture**

```typescript
// components/image-upload.tsx
import { useUploadRoute } from "next-s3-uploader";
import type { AppRouter } from "@/app/api/upload/route";

const { uploadFiles, files } = useUploadRoute<AppRouter>("imageUpload");
```

**Benefits:**

- ✅ **Familiar React patterns** - standard hook usage
- ✅ **Component isolation** - each component manages its own upload
- ✅ **Easy testing** - standard hook testing patterns
- ✅ **Gradual adoption** - add types incrementally

---

## 🚦 Migration Guide

### **From Traditional → Enhanced Hook**

```typescript
// Step 1: Add router type (no other changes needed)
- useUploadRoute("imageUpload")
+ useUploadRoute<AppRouter>("imageUpload")
```

### **From Legacy useS3FileUpload → Enhanced Hook**

```typescript
// The legacy hook has been removed - migrate to useUploadRoute
- import { useS3FileUpload } from "next-s3-uploader";
- const { uploadedFiles, uploadFiles, reset } = useS3FileUpload({
-   multiple: true,
-   maxFiles: 10,
-   maxFileSize: 10 * 1024 * 1024,
- });

+ import { useUploadRoute } from "next-s3-uploader";
+ const { files, uploadFiles, reset } = useUploadRoute("routeName");
```

### **From Enhanced Hook → Property-Based**

```typescript
// Step 1: Create centralized client
// lib/upload-client.ts
export const upload = createUploadClient<AppRouter>({ 
  endpoint: "/api/upload" 
});

// Step 2: Update imports
- import { useUploadRoute } from "next-s3-uploader";
- const { uploadFiles, files } = useUploadRoute<AppRouter>("imageUpload");
+ import { upload } from "@/lib/upload-client";
+ const { uploadFiles, files } = upload.imageUpload;

// Step 3: Update method names
- uploadFiles(files)
+ uploadFiles(files)
```

---

## 🎨 Real-World Examples

### **E-commerce Platform (Property-Based)**

```typescript
// Many upload types, centralized management
const upload = createUploadClient<ShopRouter>({ endpoint: "/api/upload" });

// Product images
const productImages = upload.productImages;

// User avatars  
const userAvatars = upload.userAvatars;

// Document uploads
const documents = upload.invoiceDocuments;

// Marketing assets
const marketing = upload.bannerImages;
```

### **Blog Platform (Enhanced Hook)**

```typescript
// Simple blog with few upload types
function PostEditor() {
  const { uploadFiles, files } = useUploadRoute<BlogRouter>("postImages");
  // Simple, focused component
}

function UserProfile() {
  const { uploadFiles, files } = useUploadRoute<BlogRouter>("avatars");
  // Each component handles its own upload needs
}
```

---

## 🔄 Ecosystem Alignment

### **Property-Based** aligns with

- **tRPC** - `trpc.posts.list.useQuery()`
- **Prisma** - `prisma.user.findMany()`
- **NextAuth** - `nextAuth.providers.google()`

### **Enhanced Hook** aligns with

- **React Query** - `useQuery("posts", fetchPosts)`
- **SWR** - `useSWR("/api/posts", fetcher)`
- **Apollo** - `useQuery(GET_POSTS)`

---

## 📈 Performance Considerations

| Pattern | Bundle Size | Runtime Overhead | Type Checking |
|---------|-------------|------------------|---------------|
| **Property-Based** | +2KB | Proxy overhead | Compile-time |
| **Enhanced Hook** | Baseline | Minimal | Compile-time |
| **Traditional Hook** | Baseline | Minimal | Runtime only |

**Recommendation:** The performance differences are negligible for most applications. Choose based on developer experience and maintainability.

---

## 🎯 Quick Decision Tree

```
Start Here
    ↓
New Project?
    ↓ Yes → Property-Based Client ✅
    ↓ No
    ↓
Team Familiar with tRPC/Property APIs?
    ↓ Yes → Property-Based Client ✅  
    ↓ No
    ↓
5+ Upload Routes?
    ↓ Yes → Property-Based Client ✅
    ↓ No
    ↓
Existing Hook-Heavy Codebase?
    ↓ Yes → Enhanced Hook ✅
    ↓ No
    ↓
Small Simple Project?
    ↓ Yes → Enhanced Hook ✅
    ↓
Default → Enhanced Hook ✅
```

---

## 🚀 Summary

**For Maximum Developer Experience:** Property-Based Client
**For Easiest Migration:** Enhanced Hook  
**For Legacy Support:** Traditional Hook

Both modern approaches (Property-Based and Enhanced Hook) provide excellent type safety and developer experience. The choice depends more on your team's preferences and existing architecture than on technical limitations.

**Remember:** You can mix and match these patterns in the same application. Start with Enhanced Hooks and gradually migrate to Property-Based Client as your application grows!
