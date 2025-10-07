/**
 * @fileoverview pushduck - Client-side exports
 *
 * This module provides all client-side functionality for React components and hooks.
 * It serves as the main entry point for client-side pushduck usage, offering:
 *
 * - **Upload Client**: Type-safe client with property-based access
 * - **React Hooks**: Hooks for file uploads with progress tracking
 * - **Client Metadata**: Pass contextual data from UI to server
 * - **Utility Functions**: File formatting and helper utilities
 * - **Type Definitions**: Comprehensive TypeScript types for client usage
 *
 * For server-side functionality (providers, schemas, routers), import from 'pushduck/server' instead.
 *
 * @example Basic Client Setup (Property-Based)
 * ```typescript
 * import { createUploadClient } from 'pushduck/client';
 * import type { AppRouter } from '@/lib/upload';
 *
 * // Create type-safe client
 * const upload = createUploadClient<AppRouter>({
 *   endpoint: '/api/upload'
 * });
 *
 * // Use in React component
 * function UploadComponent() {
 *   const { uploadFiles, files, isUploading } = upload.imageUpload();
 *
 *   return (
 *     <div>
 *       <input 
 *         type="file" 
 *         onChange={(e) => uploadFiles(Array.from(e.target.files || []))} 
 *       />
 *       {isUploading && <div>Uploading...</div>}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example Hook-Based Approach
 * ```typescript
 * import { useUploadRoute } from 'pushduck/client';
 * import type { AppRouter } from '@/lib/upload';
 *
 * function HookUpload() {
 *   const { uploadFiles, files, isUploading } = useUploadRoute<AppRouter>('imageUpload');
 *
 *   return (
 *     <div>
 *       <input 
 *         type="file" 
 *         multiple
 *         onChange={(e) => uploadFiles(Array.from(e.target.files || []))} 
 *       />
 *     </div>
 *   );
 * }
 * ```
 *
 * @example With Client-Side Metadata
 * ```typescript
 * import { createUploadClient } from 'pushduck/client';
 * import { useState } from 'react';
 *
 * function MetadataUpload() {
 *   const [albumId, setAlbumId] = useState('vacation-2025');
 *   const { uploadFiles } = upload.imageUpload();
 *
 *   const handleUpload = (files: File[]) => {
 *     // Pass UI context as metadata
 *     uploadFiles(files, {
 *       albumId: albumId,
 *       tags: ['vacation', 'summer'],
 *       visibility: 'private'
 *     });
 *   };
 *
 *   return (
 *     <div>
 *       <select value={albumId} onChange={(e) => setAlbumId(e.target.value)}>
 *         <option value="vacation-2025">Vacation 2025</option>
 *         <option value="family">Family Photos</option>
 *       </select>
 *       <input type="file" multiple onChange={(e) => handleUpload(Array.from(e.target.files || []))} />
 *     </div>
 *   );
 * }
 * ```
 *
 * @example Advanced Upload with Progress
 * ```typescript
 * import { useUploadRoute, formatETA, formatUploadSpeed } from 'pushduck/client';
 *
 * function AdvancedUpload() {
 *   const {
 *     uploadFiles,
 *     files,
 *     isUploading,
 *     progress,
 *     uploadSpeed,
 *     eta,
 *     errors
 *   } = useUploadRoute<AppRouter>('documentUpload', {
 *     onProgress: (progress) => console.log(`Progress: ${progress}%`),
 *     onSuccess: (results) => console.log('Completed:', results),
 *     onError: (error) => console.error('Failed:', error),
 *   });
 *
 *   return (
 *     <div>
 *       {isUploading && (
 *         <div>
 *           <div>Progress: {progress}%</div>
 *           <div>Speed: {uploadSpeed ? formatUploadSpeed(uploadSpeed) : 'Calculating...'}</div>
 *           <div>ETA: {eta ? formatETA(eta) : 'Calculating...'}</div>
 *         </div>
 *       )}
 *       {errors.length > 0 && <div>Errors: {errors.join(', ')}</div>}
 *     </div>
 *   );
 * }
 * ```
 *
 */

// ========================================
// ENHANCED CLIENT
// ========================================

/**
 * Type-safe upload client with enhanced type inference.
 * Creates a client that knows about your router's routes and their types.
 *
 * @example Basic Client Creation
 * ```typescript
 * import { createUploadClient } from 'pushduck';
 * import type { AppRouter } from './api/upload/route';
 *
 * const client = createUploadClient<AppRouter>({
 *   url: '/api/upload',
 * });
 *
 * // Type-safe uploads
 * const result = await client.profileImage.upload({ file });
 * const results = await client.documents.upload({ files: [file1, file2] });
 * ```
 *
 * @example Client with Custom Configuration
 * ```typescript
 * const client = createUploadClient<AppRouter>({
 *   url: '/api/upload',
 *   headers: {
 *     'Authorization': `Bearer ${token}`,
 *   },
 *   timeout: 30000, // 30 seconds
 *   retries: 3,
 * });
 * ```
 */
