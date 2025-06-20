# Implementation Roadmap: Developer-Focused File Operations

## 🎯 **Philosophy & Vision**

Our library should provide a **"file system in the cloud"** abstraction, not an S3 client. Developers think in terms of files and CRUD operations, not S3 objects and bucket semantics.

### **Core Principles:**

1. **Developer Experience First** - Simple, predictable API
2. **Framework Agnostic** - Works with any JS/TS framework
3. **Multi-Provider** - Not locked to AWS
4. **TypeScript Excellence** - Perfect IntelliSense and type safety
5. **Minimal Bundle** - Keep the aws4fetch advantage
6. **Reasonable Defaults** - Works without complex configuration

---

## 📊 **Current State Analysis**

### ✅ **What We Have (Upload-Focused)**

- ✅ File uploads (presigned URLs + direct)
- ✅ File key generation
- ✅ Public URL generation
- ✅ Basic file existence check
- ✅ Multi-provider support (AWS, R2, Spaces, MinIO)
- ✅ Connection validation

### ❌ **Critical Gaps (90% of Developer Needs)**

- ❌ **Download operations** - Can't retrieve file content
- ❌ **Delete operations** - Can't clean up files
- ❌ **List operations** - Can't browse/discover files
- ❌ **Metadata operations** - Can't inspect file properties
- ❌ **Batch operations** - Inefficient for multiple files

---

## 🚀 **Implementation Phases**

## **PHASE 1: Complete the CRUD**

*Priority: CRITICAL - Addresses 90% of developer use cases*

### **1.1 Download Operations**

#### **Why Developers Need This:**

- **File Processing Pipelines**: Upload image → download → resize → re-upload thumbnail
- **Content Delivery**: Serve files through their own API/CDN
- **Data Processing**: Download CSV/JSON files for processing
- **Backup/Migration**: Move files between systems

#### **Implementation Requirements:**

```typescript
// Core download functionality
downloadFile(key: string): Promise<ArrayBuffer>
downloadFileAsBuffer(key: string): Promise<Buffer>
downloadFileAsBlob(key: string): Promise<Blob>
downloadFileAsText(key: string): Promise<string>

// Presigned download URLs (for client-side downloads)
generateDownloadUrl(key: string, options?: DownloadUrlOptions): Promise<string>
generateDownloadUrls(keys: string[], options?: DownloadUrlOptions): Promise<DownloadUrlResult[]>

// Streaming for large files
downloadFileStream(key: string): Promise<ReadableStream>
```

#### **Interface Specifications:**

```typescript
interface DownloadUrlOptions {
  expiresIn?: number; // seconds, default 3600
  responseContentType?: string; // Force content-type
  responseContentDisposition?: string; // Force download filename
  responseContentEncoding?: string;
}

interface DownloadUrlResult {
  key: string;
  url: string;
  expiresAt: Date;
}
```

#### **Error Handling:**

- File not found (404) → Clear error message
- Access denied (403) → Configuration issue guidance
- Network errors → Retry logic with exponential backoff
- Invalid key format → Validation error

#### **Use Cases:**

```typescript
// Image processing pipeline
const imageBuffer = await downloadFile('user/123/avatar.jpg');
const thumbnail = await resizeImage(imageBuffer, { width: 150 });
await uploadFile(thumbnail, 'user/123/avatar-thumb.jpg');

// CSV data processing
const csvText = await downloadFileAsText('reports/monthly-sales.csv');
const data = parseCSV(csvText);
await processData(data);

// Secure file serving
const downloadUrl = await generateDownloadUrl('documents/secret.pdf', {
  expiresIn: 300, // 5 minutes
  responseContentDisposition: 'attachment; filename="document.pdf"'
});
```

---

### **1.2 Delete Operations**

#### **Why Developers Need This:**

- **Cleanup Operations**: Delete files when records are deleted
- **User Account Deletion**: Remove all user files when account closed
- **Temporary File Cleanup**: Remove processing artifacts
- **Storage Cost Management**: Clean up unused files

#### **Implementation Requirements:**

```typescript
// Single file deletion
deleteFile(key: string): Promise<boolean>
deleteFileIfExists(key: string): Promise<boolean>

// Batch deletion (efficient)
deleteFiles(keys: string[]): Promise<DeleteResult[]>
deleteFilesWithPrefix(prefix: string, options?: DeletePrefixOptions): Promise<DeleteSummary>

// Safe deletion with confirmation
deleteFileWithConfirmation(key: string, confirmationToken: string): Promise<boolean>
```

