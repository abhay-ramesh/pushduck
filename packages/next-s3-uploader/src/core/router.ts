/**
 * File Router Architecture for next-s3-uploader
 *
 * This implements the Uploadthing-inspired routing system with:
 * - Route-based upload endpoints
 * - Middleware system
 * - Lifecycle hooks
 * - End-to-end type safety
 */

import { NextRequest, NextResponse } from "next/server";
import { InferS3Input, InferS3Output, S3Schema } from "./schema";

// ========================================
// Core Router Types
// ========================================

export interface S3RouteContext {
  req: NextRequest;
  file: File;
  metadata?: Record<string, any>;
}

export interface S3MiddlewareContext extends S3RouteContext {
  // Additional context passed through middleware chain
}

export interface S3LifecycleContext<T = any> {
  file: File;
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

  // Process upload for specific route
  async processUpload<K extends keyof TRoutes>(
    routeName: K,
    req: NextRequest,
    files: File[]
  ): Promise<S3UploadResult[]> {
    const route = this.getRoute(routeName);
    if (!route) {
      throw new Error(`Route "${String(routeName)}" not found`);
    }

    const routeConfig = route._getConfig();
    const results: S3UploadResult[] = [];

    for (const file of files) {
      try {
        // 1. Run middleware chain
        let metadata: any = {};
        const middlewareChain = routeConfig.middleware || [];

        for (const middleware of middlewareChain) {
          metadata = await middleware({ req, file, metadata });
        }

        // 2. Validate file against schema
        const validationResult = await routeConfig.schema.validate(file);
        if (!validationResult.success) {
          throw new Error(
            validationResult.error?.message || "Validation failed"
          );
        }

        // 3. Call onUploadStart hook
        if (routeConfig.onUploadStart) {
          await routeConfig.onUploadStart({ file, metadata });
        }

        // 4. Generate upload URL and key
        const key = this.generateFileKey(file, metadata);
        const uploadUrl = await this.generatePresignedUrl(key, file);

        // 5. Simulate upload process (in real implementation, this would be actual S3 upload)
        const s3ObjectUrl = `https://your-bucket.s3.amazonaws.com/${key}`;

        // 6. Call onUploadComplete hook
        if (routeConfig.onUploadComplete) {
          await routeConfig.onUploadComplete({
            file,
            metadata,
            url: s3ObjectUrl,
            key,
          });
        }

        results.push({
          success: true,
          file,
          url: s3ObjectUrl,
          key,
          metadata,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Upload failed");

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

  private generateFileKey(file: File, metadata: any): string {
    const timestamp = Date.now();
    const userId = metadata.userId || "anonymous";
    const randomId = Math.random().toString(36).substring(2, 15);
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    return `uploads/${userId}/${timestamp}-${randomId}-${sanitizedName}`;
  }

  private async generatePresignedUrl(key: string, file: File): Promise<string> {
    // For now, return a mock URL - in real implementation this would use AWS SDK
    // to generate actual presigned URLs with proper configuration
    const bucket = process.env.S3_BUCKET || "your-bucket";
    const region = process.env.S3_REGION || "us-east-1";
    const baseUrl = `https://${bucket}.s3.${region}.amazonaws.com`;

    if (process.env.NODE_ENV === "development") {
      console.log(`🔗 Generated presigned URL for ${key}: ${baseUrl}/${key}`);
    }

    return `${baseUrl}/${key}?presigned=true&expires=${Date.now() + 3600000}`;
  }
}

interface S3UploadResult {
  success: boolean;
  file: File;
  url?: string;
  key?: string;
  metadata?: any;
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
  router: S3Router<TRoutes>,
  config?: any
) {
  async function POST(req: NextRequest): Promise<NextResponse> {
    try {
      const url = new URL(req.url);
      const routeName = url.searchParams.get("route");

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
      const { files } = body;

      if (!files || !Array.isArray(files)) {
        return NextResponse.json(
          { error: "Files array is required" },
          { status: 400 }
        );
      }

      // Convert file metadata to File objects for processing
      const fileObjects = files.map(
        (fileInfo: any) => new File([], fileInfo.name, { type: fileInfo.type }) // Mock File objects
      );

      const results = await router.processUpload(routeName, req, fileObjects);

      return NextResponse.json({
        success: true,
        results,
      });
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
