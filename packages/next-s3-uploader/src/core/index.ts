/**
 * Core exports for the new gold standard API
 */

// Core functionality
export * from "./config";
export * from "./hooks";
export * from "./schema";

// Router system exports (Phase 1.2: File Router Architecture)
export {
  formatETA,
  formatUploadSpeed,
  useS3RouteUpload,
  useS3UploadRoute,
} from "./route-hooks-v2";
export { createS3Handler, createS3Router } from "./router-v2";

// S3 Client functionality
export * from "./s3-client";

// Import schema builders and router factory
import { createS3Router, S3Route, S3RouterDefinition } from "./router-v2";
import {
  S3FileConstraints,
  S3FileSchema,
  S3ImageSchema,
  S3ObjectSchema,
} from "./schema";

// ========================================
// Smart Schema Builders
// ========================================

class SmartS3FileSchema extends S3FileSchema {
  // Override methods to return SmartS3FileSchema instances
  override max(size: string | number): SmartS3FileSchema {
    return new SmartS3FileSchema({ ...this.constraints, maxSize: size });
  }

  override min(size: string | number): SmartS3FileSchema {
    return new SmartS3FileSchema({ ...this.constraints, minSize: size });
  }

  override types(allowedTypes: string[]): SmartS3FileSchema {
    return new SmartS3FileSchema({ ...this.constraints, allowedTypes });
  }

  override extensions(allowedExtensions: string[]): SmartS3FileSchema {
    return new SmartS3FileSchema({ ...this.constraints, allowedExtensions });
  }

  // Auto-convert to route when middleware/lifecycle methods are called
  override middleware<TMetadata>(
    middleware: (ctx: {
      req: any;
      file: { name: string; size: number; type: string };
      metadata: any;
    }) => Promise<TMetadata> | TMetadata
  ) {
    return new S3Route(this).middleware(middleware);
  }

  override onUploadStart(
    hook: (ctx: {
      file: { name: string; size: number; type: string };
      metadata: any;
    }) => Promise<void> | void
  ) {
    return new S3Route(this).onUploadStart(hook);
  }

  override onUploadComplete(
    hook: (ctx: {
      file: { name: string; size: number; type: string };
      metadata: any;
      url?: string;
      key?: string;
    }) => Promise<void> | void
  ) {
    return new S3Route(this).onUploadComplete(hook);
  }

  override onUploadError(
    hook: (ctx: {
      file: { name: string; size: number; type: string };
      metadata: any;
      error: Error;
    }) => Promise<void> | void
  ) {
    return new S3Route(this).onUploadError(hook);
  }
}

class SmartS3ImageSchema extends S3ImageSchema {
  // Override methods to return SmartS3ImageSchema instances
  override max(size: string | number): SmartS3ImageSchema {
    return new SmartS3ImageSchema({ ...this.constraints, maxSize: size });
  }

  override min(size: string | number): SmartS3ImageSchema {
    return new SmartS3ImageSchema({ ...this.constraints, minSize: size });
  }

  override types(allowedTypes: string[]): SmartS3ImageSchema {
    return new SmartS3ImageSchema({ ...this.constraints, allowedTypes });
  }

  override extensions(allowedExtensions: string[]): SmartS3ImageSchema {
    return new SmartS3ImageSchema({ ...this.constraints, allowedExtensions });
  }

  override formats(formats: string[]): SmartS3ImageSchema {
    const mimeTypes = formats.map((format) => {
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        avif: "image/avif",
        svg: "image/svg+xml",
      };
      return mimeMap[format.toLowerCase()] || `image/${format}`;
    });

    return new SmartS3ImageSchema({
      ...this.constraints,
      allowedTypes: mimeTypes,
    });
  }

  // Auto-convert to route when middleware/lifecycle methods are called
  override middleware<TMetadata>(
    middleware: (ctx: {
      req: any;
      file: { name: string; size: number; type: string };
      metadata: any;
    }) => Promise<TMetadata> | TMetadata
  ) {
    return new S3Route(this).middleware(middleware);
  }

  override onUploadStart(
    hook: (ctx: {
      file: { name: string; size: number; type: string };
      metadata: any;
    }) => Promise<void> | void
  ) {
    return new S3Route(this).onUploadStart(hook);
  }

  override onUploadComplete(
    hook: (ctx: {
      file: { name: string; size: number; type: string };
      metadata: any;
      url?: string;
      key?: string;
    }) => Promise<void> | void
  ) {
    return new S3Route(this).onUploadComplete(hook);
  }

  override onUploadError(
    hook: (ctx: {
      file: { name: string; size: number; type: string };
      metadata: any;
      error: Error;
    }) => Promise<void> | void
  ) {
    return new S3Route(this).onUploadError(hook);
  }
}

// ========================================
// Smart Router Factory
// ========================================

function smartCreateRouter<TRoutes extends Record<string, any>>(
  routes: TRoutes
) {
  // Convert any schema objects to route objects
  const convertedRoutes: Record<string, S3Route<any, any>> = {};

  for (const [key, value] of Object.entries(routes)) {
    if (
      value instanceof S3FileSchema ||
      value instanceof S3ImageSchema ||
      value instanceof S3ObjectSchema
    ) {
      // Convert schema to route
      convertedRoutes[key] = new S3Route(value);
    } else {
      // Already a route
      convertedRoutes[key] = value;
    }
  }

  return createS3Router(convertedRoutes as S3RouterDefinition);
}

// ========================================
// Main S3 Builder Instance
// ========================================

export const s3 = {
  // Schema builders that auto-convert to routes when needed
  file: (constraints?: S3FileConstraints) => new SmartS3FileSchema(constraints),
  image: (constraints?: S3FileConstraints) =>
    new SmartS3ImageSchema(constraints),
  object: <T extends Record<string, any>>(shape: T) =>
    new S3ObjectSchema(shape),

  // Smart router factory that handles schema-to-route conversion
  createRouter: smartCreateRouter,
} as const;
