/**
 * Fixed File Router Architecture for pushduck
 *
 * This implements the correct upload flow:
 * 1. Client requests presigned URLs
 * 2. Server generates presigned URLs
 * 3. Client uploads directly to S3
 * 4. Client notifies completion
 */

import { NextRequest } from "next/server";

import { UploadConfig } from "../config/upload-config";
import { createUniversalHandler } from "../handler/universal-handler";
import { InferS3Input, InferS3Output, S3Schema } from "../schema";
import {
  generateFileKey,
  generatePresignedDownloadUrl,
  generatePresignedUploadUrl,
  getFileUrl,
} from "../storage/client";

// ========================================
// Core Router Types
// ========================================

export interface S3RouteContext {
  req: NextRequest;
  metadata?: Record<string, any>;
}

export interface S3FileMetadata {
  name: string;
  size: number;
  type: string;
}

export interface S3MiddlewareContext extends S3RouteContext {
  file: S3FileMetadata;
}

export interface S3LifecycleContext<T = any> {
  file: S3FileMetadata;
  metadata: T;
  url?: string;
  key?: string;
}

export type S3Middleware<TInput = any, TOutput = any> = (
  ctx: S3MiddlewareContext & { metadata: TInput }
) => Promise<TOutput> | TOutput;

export type S3LifecycleHook<T = any> = (
  ctx: S3LifecycleContext<T>
) => Promise<void> | void;

// ========================================
// Hierarchical Path Configuration Types
// ========================================

export interface PathContext<TMetadata = any> {
  file: { name: string; type: string };
  metadata: TMetadata;
  globalConfig: {
    prefix?: string;
    generateKey?: (
      file: { name: string; type: string },
      metadata: any
    ) => string;
  };
  routeName: string;
}

export interface S3RoutePathConfig<TMetadata = any> {
  // Route-level prefix gets nested under global prefix
  // Final path: {globalPrefix}/{routePrefix}/{generated}
  prefix?: string;

  // Route-level key generation function
  // Receives global config context for composition
  generateKey?: (ctx: PathContext<TMetadata>) => string;

  // Simple suffix that gets appended to global paths
  // Final path: {globalPath}/{suffix}
  suffix?: string;
}

// ========================================
// Route Configuration
// ========================================

export class S3Route<TSchema extends S3Schema = S3Schema, TMetadata = any> {
  constructor(
    private schema: TSchema,
    private config: S3RouteConfig<TMetadata> = {}
  ) {}

  // Middleware registration
  middleware<TNewMetadata>(
    middleware: S3Middleware<TMetadata, TNewMetadata>
  ): S3Route<TSchema, TNewMetadata> {
    const newConfig: S3RouteConfig<TNewMetadata> = {
      middleware: [
        ...(this.config.middleware || []),
        middleware as S3Middleware<any, any>,
      ],
    };
    return new S3Route(this.schema, newConfig);
  }

  // Hierarchical path configuration
  paths(paths: S3RoutePathConfig<TMetadata>): this {
    this.config.paths = { ...this.config.paths, ...paths };
    return this;
  }

  // Lifecycle hooks
  onUploadStart(hook: S3LifecycleHook<TMetadata>): this {
    this.config.onUploadStart = hook;
    return this;
  }

  onUploadProgress(
    hook: (
      ctx: S3LifecycleContext<TMetadata> & { progress: number }
    ) => Promise<void> | void
  ): this {
    this.config.onUploadProgress = hook;
    return this;
  }

  onUploadComplete(hook: S3LifecycleHook<TMetadata>): this {
    this.config.onUploadComplete = hook;
    return this;
  }

  onUploadError(
    hook: (
      ctx: S3LifecycleContext<TMetadata> & { error: Error }
    ) => Promise<void> | void
  ): this {
    this.config.onUploadError = hook;
    return this;
  }

  // Internal method to get configuration
  _getConfig(): S3RouteConfig<TMetadata> & { schema: TSchema } {
    return { ...this.config, schema: this.schema };
  }
}

