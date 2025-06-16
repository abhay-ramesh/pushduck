# 🚀 Next S3 Uploader Demo Setup

This demo showcases the new **File Router Architecture** with DX-friendly environment variable configuration.

## 📋 Quick Setup (2 minutes)

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure S3 Credentials

Create `.env.local` in the demo app root with your S3 credentials:

```bash
# Simple naming (recommended)
S3_ACCESS_KEY_ID=your_access_key_here
S3_SECRET_ACCESS_KEY=your_secret_key_here
S3_REGION=us-east-1
S3_BUCKET=your-bucket-name
```

### 3. Start Development Server

```bash
pnpm dev
```

That's it! 🎉 The app will automatically detect your S3 configuration.

## 🔧 Environment Variable Options

The library supports **multiple naming conventions** for maximum compatibility:

### Option 1: Simple Naming (Recommended)

```bash
S3_ACCESS_KEY_ID=your_access_key_here
S3_SECRET_ACCESS_KEY=your_secret_key_here
S3_REGION=us-east-1
S3_BUCKET=your-bucket-name
```

### Option 2: AWS SDK Compatible

```bash
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

### Option 3: Prefixed (Multiple Services)

```bash
NEXT_S3_ACCESS_KEY_ID=your_access_key_here
NEXT_S3_SECRET_ACCESS_KEY=your_secret_key_here
NEXT_S3_REGION=us-east-1
NEXT_S3_BUCKET=your-bucket-name
```

## 🌐 Provider-Specific Setup

### Amazon S3

```bash
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
S3_REGION=us-east-1
S3_BUCKET=my-app-uploads
```

### MinIO (Self-hosted)

```bash
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=uploads
S3_FORCE_PATH_STYLE=true
```

### Cloudflare R2

```bash
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
S3_BUCKET=my-r2-bucket
S3_REGION=auto
```

### DigitalOcean Spaces

```bash
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_BUCKET=my-space-name
S3_REGION=nyc3
```

## ⚙️ Advanced Configuration

### Custom Domain (CDN)

```bash
S3_CUSTOM_DOMAIN=https://cdn.yourdomain.com
```

### File Size Limits

```bash
S3_MAX_FILE_SIZE=10MB
```

### Access Control

```bash
S3_ACL=private  # or public-read, public-read-write, authenticated-read
```

### Debug Mode

```bash
S3_DEBUG=true  # Automatically enabled in development
```

## 🔍 How It Works

The new DX implementation:

1. **Auto-Detection**: Automatically detects S3 config from environment variables
2. **Multiple Conventions**: Supports AWS SDK, simple, and prefixed naming
3. **Provider Agnostic**: Works with AWS S3, MinIO, R2, Spaces, etc.
4. **Helpful Errors**: Clear error messages with setup instructions
5. **Zero Config**: Sensible defaults for most use cases

## 🚨 Troubleshooting

### Missing Configuration Error

If you see configuration errors, make sure:

1. `.env.local` exists in the app root
2. All required variables are set
3. Restart the development server after changes

### Provider-Specific Issues

- **MinIO**: Set `S3_FORCE_PATH_STYLE=true`
- **R2**: Use `S3_REGION=auto`
- **Custom Endpoints**: Include protocol (`https://`)

## 📖 API Reference

The demo uses the new router architecture:

```typescript
// Server-side route definition
const s3Router = createS3Router({
  imageUpload: s3.image()
    .max("5MB")
    .formats(["jpeg", "png", "webp"])
    .middleware(async ({ req }) => {
      // Authentication, validation, etc.
      return { userId: "user123" };
    })
    .onUploadComplete(async ({ file, metadata, url }) => {
      // Post-processing, database updates, etc.
      console.log(`Upload complete: ${url}`);
    })
});

// Client-side usage
const { startUpload, files, isUploading } = useS3UploadRoute("imageUpload");
```

## 🎯 Next Steps

1. **Production Setup**: Configure your S3 bucket and IAM permissions
2. **Authentication**: Add real authentication in middleware
3. **Database**: Save file metadata to your database
4. **Processing**: Add image resizing, virus scanning, etc.
5. **UI**: Customize the upload components for your design system

---

**Need help?** Check the [main documentation](../../packages/next-s3-uploader/README.md) or [roadmap](../../packages/next-s3-uploader/GOLD_STANDARD_DX_ROADMAP.md).
