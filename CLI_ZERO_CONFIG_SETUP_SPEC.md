# 🚀 Zero-Config Setup (CLI Init) - Complete Specification

## 📋 Overview

**Goal**: Transform pushduck setup from 30+ minutes of manual configuration to 2 minutes of guided automation.

**Problem**: Current setup requires manual API route creation, environment configuration, S3 bucket setup, and component building.

**Solution**: Interactive CLI that automatically detects project, configures provider, generates code, and verifies setup.

## 🎯 Target Experience

### Before (Current - 30+ minutes)

```bash
# Manual steps developers face today:
1. npm install pushduck
2. Create API route manually
3. Setup environment variables
4. Configure S3 bucket and permissions  
5. Build upload components from scratch
6. Debug connection issues
7. Write upload logic
```

### After (Target - 2 minutes)

```bash
npx pushduck@latest init
# Interactive wizard does everything
# Working upload in 2 minutes
```

## 🛠️ CLI Command Structure

### Primary Command

```bash
npx pushduck@latest init [options]

Options:
  --provider <type>     Skip provider selection (aws|cloudflare-r2|digitalocean|minio|gcs)
  --skip-examples      Don't generate example components
  --skip-bucket        Don't create S3 bucket automatically
  --api-path <path>    Custom API route path (default: /api/upload)
  --dry-run           Show what would be created without creating
  --verbose           Show detailed output
  --help              Show help information
```

### Additional Commands

```bash
npx pushduck add route        # Add new upload route
npx pushduck test             # Test current configuration
npx pushduck update           # Update configuration
npx pushduck deploy           # Production deployment help
```

## 📱 Interactive Flow Design

### Step 1: Welcome & Project Detection

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   🚀 Welcome to Pushduck CLI                   │
│                                                             │
│   Transform your file uploads in 2 minutes!                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

🔍 Analyzing your project...
  ✓ Next.js 15.3.3 detected (App Router)
  ✓ TypeScript configuration found
  ✓ Tailwind CSS detected
  ✓ Package.json located
  ⚠ No existing upload configuration found

Ready to setup file uploads!
```

**Implementation Details:**

- Detect Next.js version and router type (App/Pages)
- Check for TypeScript vs JavaScript
- Identify CSS framework (Tailwind, CSS Modules, styled-components)
- Scan for existing upload-related packages
- Validate project structure

### Step 2: Provider Selection

```
📦 Choose your storage provider:

❯ AWS S3                    Most popular, enterprise-ready
  Cloudflare R2             Zero egress fees, global CDN
  DigitalOcean Spaces       Simple pricing, developer-friendly  
  MinIO                     Self-hosted, S3-compatible
  Google Cloud Storage      Advanced features, ML integration

  → AWS S3 selected

💡 Why AWS S3?
   • Most reliable and battle-tested
   • Extensive documentation and community
   • Integrates with other AWS services
   • Pay-as-you-use pricing

   Need help choosing? https://docs.pushduck.com/providers/comparison
```

**Implementation Details:**

- Provider comparison with pros/cons
- Cost estimation based on usage
- Documentation links for each provider
- Save choice for future use
- Validate provider availability in user's region

### Step 3: Credential Detection & Setup

```
🔧 Configuring AWS S3...

🔍 Checking for existing credentials...
  ✓ AWS_ACCESS_KEY_ID found in environment
  ✓ AWS_SECRET_ACCESS_KEY found in environment  
  ⚠ AWS_REGION not found
  ⚠ S3_BUCKET not found

📝 Let's complete your configuration:

AWS Region: › 
  ○ us-east-1 (N. Virginia)     - Default, lowest latency for US East
  ○ us-west-2 (Oregon)          - West Coast, cheaper data transfer
  ○ eu-west-1 (Ireland)         - Europe, GDPR compliant
  ○ ap-southeast-1 (Singapore)  - Asia Pacific
  ❯ us-east-1