#### **Interface Specifications:**

```typescript
interface DeleteResult {
  key: string;
  success: boolean;
  error?: string;
}

interface DeletePrefixOptions {
  dryRun?: boolean; // List what would be deleted without deleting
  maxFiles?: number; // Safety limit
  continueOnError?: boolean;
}

interface DeleteSummary {
  totalFiles: number;
  deletedFiles: number;
  failedFiles: number;
  errors: DeleteResult[];
}
```

#### **Safety Features:**

- **Batch size limits** - Prevent accidental mass deletion
- **Dry run mode** - Preview what will be deleted
- **Confirmation tokens** - For destructive operations
- **Detailed error reporting** - Know exactly what failed

#### **Use Cases:**

```typescript
// User deletes a post
await deleteFile(post.imageKey);
await db.posts.delete({ id: postId });

// User deletes account - cleanup all files
const userFiles = await listFiles({ prefix: `users/${userId}/` });
const deleteResults = await deleteFiles(userFiles.map(f => f.key));
console.log(`Deleted ${deleteResults.filter(r => r.success).length} files`);

// Cleanup temp files after processing
await deleteFilesWithPrefix('temp/batch-123/', { maxFiles: 1000 });
```

---

### **1.3 List Operations**

#### **Why Developers Need This:**

- **User File Management**: Show users their uploaded files
- **Admin Dashboards**: Browse and manage files
- **Cleanup Operations**: Find files to delete
- **File Discovery**: Find files by pattern/prefix

#### **Implementation Requirements:**

```typescript
// Basic listing
listFiles(options?: ListFilesOptions): Promise<FileInfo[]>
listFilesWithPrefix(prefix: string, options?: ListFilesOptions): Promise<FileInfo[]>

// Paginated listing (for large datasets)
listFilesPaginated(options?: PaginatedListOptions): AsyncGenerator<FileInfo[]>

// Filtered listing
listFilesByExtension(extension: string, prefix?: string): Promise<FileInfo[]>
listFilesBySize(minSize?: number, maxSize?: number, prefix?: string): Promise<FileInfo[]>
listFilesByDate(fromDate?: Date, toDate?: Date, prefix?: string): Promise<FileInfo[]>

// Directory-like operations
listDirectories(prefix?: string): Promise<string[]>
```

#### **Interface Specifications:**

```typescript
interface ListFilesOptions {
  prefix?: string;
  maxFiles?: number; // Default 1000
  includeMetadata?: boolean; // Include size, modified date, etc.
  sortBy?: 'key' | 'size' | 'modified';
  sortOrder?: 'asc' | 'desc';
}

interface PaginatedListOptions extends ListFilesOptions {
  pageSize?: number; // Default 100
}

interface FileInfo {
  key: string;
  url: string; // Public URL
  size: number; // Bytes
  contentType: string;
  lastModified: Date;
  etag: string;
  metadata?: Record<string, string>; // Custom metadata
}
```

#### **Performance Considerations:**

- **Pagination** - Handle large file lists efficiently
- **Lazy loading** - Only fetch metadata when needed
- **Caching** - Cache results for repeated queries
- **Filtering** - Server-side filtering when possible

#### **Use Cases:**

```typescript
// User file gallery
const userImages = await listFilesByExtension('jpg', `users/${userId}/images/`);
const gallery = userImages.map(file => ({
  id: file.key,
  url: file.url,
  size: file.size,
  uploadedAt: file.lastModified
}));

// Admin cleanup - find large files
const largeFiles = await listFilesBySize(100 * 1024 * 1024); // > 100MB
console.log(`Found ${largeFiles.length} files over 100MB`);

// Paginated file browser
for await (const fileBatch of listFilesPaginated({ prefix: 'documents/', pageSize: 50 })) {
  console.log(`Processing batch of ${fileBatch.length} files`);
  await processFiles(fileBatch);
}
```

---

### **1.4 Metadata Operations**

#### **Why Developers Need This:**

- **File Validation**: Check file size/type before processing
- **UI Display**: Show file information to users
- **Processing Decisions**: Route files based on properties
- **Storage Analytics**: Track file usage and sizes