export { createUploadClient } from "./client/upload-client";

// ========================================
// HOOKS
// ========================================

/**
 * Main React hook for file uploads with comprehensive state management.
 * Provides upload functionality, progress tracking, and error handling.
 *
 * @example Basic Hook Usage
 * ```typescript
 * import { useUploadRoute } from 'pushduck';
 *
 * function UploadComponent() {
 *   const { upload, isUploading, progress, error } = useUploadRoute({
 *     client,
 *     route: 'profileImage',
 *   });
 *
 *   const handleUpload = async (file: File) => {
 *     try {
 *       const result = await upload({ file });
 *       console.log('Uploaded to:', result.url);
 *     } catch (error) {
 *       console.error('Upload failed:', error);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={(e) => handleUpload(e.target.files[0])} />
 *       {isUploading && <div>Uploading... {progress}%</div>}
 *       {error && <div>Error: {error.message}</div>}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example Hook with Lifecycle Callbacks
 * ```typescript
 * const { upload, isUploading, progress } = useUploadRoute({
 *   client,
 *   route: 'documents',
 *   onStart: () => console.log('Upload started'),
 *   onProgress: (progress) => console.log(`Progress: ${progress}%`),
 *   onComplete: (result) => console.log('Upload complete:', result),
 *   onError: (error) => console.error('Upload failed:', error),
 * });
 * ```
 */
export { useUploadRoute } from "./hooks";

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Utility functions for formatting file upload information.
 * Provides human-readable formatting for upload speed and time estimates.
 *
 * @example Formatting Utilities
 * ```typescript
 * import { formatETA, formatUploadSpeed } from 'pushduck';
 *
 * const uploadSpeed = 1048576; // bytes per second
 * const eta = 30; // seconds
 *
 * console.log(`Speed: ${formatUploadSpeed(uploadSpeed)}`); // "Speed: 1.0 MB/s"
 * console.log(`ETA: ${formatETA(eta)}`); // "ETA: 30s"
 * ```
 *
 * @example In Upload Progress Display
 * ```typescript
 * function UploadProgress({ uploadSpeed, eta, progress }) {
 *   return (
 *     <div>
 *       <div>Progress: {progress}%</div>
 *       <div>Speed: {formatUploadSpeed(uploadSpeed)}</div>
 *       <div>Time remaining: {formatETA(eta)}</div>
 *     </div>
 *   );
 * }
 * ```
 */
export { formatETA, formatUploadSpeed } from "./hooks/use-upload-route";

// ========================================
// CLIENT-SAFE TYPES (EXISTING)
// ========================================

/**
 * Core client-side types for file metadata and upload results.
 * These types are safe to use in client-side code and don't contain server-specific information.
 *
 * @example Using File Metadata
 * ```typescript
 * import type { S3FileMetadata, S3UploadedFile } from 'pushduck';
 *
 * const fileMetadata: S3FileMetadata = {
 *   name: 'document.pdf',
 *   size: 1048576,
 *   type: 'application/pdf',
 * };
 *
 * const uploadedFile: S3UploadedFile = {
 *   ...fileMetadata,
 *   url: 'https://bucket.s3.amazonaws.com/uploads/document.pdf',
 *   key: 'uploads/document.pdf',
 * };
 * ```
 */
export type {
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3UploadedFile,
} from "./types";

// ========================================
// ENHANCED TYPES
// ========================================

/**
 * Enhanced type-safe client types with router inference.
 * Provides full TypeScript support for upload clients and hooks.
 *
 * @example Type-safe Client Usage
 * ```typescript
 * import type { InferClientRouter, TypedRouteHook } from 'pushduck';
 * import type { AppRouter } from './api/upload/route';
 *
 * // Infer client router type
 * type ClientRouter = InferClientRouter<AppRouter>;
 *
 * // Type-safe hook usage
 * const profileImageHook: TypedRouteHook<AppRouter, 'profileImage'> = useUploadRoute({
 *   client,
 *   route: 'profileImage',
 * });
 * ```
 *
 * @example Router Route Names
 * ```typescript
 * import type { RouterRouteNames } from 'pushduck';
 * import type { AppRouter } from './api/upload/route';
 *
 * type RouteNames = RouterRouteNames<AppRouter>; // 'profileImage' | 'documents' | ...
 *
 * function UploadSelector({ route }: { route: RouteNames }) {
 *   const { upload } = useUploadRoute({ client, route });
 *   // ...
 * }
 * ```
 */
export type {
  ClientConfig,
  InferClientRouter,
  RouterRouteNames,
  S3Router,
  TypedRouteHook,
  TypedUploadedFile,
} from "./types";