S3 Bucket Name: › my-app-uploads-2024
  💡 Must be globally unique, lowercase, no spaces
  ✓ Available

🔒 Bucket Configuration:
  ○ Private (recommended) - Files require signed URLs
  ○ Public - Files publicly accessible via URL
  ❯ Private

🤖 Create S3 bucket automatically? (Y/n) › Y
  → Will create bucket with optimal CORS and security settings
```

**Implementation Details:**

- Scan environment for existing credentials
- Interactive region selection with latency hints
- Bucket name validation and availability check
- Security recommendations
- Automatic bucket creation with proper policies
- CORS configuration for web uploads

### Step 4: Route & File Generation

```
🛠️ Generating your upload system...

📁 API Route Location:
  ❯ app/api/upload/route.ts (recommended)
    pages/api/upload.ts (Pages Router)
    Custom path

📄 Files to create:
  ✓ app/api/upload/route.ts           - Upload API endpoint
  ✓ lib/upload-config.ts              - Centralized configuration  
  ✓ components/ui/upload-zone.tsx     - Drag & drop component
  ✓ components/ui/file-list.tsx       - Upload progress display
  ✓ app/upload/page.tsx               - Example upload page
  ✓ .env.local updates               - Environment variables

🎨 Example page options:
  ❯ Full example with drag & drop, progress, and file list
    Simple file input example
    Skip examples (configuration only)

📦 Installing dependencies...
  Adding: pushduck@latest
  Adding: react-dropzone (for drag & drop)
  ✓ Dependencies installed
```

**Implementation Details:**

- Detect App Router vs Pages Router
- Generate appropriate file structure
- Smart dependency management
- TypeScript/JavaScript detection
- CSS framework integration
- Component library compatibility

### Step 5: Configuration Summary

```
🎉 Setup Complete!

📁 Created Files:
├── app/api/upload/route.ts          # Upload API endpoint
├── lib/upload-config.ts             # Upload configuration  
├── components/ui/upload-zone.tsx    # Drag & drop component
├── components/ui/file-list.tsx      # Upload progress display
├── app/upload/page.tsx              # Example upload page
└── .env.local                       # Environment variables

🔧 Configuration:
Provider:   AWS S3
Region:     us-east-1  
Bucket:     my-app-uploads-2024
Security:   Private (signed URLs)
Max Size:   10MB per file
Types:      Images, PDFs, Text files

🚀 Next Steps:
1. npm run dev
2. Visit http://localhost:3000/upload  
3. Try uploading a file!

📚 Learn More:
• Documentation: https://docs.pushduck.com
• Examples: https://github.com/pushduck/examples
• Discord: https://discord.gg/pushduck
```

### Step 6: Verification & Testing

```
🔍 Testing your configuration...

  ✓ Next.js dev server accessible
  ✓ API route responding correctly
  ✓ S3 connection successful
  ✓ Upload permissions verified
  ✓ Example page renders properly

🎯 Upload Test:
  Creating test file... ✓
  Generating presigned URL... ✓  
  Uploading to S3... ✓
  Verifying file access... ✓

🎉 Everything works perfectly!

Your upload system is ready for production.
```

## 📁 Generated Code Templates

### API Route Template (`app/api/upload/route.ts`)

```typescript
import { uploadRouter } from "@/lib/upload-config";

// Export the handler for App Router
export const { GET, POST } = uploadRouter.handlers;

// Optional: Add custom middleware
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

### Upload Configuration (`lib/upload-config.ts`)

