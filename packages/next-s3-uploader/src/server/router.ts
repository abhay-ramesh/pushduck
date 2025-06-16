/**
 * S3 Router Implementation
 *
 * Provides the core routing functionality for handling S3 upload requests
 * with route-based configuration and schema validation.
 */

// Re-export all router functionality from the main implementation
export {
  createS3Handler,
  createS3Router,
  S3Route,
  S3Router,
  type CompletionResponse,
  type GetRoute,
  type InferRouteInput,
  type InferRouteMetadata,
  type InferRouteOutput,
  type InferRouterRoutes,
  type PresignedUrlResponse,
  type S3FileMetadata,
  type S3LifecycleContext,
  type S3LifecycleHook,
  type S3Middleware,
  type S3MiddlewareContext,
  type S3RouteContext,
  type S3RouterDefinition,
  type UploadCompletion,
} from "../core/router-v2";