interface S3RouteConfig<TMetadata = any> {
  middleware?: S3Middleware<any, any>[];
  paths?: S3RoutePathConfig<TMetadata>;
  onUploadStart?: S3LifecycleHook<TMetadata>;
  onUploadProgress?: (
    ctx: S3LifecycleContext<TMetadata> & { progress: number }
  ) => Promise<void> | void;
  onUploadComplete?: S3LifecycleHook<TMetadata>;
  onUploadError?: (
    ctx: S3LifecycleContext<TMetadata> & { error: Error }
  ) => Promise<void> | void;
}

// ========================================
// Hierarchical Path Generation Logic
// ========================================

function generateHierarchicalPath<TMetadata>(
  file: { name: string; type: string },
  metadata: TMetadata,
  routeName: string,
  routeConfig: S3RoutePathConfig<TMetadata> | undefined,
  globalConfig:
    | {
        prefix?: string;
        generateKey?: (
          file: { name: string; type: string },
          metadata: any
        ) => string;
      }
    | undefined,
  uploadConfig: UploadConfig
): string {
  // Build path context for route-level functions
  const pathContext: PathContext<TMetadata> = {
    file,
    metadata,
    globalConfig: globalConfig || {},
    routeName,
  };

  // If route has custom generateKey, use it with full context
  if (routeConfig?.generateKey) {
    return routeConfig.generateKey(pathContext);
  }

  // Build hierarchical path: global + route components
  const pathParts: string[] = [];

  // 1. Start with global prefix (if any)
  const globalPrefix = globalConfig?.prefix || "uploads";
  pathParts.push(globalPrefix);

  // 2. Add route-level prefix (if any)
  if (routeConfig?.prefix) {
    pathParts.push(routeConfig.prefix);
  }

  // 3. Generate the file path
  let filePath: string;

  if (globalConfig?.generateKey) {
    // Use global generateKey for the file part
    filePath = globalConfig.generateKey(file, metadata);
    // Remove global prefix if it was added by global generateKey to avoid duplication
    if (filePath.startsWith(globalPrefix + "/")) {
      filePath = filePath.substring(globalPrefix.length + 1);
    }
  } else {
    // Use default generation for the file part
    filePath = generateFileKey(uploadConfig, {
      originalName: file.name,
      userId: (metadata as any)?.userId || (metadata as any)?.user?.id,
      prefix: "", // Don't add prefix here, we're building it hierarchically
    });
  }

  pathParts.push(filePath);

  // 4. Add route-level suffix (if any)
  if (routeConfig?.suffix) {
    pathParts.push(routeConfig.suffix);
  }

  // Join all parts and clean up any double slashes
  return pathParts.join("/").replace(/\/+/g, "/");
}

// ========================================
// Router Implementation
// ========================================

export type S3RouterDefinition = Record<string, S3Route<any, any>>;

export class S3Router<TRoutes extends S3RouterDefinition> {
  private config: UploadConfig;
  private routes: TRoutes;

  constructor(routes: TRoutes, config: UploadConfig) {
    this.routes = routes;
    this.config = config;
  }

  getRoute<K extends keyof TRoutes>(routeName: K): TRoutes[K] | undefined {
    return this.routes[routeName];
  }

  getRouteNames(): (keyof TRoutes)[] {
    return Object.keys(this.routes);
  }

  get handlers() {
    return createUniversalHandler(this, this.config);
  }

  // Generate presigned URLs for upload
  async generatePresignedUrls<K extends keyof TRoutes>(
    routeName: K,
    req: NextRequest,
    files: S3FileMetadata[]
  ): Promise<PresignedUrlResponse[]> {
    const route = this.getRoute(routeName);
    if (!route) {
      throw new Error(`Route "${String(routeName)}" not found`);
    }

    const routeConfig = route._getConfig();
    const uploadConfig = this.config;
    const results: PresignedUrlResponse[] = [];

    for (const file of files) {
      try {
        // 1. Run middleware chain
        let metadata: any = {};
        const middlewareChain = routeConfig.middleware || [];

        for (const middleware of middlewareChain) {
          metadata = await middleware({ req, file, metadata });
        }

        // 2. Validate file against schema (metadata only)
        const mockFile = new File([], file.name, { type: file.type });
        Object.defineProperty(mockFile, "size", { value: file.size });

        const validationResult = await routeConfig.schema.validate(mockFile);
        if (!validationResult.success) {
          throw new Error(
            validationResult.error?.message || "Validation failed"
          );
        }

        // 3. Call onUploadStart hook
        if (routeConfig.onUploadStart) {
          await routeConfig.onUploadStart({ file, metadata });
        }

        // 4. Generate hierarchical file key
        const key = generateHierarchicalPath(
          { name: file.name, type: file.type },
          metadata,
          String(routeName),
          routeConfig.paths,
          uploadConfig.paths,
          uploadConfig
        );

        const presignedResult = await generatePresignedUploadUrl(uploadConfig, {
          key,
          contentType: file.type,
          contentLength: file.size,
          metadata: {
            originalName: file.name,
            userId: metadata.userId || metadata.user?.id || "anonymous",
            routeName: String(routeName),
          },
        });

        results.push({
          success: true,
          file,
          presignedUrl: presignedResult.url,
          key: presignedResult.key,
          metadata,
        });
      } catch (error) {
        const err =
          error instanceof Error
            ? error
            : new Error("Failed to generate presigned URL");

        // Call onUploadError hook
        if (routeConfig.onUploadError) {
          await routeConfig.onUploadError({ file, metadata: {}, error: err });
        }

        results.push({
          success: false,
          file,
          error: err.message,
        });
      }
    }

    return results;
  }