```typescript
import { 
  createS3Router, 
  uploadConfig, 
  initializeUploadConfig 
} from "pushduck/server";

// Define your upload routes with validation
const uploadRouter = createS3Router({
  // General file upload
  fileUpload: uploadConfig
    .provider("aws",{
      region: process.env.AWS_REGION!,
      bucket: process.env.S3_BUCKET!,
    })
    .file()
    .maxSize("10MB")
    .allowedTypes([
      "image/*",           // All image types
      "application/pdf",   // PDF documents  
      "text/*",           // Text files
    ])
    .middleware(async ({ req }) => {
      // Add authentication here if needed
      // const user = await authenticate(req);
      // return { userId: user.id };
      return {};
    })
    .onUploadComplete(async ({ file, metadata }) => {
      console.log("Upload completed:", file.key);
      // Add database save, notifications, etc.
    })
    .build(),

  // Image-specific upload with processing
  imageUpload: uploadConfig
    .provider("aws",{
      region: process.env.AWS_REGION!,
      bucket: process.env.S3_BUCKET!,
    })
    .image()
    .maxSize("5MB")
    .allowedTypes(["image/jpeg", "image/png", "image/webp"])
    .build(),
});

// Initialize the upload system
const { s3 } = initializeUploadConfig({
  provider: uploadConfig.provider("aws",{
    region: process.env.AWS_REGION!,
    bucket: process.env.S3_BUCKET!,
  }).build()
});

export { uploadRouter, s3 };
export type UploadRouter = typeof uploadRouter;
```

### Drag & Drop Component (`components/ui/upload-zone.tsx`)

```typescript
"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onDrop: (files: File[]) => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function UploadZone({
  onDrop,
  accept,
  maxSize = 10 * 1024 * 1024, // 10MB default
  maxFiles = 5,
  disabled = false,
  className,
  children,
}: UploadZoneProps) {
  const handleDrop = useCallback((acceptedFiles: File[]) => {
    onDrop(acceptedFiles);
  }, [onDrop]);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    fileRejections,
  } = useDropzone({
    onDrop: handleDrop,
    accept,
    maxSize,
    maxFiles,
    disabled,
  });

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200",
          "hover:border-primary/50 hover:bg-muted/25",
          isDragActive && !isDragReject && "border-primary bg-primary/5",
          isDragReject && "border-destructive bg-destructive/5",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        <input {...getInputProps()} />
        
        {children || (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-lg font-medium">
                {isDragActive
                  ? isDragReject
                    ? "File type not supported"
                    : "Drop files here"
                  : "Drag & drop files or click to browse"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Maximum {maxFiles} files, up to {Math.round(maxSize / 1024 / 1024)}MB each
              </p>
            </div>
          </div>
        )}
      </div>

      {fileRejections.length > 0 && (
        <div className="mt-4 space-y-2">
          {fileRejections.map(({ file, errors }) => (
            <div
              key={file.name}
              className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded"
            >
              <X className="h-4 w-4" />
              <span className="font-medium">{file.name}</span>
              <span>-</span>
              <span>{errors[0]?.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### File List Component (`components/ui/file-list.tsx`)

```typescript
"use client";

import { CheckCircle, XCircle, Loader2, File } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileListProps {
  files: Array<{
    id: string;
    name: string;
    size: number;
    progress: number;
    status: "pending" | "uploading" | "success" | "error";
    error?: string;
    url?: string;
  }>;
  className?: string;
}

