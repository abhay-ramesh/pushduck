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

### Changed

- Package renamed from next-s3-uploader to pushduck
- Improved S3 client configuration
- Enhanced error handling
- Better TypeScript support
- Updated dependencies to latest versions

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
