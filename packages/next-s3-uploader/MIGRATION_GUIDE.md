# 🚀 Migration Guide: From Legacy to Gold Standard DX

This guide helps you migrate from the legacy `useS3FileUpload` API to the new schema-first `useS3Upload` API.

## Why Migrate?

The new API provides:

- ✅ **Type Safety**: End-to-end type inference
- ✅ **Schema Validation**: Declarative file constraints  
- ✅ **Better DX**: Zod-like chaining API
- ✅ **Powerful Transforms**: Built-in file processing
- ✅ **Better Errors**: Structured error handling

## Quick Comparison

### ❌ Old API (Legacy)

```typescript
const { uploadedFiles, uploadFiles } = useS3FileUpload({
  multiple: true,
  maxFiles: 5,
  maxFileSize: 10 * 1024 * 1024, // 10MB in bytes
  allowedFileTypes: ["image/*"],
  onError: (error, file) => console.error(error),
  onSuccess: (url, file) => console.log('Uploaded:', url)
});

// Usage - imperative and error-prone
const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    try {
      await uploadFiles(files);
    } catch (error) {
      // Manual error handling
    }
  }
};
```

### ✅ New API (Gold Standard)

```typescript
import { s3, useS3Upload } from 'next-s3-uploader';

// Schema-first approach with type safety
const uploadSchema = s3.object({
  avatar: s3.image()
    .max("2MB")
    .formats(["jpeg", "png", "webp"])
    .transform(async (ctx) => ({
      original: ctx.file,
      thumbnail: await generateThumbnail(ctx.file, 150),
    })),
  documents: s3.file()
    .types(["application/pdf"])
    .max("10MB")
    .array()
    .max(3)
    .optional()
});

const { files, upload, errors, isUploading } = useS3Upload(uploadSchema, {
  onSuccess: (result) => {
    // result is fully typed based on schema
    console.log('Avatar:', result.avatar.original.url);
    console.log('Thumbnail:', result.avatar.thumbnail.url);
    console.log('Documents:', result.documents?.map(d => d.url));
  }
});

// Usage - declarative and type-safe
const handleUpload = async (files: { avatar: File, documents?: File[] }) => {
  await upload(files); // TypeScript ensures correct structure
};
```

## Step-by-Step Migration

### Step 1: Install Latest Version

```bash
npm install next-s3-uploader@latest
```

### Step 2: Define Your Schema

Replace imperative configuration with declarative schema:

```typescript
// Before
const config = {
  multiple: true,
  maxFiles: 3,
  maxFileSize: 5 * 1024 * 1024,
  allowedFileTypes: ["image/jpeg", "image/png"]
};

// After
const schema = s3.object({
  gallery: s3.image()
    .formats(["jpeg", "png"])
    .max("5MB")
    .array()
    .max(3)
});
```

### Step 3: Update Your Hook Usage

```typescript
// Before
const { uploadedFiles, uploadFiles, reset } = useS3FileUpload(config);

// After  
const { files, upload, reset } = useS3Upload(schema);
```

### Step 4: Update Upload Logic

```typescript
// Before - manual file handling
const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
  const fileList = e.target.files;
  if (fileList) {
    await uploadFiles(fileList);
  }
};

// After - schema-validated input
const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
  const fileList = Array.from(e.target.files || []);
  await upload({ gallery: fileList });
  //             ^? TypeScript knows this should be an array of images
};
```

## Migration Examples

### Example 1: Simple Image Upload

```typescript
// ❌ Legacy
const { uploadedFiles, uploadFiles } = useS3FileUpload({
  maxFileSize: 2 * 1024 * 1024,
  allowedFileTypes: ["image/*"]
});

// ✅ New
const avatarSchema = s3.image().max("2MB");
const { files, upload } = useS3Upload(avatarSchema);

// Usage
await upload(selectedFile); // File must be an image ≤ 2MB
```

### Example 2: Multiple File Types