#### **Implementation Requirements:**

```typescript
// Basic metadata
getFileInfo(key: string): Promise<FileInfo>
getFileSize(key: string): Promise<number>
getFileContentType(key: string): Promise<string>
getFileLastModified(key: string): Promise<Date>

// Batch metadata (efficient)
getFilesInfo(keys: string[]): Promise<FileInfoResult[]>

// Custom metadata
getFileMetadata(key: string): Promise<Record<string, string>>
setFileMetadata(key: string, metadata: Record<string, string>): Promise<void>

// File existence with metadata
fileExistsWithInfo(key: string): Promise<FileInfo | null>
```

#### **Interface Specifications:**

```typescript
interface FileInfoResult {
  key: string;
  info: FileInfo | null;
  error?: string;
}

interface FileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: FileInfo;
}
```

#### **Validation Helpers:**

```typescript
// Built-in validation
validateFile(key: string, rules: ValidationRules): Promise<FileValidationResult>
validateFiles(keys: string[], rules: ValidationRules): Promise<FileValidationResult[]>

interface ValidationRules {
  maxSize?: number;
  minSize?: number;
  allowedTypes?: string[];
  requiredExtensions?: string[];
  customValidators?: ((info: FileInfo) => boolean | string)[];
}
```

#### **Use Cases:**

```typescript
// Validate before processing
const fileInfo = await getFileInfo('uploads/document.pdf');
if (fileInfo.size > 10 * 1024 * 1024) {
  throw new Error('File too large for processing');
}

// Batch validation
const uploadedFiles = ['file1.jpg', 'file2.png', 'file3.gif'];
const validationResults = await validateFiles(uploadedFiles, {
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif']
});

// Display file info in UI
const files = await getFilesInfo(userFileKeys);
const fileList = files.map(result => ({
  name: result.key.split('/').pop(),
  size: formatFileSize(result.info?.size || 0),
  type: result.info?.contentType || 'unknown',
  uploaded: result.info?.lastModified || new Date()
}));
```

---

## **PHASE 2: Developer Experience Enhancements**

*Priority: HIGH - Makes the library a joy to use*

### **2.1 Error Handling & Debugging**

#### **Why This Matters:**

- **Developer Productivity**: Clear errors save debugging time
- **Production Reliability**: Graceful error handling
- **Configuration Issues**: Help developers fix setup problems

#### **Implementation Requirements:**

```typescript
// Enhanced error types
class PushduckError extends Error {
  code: string;
  statusCode?: number;
  provider: string;
  key?: string;
  suggestions: string[];
}

class FileNotFoundError extends PushduckError {
  code = 'FILE_NOT_FOUND';
  statusCode = 404;
}

class AccessDeniedError extends PushduckError {
  code = 'ACCESS_DENIED';
  statusCode = 403;
}

class InvalidConfigurationError extends PushduckError {
  code = 'INVALID_CONFIGURATION';
}
```

#### **Debug Mode:**

```typescript
// Enhanced debugging
enableDebugMode(options?: DebugOptions): void
disableDebugMode(): void

interface DebugOptions {
  logRequests?: boolean;
  logResponses?: boolean;
  logErrors?: boolean;
  logPerformance?: boolean;
}
```

---

### **2.2 Framework Integration**

#### **React/Next.js Hooks:**

```typescript
// React hooks for common operations
useFileUpload(options?: UploadOptions): UseFileUploadResult
useFileDownload(key: string): UseFileDownloadResult
useFileList(prefix?: string): UseFileListResult
useFileInfo(key: string): UseFileInfoResult

interface UseFileUploadResult {
  upload: (file: File) => Promise<UploadResult>;
  uploading: boolean;
  progress: number;
  error: Error | null;
  result: UploadResult | null;
}
```

#### **Next.js API Route Helpers:**

```typescript
// API route helpers
createUploadHandler(options?: UploadHandlerOptions): NextApiHandler
createDownloadHandler(options?: DownloadHandlerOptions): NextApiHandler
createFileManagerHandler(): NextApiHandler // CRUD operations
```

---

### **2.3 Testing Utilities**

#### **Mock Implementation:**

```typescript
// Testing utilities
createMockS3Client(options?: MockOptions): S3Client
mockFileOperations(mockData: MockFileData[]): void
resetMocks(): void

interface MockFileData {
  key: string;
  content: ArrayBuffer | string;
  contentType: string;
  size: number;
}
```

