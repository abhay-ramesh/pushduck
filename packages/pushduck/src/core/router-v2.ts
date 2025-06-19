/**
 * Fixed File Router Architecture for pushduck
 *
 * This implements the correct upload flow:
 * 1. Client requests presigned URLs
 * 2. Server generates presigned URLs
 * 3. Client uploads directly to S3
 * 4. Client notifies completion
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateFileKey,
  generatePresignedUploadUrl,
  getFileUrl,
} from "./s3-client";
import { InferS3Input, InferS3Output, S3Schema } from "./schema";
import { getUploadConfig } from "./upload-config";

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
// Router Implementation
// ========================================

export type S3RouterDefinition = Record<string, S3Route<any, any>>;

export class S3Router<TRoutes extends S3RouterDefinition> {
  constructor(private routes: TRoutes) {}

  // Get route configuration
  getRoute<K extends keyof TRoutes>(routeName: K): TRoutes[K] | undefined {
    return this.routes[routeName];
  }

  // Get all route names
  getRouteNames(): (keyof TRoutes)[] {
    return Object.keys(this.routes);
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

        // 4. Generate file key and presigned URL
        const key = generateFileKey({
          originalName: file.name,
          userId: metadata.userId || metadata.user?.id,
        });

        const presignedResult = await generatePresignedUploadUrl({
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
        const url = getFileUrl(completion.key);

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
  file?: S3FileMetadata;
  error?: string;
}

// ========================================
// Factory Functions
// ========================================

export function createS3Router<TRoutes extends S3RouterDefinition>(
  routes: TRoutes
): S3Router<TRoutes> {
  return new S3Router(routes);
}

export function createS3Handler<TRoutes extends S3RouterDefinition>(
  router: S3Router<TRoutes>
) {
  // Initialize upload configuration from upload.ts
  const uploadConfig = getUploadConfig();

  async function POST(req: NextRequest): Promise<NextResponse> {
    try {
      const url = new URL(req.url);
      const routeName = url.searchParams.get("route");
      const action = url.searchParams.get("action") || "presign";

      if (!routeName) {
        return NextResponse.json(
          { error: "Route parameter is required" },
          { status: 400 }
        );
      }

      if (!router.getRouteNames().includes(routeName)) {
        return NextResponse.json(
          { error: `Route "${routeName}" not found` },
          { status: 404 }
        );
      }

      const body = await req.json();

      if (action === "presign") {
        // Generate presigned URLs
        const { files } = body;

        if (!files || !Array.isArray(files)) {
          return NextResponse.json(
            { error: "Files array is required" },
            { status: 400 }
          );
        }

        const results = await router.generatePresignedUrls(
          routeName,
          req,
          files
        );

        return NextResponse.json({
          success: true,
          results,
        });
      } else if (action === "complete") {
        // Handle upload completion
        const { completions } = body;

        if (!completions || !Array.isArray(completions)) {
          return NextResponse.json(
            { error: "Completions array is required" },
            { status: 400 }
          );
        }

        const results = await router.handleUploadComplete(
          routeName,
          req,
          completions
        );

        return NextResponse.json({
          success: true,
          results,
        });
      } else {
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error("S3 Router Error:", error);
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Upload failed",
          details: process.env.NODE_ENV === "development" ? error : undefined,
        },
        { status: 500 }
      );
    }
  }

  async function GET(req: NextRequest): Promise<NextResponse> {
    // Return route information for debugging/introspection
    const routeNames = router.getRouteNames();
    return NextResponse.json({
      routes: routeNames,
      info: "S3 Router endpoints",
      actions: ["presign", "complete"],
    });
  }

  return { GET, POST };
}

// ========================================
// Type Utilities for End-to-End Type Safety
// ========================================

export type InferRouterRoutes<T> =
  T extends S3Router<infer TRoutes> ? TRoutes : never;

export type InferRouteInput<T> =
  T extends S3Route<infer TSchema, any> ? InferS3Input<TSchema> : never;

export type InferRouteOutput<T> =
  T extends S3Route<infer TSchema, any> ? InferS3Output<TSchema> : never;

export type InferRouteMetadata<T> =
  T extends S3Route<any, infer TMetadata> ? TMetadata : never;

// Helper type for getting route by name from router
export type GetRoute<TRouter, TRouteName> =
  TRouter extends S3Router<infer TRoutes>
    ? TRouteName extends keyof TRoutes
      ? TRoutes[TRouteName]
      : never
    : never;