```typescript
// ❌ Legacy - limited validation
const { uploadedFiles, uploadFiles } = useS3FileUpload({
  multiple: true,
  maxFiles: 10,
  allowedFileTypes: ["image/*", "application/pdf"]
});

// ✅ New - structured validation
const documentSchema = s3.object({
  images: s3.image().max("5MB").array().max(5).optional(),
  pdfs: s3.file().types(["application/pdf"]).max("10MB").array().max(5).optional()
});

const { files, upload } = useS3Upload(documentSchema);

// Usage with type safety
await upload({
  images: imageFiles,  // Must be images ≤ 5MB each, max 5 files
  pdfs: pdfFiles      // Must be PDFs ≤ 10MB each, max 5 files
});
```

### Example 3: Advanced Transforms

```typescript
// ❌ Legacy - manual post-processing
const { uploadedFiles, uploadFiles } = useS3FileUpload({
  allowedFileTypes: ["image/*"],
  onSuccess: async (url, file) => {
    // Manual thumbnail generation after upload
    const thumbnail = await generateThumbnail(url);
    await saveThumbnail(thumbnail);
  }
});

// ✅ New - built-in transforms
const photoSchema = s3.image()
  .max("10MB")
  .transform(async ({ file }) => ({
    original: file,
    thumbnail: await generateThumbnail(file, { width: 150, height: 150 }),
    compressed: await compressImage(file, { quality: 0.8 })
  }));

const { upload } = useS3Upload(photoSchema, {
  onSuccess: (result) => {
    // All variants are already processed and uploaded
    console.log('Original:', result.original.url);
    console.log('Thumbnail:', result.thumbnail.url);
    console.log('Compressed:', result.compressed.url);
  }
});
```

## Advanced Features

### Custom Validation

```typescript
const strictSchema = s3.image()
  .max("2MB")
  .refine(
    async ({ file }) => {
      const dimensions = await getImageDimensions(file);
      return dimensions.width >= 800 && dimensions.height >= 600;
    },
    "Image must be at least 800x600 pixels"
  );
```

### Conditional Fields

```typescript
const dynamicSchema = s3.object({
  profilePicture: s3.image().max("2MB"),
  coverPhoto: s3.image().max("5MB").optional(),
  portfolio: s3.image()
    .max("10MB")
    .array()
    .min(1)
    .max(10)
    .optional()
});
```

### File Processing Pipeline

```typescript
const advancedSchema = s3.image()
  .max("20MB")
  .transform(async ({ file }) => {
    // Multi-step processing
    const optimized = await optimizeImage(file);
    const watermarked = await addWatermark(optimized);
    const variants = await generateVariants(watermarked, [
      { name: 'thumbnail', width: 150 },
      { name: 'medium', width: 800 },
      { name: 'large', width: 1920 }
    ]);
    
    return {
      original: watermarked,
      variants
    };
  });
```

## Gradual Migration Strategy

You can migrate gradually by using both APIs side by side:

```typescript
// Keep existing components working
import { useS3FileUpload } from 'next-s3-uploader'; // Legacy

// New components use new API
import { s3, useS3Upload } from 'next-s3-uploader'; // New

// In your app
function LegacyUploader() {
  const { uploadedFiles, uploadFiles } = useS3FileUpload(/* old config */);
  // ... existing logic
}

function ModernUploader() {
  const schema = s3.image().max("5MB");
  const { files, upload } = useS3Upload(schema);
  // ... new logic
}
```

## Breaking Changes

### Removed in New API

- ❌ `timeLeft` calculation (will be re-added)
- ❌ `progress` tracking during upload (will be re-added)
- ❌ `customKeys` parameter (use schema transforms instead)

### Changed Behavior

- File validation happens before upload (not during)
- Errors are structured and more descriptive
- Upload state is managed per-schema, not per-file

## Need Help?

- 📖 [Full Documentation](https://next-s3-uploader.com/docs)
- 💬 [Discord Community](https://discord.gg/next-s3-uploader)  
- 🐛 [Report Issues](https://github.com/abhay-ramesh/next-s3-uploader/issues)
- 📧 [Email Support](mailto:support@next-s3-uploader.com)

---

**🎯 Migration Checklist**

- [ ] Update to latest version
- [ ] Define schemas for your use cases
- [ ] Replace `useS3FileUpload` with `useS3Upload`
- [ ] Update file handling logic
- [ ] Test validation and upload flow
- [ ] Update TypeScript types
- [ ] Remove deprecated configuration options