---

## **PHASE 3: Advanced Operations**

*Priority: MEDIUM - For power users and complex scenarios*

### **3.1 Batch Operations**

#### **Why Developers Need This:**

- **Performance**: Reduce API calls and latency
- **Efficiency**: Handle multiple files atomically
- **User Experience**: Bulk operations in admin interfaces

#### **Implementation Requirements:**

```typescript
// Batch operations with progress tracking
batchUpload(files: BatchUploadItem[]): Promise<BatchUploadResult>
batchDownload(keys: string[]): Promise<BatchDownloadResult>
batchDelete(keys: string[]): Promise<BatchDeleteResult>

interface BatchUploadItem {
  file: File | Buffer;
  key: string;
  options?: UploadOptions;
}

interface BatchUploadResult {
  successful: UploadResult[];
  failed: BatchOperationError[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    totalSize: number;
  };
}
```

---

### **3.2 File Processing Helpers**

#### **Common Processing Operations:**

```typescript
// Image processing
resizeImage(key: string, options: ResizeOptions): Promise<UploadResult>
generateThumbnail(key: string, size: number): Promise<UploadResult>
convertImageFormat(key: string, format: 'jpg' | 'png' | 'webp'): Promise<UploadResult>

// Document processing
extractTextFromPDF(key: string): Promise<string>
generateDocumentPreview(key: string): Promise<UploadResult>

// Archive operations
createZipArchive(keys: string[], archiveName: string): Promise<UploadResult>
extractZipArchive(key: string, extractPrefix: string): Promise<UploadResult[]>
```

---

## 🛠️ **Technical Implementation Details**

### **Error Handling Strategy**

1. **Specific Error Types** - Different errors for different scenarios
2. **Error Recovery** - Retry logic with exponential backoff
3. **Helpful Messages** - Clear, actionable error descriptions
4. **Debug Information** - Detailed logs in debug mode

### **Performance Optimization**

1. **Connection Pooling** - Reuse HTTP connections
2. **Request Batching** - Combine multiple operations
3. **Caching** - Cache metadata and frequently accessed data
4. **Streaming** - Handle large files efficiently

### **Type Safety**

1. **Strict TypeScript** - No `any` types in public API
2. **Generic Types** - Type-safe operations
3. **Runtime Validation** - Validate inputs at runtime
4. **IntelliSense** - Perfect autocomplete experience

### **Testing Strategy**

1. **Unit Tests** - Test each operation thoroughly
2. **Integration Tests** - Test with real providers
3. **Mock Implementation** - Enable developer testing
4. **Performance Tests** - Ensure operations scale

---

## 📈 **Success Metrics**

### **Developer Experience Metrics:**

- **Time to First Success** - How quickly can a developer get started?
- **API Discoverability** - Can developers find what they need?
- **Error Resolution Time** - How quickly can they fix issues?
- **Framework Integration** - How well does it work with their stack?

### **Technical Metrics:**

- **Bundle Size** - Keep the aws4fetch advantage
- **Performance** - Operations should be fast and efficient
- **Reliability** - Handle errors gracefully
- **Compatibility** - Work across all supported providers

### **Adoption Metrics:**

- **GitHub Stars** - Community interest
- **NPM Downloads** - Actual usage
- **Issue Resolution** - Community support quality
- **Documentation Usage** - How well documented features are used

---

## 🎯 **Implementation Priority Order**

### **Week 1-2: Download Operations**

- Core download functionality
- Presigned download URLs
- Error handling and validation
- Tests and documentation

### **Week 3-4: Delete Operations**

- Single and batch deletion
- Safety features (dry run, limits)
- Error handling and recovery
- Tests and documentation

### **Week 5-6: List Operations**

- Basic listing with filtering
- Pagination support
- Performance optimization
- Tests and documentation

### **Week 7-8: Metadata Operations**

- File info and validation
- Custom metadata support
- Batch metadata operations
- Tests and documentation

### **Week 9-10: Integration & Polish**

- Framework integration (React hooks)
- Error handling improvements
- Performance optimization
- Comprehensive documentation

This roadmap transforms pushduck from an "upload-only" library into a **complete file management solution** that developers actually want to use in production applications.