export function FileList({ files, className }: FileListProps) {
  if (files.length === 0) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "uploading":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <File className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <h3 className="font-medium text-sm text-muted-foreground">
        Upload Progress
      </h3>
      
      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-3 p-3 border rounded-lg bg-card"
          >
            {getStatusIcon(file.status)}
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </span>
              </div>
              
              {file.status === "uploading" && (
                <div className="mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {file.progress}% complete
                  </p>
                </div>
              )}
              
              {file.status === "error" && file.error && (
                <p className="text-xs text-red-600 mt-1">{file.error}</p>
              )}
              
              {file.status === "success" && file.url && (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                >
                  View file
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Example Upload Page (`app/upload/page.tsx`)

```typescript
"use client";

import { useState } from "react";
import { useS3Upload } from "pushduck";
import { UploadZone } from "@/components/ui/upload-zone";
import { FileList } from "@/components/ui/file-list";
import type { UploadRouter } from "@/lib/upload-config";

export default function UploadPage() {
  const { uploadFiles, files, isUploading, reset } = useS3Upload<UploadRouter>("fileUpload");

  const handleDrop = async (newFiles: File[]) => {
    try {
      await uploadFiles(newFiles);
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">File Upload</h1>
          <p className="text-muted-foreground mt-2">
            Upload your files securely to the cloud. Supports images, PDFs, and text files up to 10MB.
          </p>
        </div>

        <UploadZone
          onDrop={handleDrop}
          accept={{
            "image/*": [".jpeg", ".jpg", ".png", ".webp"],
            "application/pdf": [".pdf"],
            "text/*": [".txt", ".md", ".csv"],
          }}
          maxSize={10 * 1024 * 1024} // 10MB
          maxFiles={5}
          disabled={isUploading}
          className="min-h-[200px]"
        />

        <FileList files={files} />

        {files.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Clear All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

### Environment Variables Template (`.env.local`)

```bash
# AWS S3 Configuration
# Get these from your AWS Console: https://console.aws.amazon.com/iam/
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1
S3_BUCKET=my-app-uploads-2024

# Optional: Custom domain for faster uploads
# S3_CUSTOM_DOMAIN=https://cdn.yourdomain.com

# Optional: Upload security settings  
# UPLOAD_MAX_FILE_SIZE=10485760  # 10MB in bytes
# UPLOAD_RATE_LIMIT=10           # Max uploads per hour per IP
```

## 🔧 Implementation Architecture

### CLI Package Structure

```
packages/cli/
├── src/
│   ├── commands/
│   │   ├── init.ts           # Main init command
│   │   ├── add-route.ts      # Add new routes
│   │   ├── test.ts           # Test configuration
│   │   └── deploy.ts         # Production deployment
│   ├── templates/
│   │   ├── api-route.ts.template
│   │   ├── upload-config.ts.template
│   │   ├── upload-zone.tsx.template
│   │   └── example-page.tsx.template
│   ├── utils/
│   │   ├── project-detector.ts
│   │   ├── provider-setup.ts
│   │   ├── file-generator.ts
│   │   └── s3-client.ts
│   └── index.ts
├── package.json
└── README.md
```

### Core Dependencies

```json
{
  "dependencies": {
    "commander": "^11.0.0",
    "inquirer": "^9.2.0", 
    "chalk": "^5.3.0",
    "ora": "^7.0.0",
    "fs-extra": "^11.1.0",
    "@aws-sdk/client-s3": "^3.427.0",
    "dotenv": "^16.3.0",
    "handlebars": "^4.7.8"
  }
}
```

### Project Detection Logic

```typescript
interface ProjectInfo {
  framework: 'nextjs' | 'unknown';
  version: string;
  router: 'app' | 'pages' | 'unknown';
  typescript: boolean;
  cssFramework: 'tailwind' | 'styled-components' | 'css-modules' | 'none';
  packageManager: 'npm' | 'yarn' | 'pnpm';
  hasExistingUpload: boolean;
}

export async function detectProject(): Promise<ProjectInfo> {
  // Implementation details for detection logic
}
```

### Provider Setup Interface

```typescript
interface ProviderSetup {
  detect(): Promise<ProviderCredentials>;
  validate(credentials: ProviderCredentials): Promise<boolean>;
  createBucket(config: BucketConfig): Promise<void>;
  testConnection(): Promise<boolean>;
  generateConfig(): ProviderConfig;
}

export class AWSSetup implements ProviderSetup {
  // AWS-specific implementation
}
```

## 🧪 Testing Strategy

### Unit Tests

- Project detection accuracy
- Template generation correctness
- Provider configuration validation
- Error handling scenarios

### Integration Tests  

- Full CLI flow simulation
- AWS bucket creation/validation
- Generated code compilation
- API route functionality

### E2E Tests

- Complete setup flow
- File upload verification
- Multiple provider testing
- Error recovery testing

## 📊 Success Metrics

### Developer Experience

- Setup time: < 2 minutes (from 30+ minutes)
- Success rate: > 95% first-time setup
- Support tickets: < 5% of users need help
- Developer satisfaction: > 9/10 rating

### Technical Performance

- CLI execution time: < 30 seconds
- Generated code size: < 50KB
- Bundle impact: < 10KB additional
- Test coverage: > 90%

### Adoption Metrics

- CLI usage: > 80% of new users
- Example retention: > 60% keep generated examples
- Documentation views: < 20% need additional docs
- Conversion rate: > 90% complete setup

## 🚀 Implementation Timeline

### Week 1-2: Core CLI Foundation

- [ ] Project setup and basic CLI structure
- [ ] Project detection system
- [ ] Interactive prompts and UI
- [ ] Basic template system

### Week 3-4: Provider Integration

- [ ] AWS S3 setup and validation
- [ ] Cloudflare R2 integration
- [ ] Bucket creation automation
- [ ] Credential management

### Week 5-6: Code Generation

- [ ] Template engine implementation
- [ ] API route generation
- [ ] Component generation
- [ ] Configuration file creation

### Week 7-8: Polish & Testing

- [ ] Error handling and recovery
- [ ] Comprehensive testing
- [ ] Documentation integration
- [ ] Performance optimization

## 🎯 Future Enhancements

### Advanced Features

- Multi-provider setup in single project
- Custom middleware generation
- Database integration helpers
- Monitoring and analytics setup

### Framework Expansions

- Remix support
- SvelteKit integration
- Astro compatibility
- Vue.js/Nuxt support

### Developer Tools

- VSCode extension
- Browser dev tools integration
- Real-time upload monitoring
- Performance profiling

This CLI will transform pushduck from a technical library into a complete developer experience that rivals the best tools in the ecosystem.

---

# 🚀 Zero-Config Setup (CLI Init) - DX Planning

## 🎯 Vision: 2-Minute Setup Experience

**Goal**: Transform the setup from 30 minutes of manual configuration to 2 minutes of guided automation.

## 📋 Current vs Target Experience

### **Current Experience (30+ minutes)** 😤

```bash
# Step 1: Install package
npm install pushduck

# Step 2: Manually create API route
mkdir -p app/api/s3-upload
touch app/api/s3-upload/route.ts
# Copy-paste boilerplate code...

# Step 3: Setup environment variables
touch .env.local
# Figure out which variables are needed...
# Find AWS credentials...

# Step 4: Create upload configuration
touch upload.ts
# Copy-paste configuration...

# Step 5: Build upload component
# Write your own dropzone, progress bars, etc...

# Step 6: Debug connection issues
# Trial and error with S3 permissions...
```

### **Target Experience (2 minutes)** ✨

```bash
# One command setup
npx pushduck@latest init

# Interactive wizard handles everything
# Working upload in 2 minutes
```

## 🎨 Detailed CLI Experience Design

### **1. Initial Command**

```bash
npx pushduck@latest init
```

### **2. Welcome & Detection**

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   🚀 Welcome to Pushduck                       │
│                                                             │
│   Let's get your file uploads working in 2 minutes!        │
│                                                             │
└─────────────────────────────────────────────────────────────┘

🔍 Detecting your project...
  ✓ Next.js 15.3.3 detected
  ✓ TypeScript enabled
  ✓ App Router detected
  ✓ Tailwind CSS detected
```

### **3. Provider Selection**

```
📦 Choose your storage provider:

  ○ AWS S3              Most popular, reliable
  ○ Cloudflare R2        Zero egress fees, fast
  ○ DigitalOcean Spaces  Simple, affordable
  ○ MinIO               Self-hosted, S3-compatible
  ○ Google Cloud Storage Enterprise features

❯ AWS S3

  Need help choosing? https://docs.pushduck.com/providers
```

### **4. Environment Detection & Setup**

```
🔧 Setting up AWS S3...

🔍 Checking for existing credentials...
  ✓ Found AWS_ACCESS_KEY_ID in environment
  ✓ Found AWS_SECRET_ACCESS_KEY in environment
  ⚠ AWS_REGION not found
  ⚠ S3_BUCKET not found

📝 Let's configure the missing variables:

AWS Region: (us-east-1) › us-west-2
S3 Bucket name: › my-app-uploads

🔒 Would you like to create the S3 bucket automatically? (y/N) › y

  Creating S3 bucket 'my-app-uploads' in us-west-2...
  ✓ Bucket created successfully
  ✓ CORS configuration applied
  ✓ Public read access configured
```

### **5. Route Generation**

```
🛠️ Generating API routes...

📁 Where should we create the upload API? 
  ○ app/api/upload/route.ts     (recommended)
  ○ app/api/s3-upload/route.ts  (classic)
  ○ Custom path

❯ app/api/upload/route.ts

✓ Created app/api/upload/route.ts
✓ Added upload configuration to lib/upload-config.ts
```

### **6. Example Generation**

```
🎨 Generate example upload page?

  ○ Yes, create app/upload/page.tsx with full example
  ○ Yes, just add components to my existing page
  ○ No, I'll build my own

❯ Yes, create app/upload/page.tsx with full example

✓ Created app/upload/page.tsx
✓ Added upload components to components/ui/
✓ Updated your layout with necessary providers
```

### **7. Package Installation**

```
📦 Installing dependencies...

  Adding to package.json:
  ✓ pushduck@latest
  ✓ @aws-sdk/client-s3 (for AWS S3)

  npm install...
  ✓ Dependencies installed
```

### **8. Configuration Summary**

```
🎉 Setup complete! Here's what was created:

📁 Files created:
  ├── app/api/upload/route.ts        # Upload API endpoint
  ├── app/upload/page.tsx            # Example upload page  
  ├── lib/upload-config.ts           # Upload configuration
  ├── components/ui/upload-zone.tsx  # Drag & drop component
  └── .env.local                     # Environment variables

🔧 Configuration:
  Provider: AWS S3
  Bucket: my-app-uploads
  Region: us-west-2
  API Route: /api/upload

🚀 Next steps:
  1. Run: npm run dev
  2. Visit: http://localhost:3000/upload
  3. Try uploading a file!

📚 Documentation: https://docs.pushduck.com
```

### **9. First Run Verification**

```
🔍 Testing your setup...

  ✓ API route responds correctly
  ✓ S3 connection successful
  ✓ Upload permissions configured
  ✓ Example page renders

🎉 Everything looks good! Your upload system is ready.
```

## 📁 Generated File Structure

### **API Route** (`app/api/upload/route.ts`)

```typescript
import { uploadRouter } from "@/lib/upload-config";

export const { GET, POST } = uploadRouter.handlers;
```

### **Upload Configuration** (`lib/upload-config.ts`)

```typescript
import { createS3Router, uploadConfig, initializeUploadConfig } from "pushduck/server";

// Configure your upload routes
const uploadRouter = createS3Router({
  // Simple file upload
  fileUpload: uploadConfig.aws()
    .file()
    .maxSize("10MB")
    .allowedTypes(["image/*", "application/pdf", "text/*"])
    .build(),

  // Image upload with processing
  imageUpload: uploadConfig.aws()
    .image()
    .maxSize("5MB")
    .allowedTypes(["image/jpeg", "image/png", "image/webp"])
    .build(),
});

// Initialize with your configuration
const { s3 } = initializeUploadConfig({
  provider: uploadConfig.provider("aws",{
    region: process.env.AWS_REGION!,
    bucket: process.env.S3_BUCKET!,
  }).build()
});

export { uploadRouter, s3 };
export type UploadRouter = typeof uploadRouter;
```

### **Example Upload Page** (`app/upload/page.tsx`)

```typescript
"use client";

import { useS3Upload } from "pushduck";
import { UploadZone } from "@/components/ui/upload-zone";
import type { UploadRouter } from "@/lib/upload-config";

export default function UploadPage() {
  const { uploadFiles, files, isUploading } = useS3Upload<UploadRouter>("fileUpload");

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">File Upload</h1>
      
      <UploadZone
        onDrop={uploadFiles}
        accept="image/*,application/pdf,text/*"
        maxSize="10MB"
        disabled={isUploading}
        className="mb-6"
      />

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <div key={file.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded">
              <span className="flex-1">{file.name}</span>
              <span className="text-sm text-gray-500">{file.progress}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### **Upload Component** (`components/ui/upload-zone.tsx`)

```typescript
"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onDrop: (files: File[]) => void;
  accept?: string;
  maxSize?: string;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function UploadZone({ 
  onDrop, 
  accept, 
  maxSize, 
  disabled, 
  className,
  children 
}: UploadZoneProps) {
  const handleDrop = useCallback((acceptedFiles: File[]) => {
    onDrop(acceptedFiles);
  }, [onDrop]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: accept ? { [accept]: [] } : undefined,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer transition-colors",
        "hover:border-gray-400 hover:bg-gray-50",
        isDragActive && "border-blue-500 bg-blue-50",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <input {...getInputProps()} />
      {children || (
        <div>
          <p className="text-lg font-medium text-gray-700">
            {isDragActive ? "Drop files here" : "Drag & drop files or click to select"}
          </p>
          {maxSize && (
            <p className="text-sm text-gray-500 mt-1">
              Maximum file size: {maxSize}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

### **Environment Variables** (`.env.local`)

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-west-2
S3_BUCKET=my-app-uploads

# Optional: Custom domain for uploaded files
# S3_CUSTOM_DOMAIN=https://cdn.yourdomain.com
```

## 🎮 Advanced CLI Features

### **Update Command**

```bash
npx pushduck update
# Updates configuration, adds new features, migrates breaking changes
```

### **Add Route Command**

```bash
npx pushduck add route
# Interactive route generator
# Adds new upload routes to existing configuration
```

### **Test Command**

```bash
npx pushduck test
# Tests S3 connection, permissions, and configuration
```

### **Deploy Command**

```bash
npx pushduck deploy
# Helps with production deployment configuration
```

## 🚀 Implementation Plan

### **Phase 1: Core CLI (Week 1-2)**

- [ ] Basic CLI scaffold with commander.js
- [ ] Project detection (Next.js version, TypeScript, etc.)
- [ ] Provider selection flow
- [ ] File generation templates

### **Phase 2: Provider Integration (Week 2-3)**

- [ ] AWS S3 auto-setup with bucket creation
- [ ] Cloudflare R2 integration
- [ ] Environment variable management
- [ ] Credentials validation

### **Phase 3: Code Generation (Week 3-4)**

- [ ] API route generation
- [ ] Upload configuration generation
- [ ] Example page generation
- [ ] Component generation

### **Phase 4: Polish & Testing (Week 4)**

- [ ] Error handling and recovery
- [ ] Progress indicators
- [ ] Success verification
- [ ] Documentation integration

## 💡 Key DX Principles

1. **Intelligent Defaults**: Assume sensible configurations
2. **Progressive Enhancement**: Basic setup first, advanced features optional
3. **Clear Feedback**: Show what's happening at each step
4. **Error Recovery**: Help users fix issues automatically
5. **Educational**: Explain what each step does and why

This CLI would transform pushduck from "another upload library" to "the easiest way to add file uploads to Next.js" - a true zero-config experience that gets developers from zero to working uploads in under 2 minutes.