  // Handle upload completion notification
  async handleUploadComplete<K extends keyof TRoutes>(
    routeName: K,
    req: NextRequest,
    completions: UploadCompletion[]
  ): Promise<CompletionResponse[]> {
    const route = this.getRoute(routeName);
    if (!route) {
      throw new Error(`Route "${String(routeName)}" not found`);
    }

    const routeConfig = route._getConfig();
    const results: CompletionResponse[] = [];

    for (const completion of completions) {
      try {
        // Get file URL
        const url = getFileUrl(this.config, completion.key);

        // Generate presigned download URL (expires in 1 hour by default)
        const presignedUrl = await generatePresignedDownloadUrl(
          this.config,
          completion.key,
          3600
        );

        // Call onUploadComplete hook
        if (routeConfig.onUploadComplete) {
          await routeConfig.onUploadComplete({
            file: completion.file,
            metadata: completion.metadata || {},
            url,
            key: completion.key,
          });
        }

        results.push({
          success: true,
          key: completion.key,
          url,
          presignedUrl,
          file: completion.file,
        });
      } catch (error) {
        const err =
          error instanceof Error
            ? error
            : new Error("Upload completion failed");

        // Call onUploadError hook
        if (routeConfig.onUploadError) {
          await routeConfig.onUploadError({
            file: completion.file,
            metadata: completion.metadata || {},
            error: err,
          });
        }

        results.push({
          success: false,
          key: completion.key,
          error: err.message,
        });
      }
    }

    return results;
  }
}

// ========================================
// Response Types
// ========================================

export interface PresignedUrlResponse {
  success: boolean;
  file: S3FileMetadata;
  presignedUrl?: string;
  key?: string;
  metadata?: any;
  error?: string;
}

export interface UploadCompletion {
  key: string;
  file: S3FileMetadata;
  metadata?: any;
}

export interface CompletionResponse {
  success: boolean;
  key: string;
  url?: string;
  presignedUrl?: string; // Temporary download URL (expires in 1 hour)
  file?: S3FileMetadata;
  error?: string;
}

// ========================================
// Factory Functions
// ========================================

/**
 * ✅ Config-aware router factory
 * Creates router with explicit config dependency
 */
export function createS3RouterWithConfig<TRoutes extends S3RouterDefinition>(
  routes: TRoutes,
  config: UploadConfig
): S3Router<TRoutes> {
  return new S3Router(routes, config);
}

// ========================================
// Type Inference Utilities
// ========================================

export type InferRouterRoutes<T> =
  T extends S3Router<infer TRoutes> ? TRoutes : never;

export type InferRouteInput<T> =
  T extends S3Route<infer TSchema, any> ? InferS3Input<TSchema> : never;

export type InferRouteOutput<T> =
  T extends S3Route<infer TSchema, any> ? InferS3Output<TSchema> : never;

export type InferRouteMetadata<T> =
  T extends S3Route<any, infer TMetadata> ? TMetadata : never;

export type GetRoute<TRouter, TRouteName> =
  TRouter extends S3Router<infer TRoutes>
    ? TRouteName extends keyof TRoutes
      ? TRoutes[TRouteName]
      : never
    : never;
