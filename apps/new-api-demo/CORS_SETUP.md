# Fixing CORS Error for Cloudflare R2

## The Problem

When uploading files directly from the browser to Cloudflare R2, you may encounter CORS (Cross-Origin Resource Sharing) errors. This happens because R2 needs to be configured to allow browser requests from your domain.

## Solution: Configure CORS on Your R2 Bucket

### Method 1: Using Cloudflare Dashboard (Recommended)

1. **Go to Cloudflare Dashboard**
   - Navigate to R2 Object Storage
   - Select your bucket (`s3-uploader`)

2. **Configure CORS Settings**
   - Click on "Settings" tab
   - Scroll to "CORS Policy"
   - Add the following CORS configuration:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3002",
      "http://localhost:3000",
      "https://your-domain.com"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag",
      "x-amz-meta-*"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

### Method 2: Using Wrangler CLI

1. **Install Wrangler** (if not already installed):

```bash
npm install -g wrangler
```

2. **Create CORS configuration file** (`cors.json`):

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3002",
      "http://localhost:3000",
      "https://your-domain.com"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag",
      "x-amz-meta-*"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

3. **Apply CORS configuration**:

```bash
wrangler r2 bucket cors put s3-uploader --file cors.json
```

### Method 3: Using AWS CLI (S3 Compatible)

1. **Configure AWS CLI for R2**:

```bash
aws configure set aws_access_key_id YOUR_R2_ACCESS_KEY
aws configure set aws_secret_access_key YOUR_R2_SECRET_KEY
aws configure set region auto
```

2. **Create CORS configuration** (`cors.json`):

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "http://localhost:3002",
        "http://localhost:3000",
        "https://your-domain.com"
      ],
      "AllowedMethods": [
        "GET",
        "PUT",
        "POST",
        "DELETE",
        "HEAD"
      ],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": [
        "ETag",
        "x-amz-meta-*"
      ],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

3. **Apply CORS configuration**:

```bash
aws s3api put-bucket-cors \
  --bucket s3-uploader \
  --cors-configuration file://cors.json \
  --endpoint-url https://3911cf6ec506c34672930a50ea33b610.r2.cloudflarestorage.com
```

## Important Notes

### For Development

- Include `http://localhost:3002` (or your dev port) in `AllowedOrigins`
- Use `"*"` for `AllowedHeaders` during development

### For Production

- Replace `http://localhost:3002` with your actual domain
- Be more specific with `AllowedHeaders` for security:

  ```json
  "AllowedHeaders": [
    "Content-Type",
    "Content-Length",
    "Authorization",
    "x-amz-*"
  ]
  ```

### Common CORS Headers Needed

- `Content-Type`: For file type specification
- `Content-Length`: For file size
- `x-amz-*`: For S3 metadata headers
- `Authorization`: For signed requests

## Testing CORS Configuration

After applying the CORS configuration, test it:

```bash
curl -H "Origin: http://localhost:3002" \
     -H "Access-Control-Request-Method: PUT" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://s3-uploader.3911cf6ec506c34672930a50ea33b610.r2.cloudflarestorage.com/
```

You should see CORS headers in the response:

```
Access-Control-Allow-Origin: http://localhost:3002
Access-Control-Allow-Methods: PUT, POST, GET, DELETE, HEAD
Access-Control-Allow-Headers: Content-Type
```

## Troubleshooting

### Still Getting CORS Errors?

1. **Check the exact error message** in browser console
2. **Verify your domain** is in `AllowedOrigins`
3. **Wait a few minutes** for CORS changes to propagate
4. **Clear browser cache** and try again
5. **Check bucket name** matches your configuration

### Common Issues

- **Wrong bucket name**: Ensure bucket name in CORS config matches your actual bucket
- **Missing localhost**: Add your development URL to allowed origins
- **Case sensitivity**: Origins are case-sensitive
- **Protocol mismatch**: Use `https://` for production, `http://` for localhost

## Next Steps

After configuring CORS:

1. **Restart your development server**:

   ```bash
   pnpm dev
   ```

2. **Test file upload** in the browser at <http://localhost:3002>

3. **Check browser console** for any remaining errors

The upload should now work without CORS errors! 🎉
