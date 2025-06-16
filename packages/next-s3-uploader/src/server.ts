/**
 * Server-side exports for next-s3-uploader
 *
 * This file provides all server-side functionality including:
 * - S3 configuration and client
 * - Router implementations (both original and fixed)
 * - Schema builders
 * - Type utilities
 */

// Core S3 functionality (server-only)
export * from "./core/config";
export * from "./core/s3-client";

// Schema and validation (server-only)
export * from "./core/schema";

// Router implementations (server-only) - Values
export {
  createS3Handler,
  createS3Router,
  S3Route,
  S3Router,
} from "./core/router";

// Router implementations (server-only) - Types
export type {
  GetRoute,
  InferRouteInput,
  InferRouteMetadata,
  InferRouteOutput,
  InferRouterRoutes,
  S3LifecycleContext,
  S3LifecycleHook,
  S3Middleware,
  S3MiddlewareContext,
  S3RouteContext,
  S3RouterDefinition,
} from "./core/router";

// Fixed router implementation - Values
export {
  createS3Handler as createS3HandlerV2,
  createS3Router as createS3RouterV2,
  S3Router as S3RouterV2,
  S3Route as S3RouteV2,
} from "./core/router-v2";

// Main s3 builder instance (server-only)
import { createS3Router, S3RouterDefinition } from "./core/router-v2";
import {
  S3FileConstraints,
  S3FileSchema,
  S3ImageSchema,
  S3ObjectSchema,
} from "./core/schema";

export const s3 = {
  // Schema builders
  file: (constraints?: S3FileConstraints) => new S3FileSchema(constraints),
  image: (constraints?: S3FileConstraints) => new S3ImageSchema(constraints),
  object: <T extends Record<string, any>>(shape: T) =>
    new S3ObjectSchema(shape),

  // Router factory
  createRouter: <TRoutes extends S3RouterDefinition>(routes: TRoutes) =>
    createS3Router(routes),
} as const;

// Re-export specific server utilities
export {
  createS3Client,
  generatePresignedUrls,
  uploadFileInChunks,
} from "./utils";
