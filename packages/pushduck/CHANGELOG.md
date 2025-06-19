# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial public release as pushduck
- Chunked file upload support
- Private bucket support
- File validation (type and size)
- Upload cancellation
- Progress tracking with time estimation
- Comprehensive error handling with retries
- TypeScript type definitions
- Testing setup with Vitest
- ESLint and Prettier configuration
- Comprehensive documentation
- **Comprehensive S3-Compatible Provider Framework** - Added support framework for 11+ additional providers
  - **Enterprise Providers**: Azure Blob Storage, IBM Cloud Object Storage, Oracle OCI
  - **Cost-Optimized Providers**: Wasabi Hot Cloud Storage, Backblaze B2, Storj DCS  
  - **Specialized Providers**: Telnyx Storage, Tigris Data, Cloudian HyperStore
  - **Generic S3-Compatible Provider**: Support for any S3-compatible service with custom endpoints
- **Provider Implementation Guide** - Complete documentation for adding new providers (`PROVIDERS.md`)
- **Enhanced Type Safety** - Comprehensive TypeScript interfaces for all provider configurations
- **Future-Proof Architecture** - Easy-to-follow patterns for implementing new providers

### Changed

- Package renamed from next-s3-uploader to pushduck
- Improved S3 client configuration
- Enhanced error handling
- Better TypeScript support
- Updated dependencies to latest versions
- **Provider Type System** - Expanded from 5 to 16 provider types with organized tiers
- **Error Messages** - More descriptive error messages indicating coming-soon providers
- **Code Organization** - Structured provider support into logical tiers and categories

### Fixed

- Memory leaks in upload process
- Progress calculation accuracy
- Error handling in edge cases
- TypeScript type issues

## [0.1.0] - 2024-12-17

### Added

- Initial release of pushduck (migrated from next-s3-uploader)
- Complete S3 file upload functionality
- Support for AWS S3, MinIO, and S3-compatible services
- Progress tracking with real-time updates
- Comprehensive error handling
- TypeScript support
- Next.js App Router integration
- Client and server components
- Multi-provider support (AWS S3, Cloudflare R2, DigitalOcean Spaces, Google Cloud)
- CLI tool for quick setup
- AWS SDK v3 to aws4fetch migration (99.85% bundle size reduction)
- Multi-provider S3 compatibility with provider-specific optimizations

### Performance

- Build time improvement: 3-4x faster with tsdown
- Bundle size reduction: From 5.5MB+ to 80KB (aws4fetch)
- Removed unused AWS SDK dependencies
