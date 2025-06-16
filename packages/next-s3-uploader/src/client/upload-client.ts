/**
 * Enhanced Upload Client with Property-Based Access
 *
 * This implements Option 1: Property-Based Access pattern:
 *
 * const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
 * const { uploadFiles } = upload.imageUpload; // Full type safety!
 */

"use client";

import { useCallback } from "react";
import { useS3UploadRoute } from "../core/route-hooks-v2";
import type { S3Router } from "../core/router-v2";
import type {
  ClientConfig,
  InferClientRouter,
  RouterRouteNames,
  TypedRouteHook,
} from "./types";

// ========================================
// Enhanced Hook Implementation
// ========================================

function useTypedRoute<TRouter extends S3Router<any>>(
  routeName: string,
  config: ClientConfig
): TypedRouteHook {
  // Use the existing hook with enhanced typing
  const hookResult = useS3UploadRoute(routeName, {
    endpoint: config.endpoint,
  });

  const enhancedUploadFiles = useCallback(
    async (files: File[], metadata?: any) => {
      // For now, we use the existing uploadFiles function
      // In the future, this will be enhanced with full type inference
      await hookResult.startUpload(files);
      return hookResult.files.map((file) => ({
        ...file,
        metadata,
      }));
    },
    [hookResult.startUpload, hookResult.files]
  );

  return {
    files: hookResult.files.map((file) => ({
      ...file,
      routeName,
      metadata: undefined, // Will be enhanced with actual metadata
    })),
    uploadFiles: enhancedUploadFiles,
    reset: hookResult.reset,
    isUploading: hookResult.isUploading,
    errors: hookResult.errors,
    routeName,
  };
}

// ========================================
// Type-Safe Client Factory
// ========================================

/**
 * Create a type-safe upload client with property-based access
 *
 * While TypeScript cannot prevent all invalid property access due to Proxy limitations,
 * this implementation provides runtime validation and descriptive error messages.
 *
 * @example
 * ```typescript
 * const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
 * const { uploadFiles } = upload.imageUpload; // ✅ Valid route
 * const invalid = upload.invalidRoute; // ❌ Runtime error with helpful message
 * ```
 */
export function createUploadClient<TRouter extends S3Router<any>>(
  config: ClientConfig
): InferClientRouter<TRouter> {
  const client = {} as InferClientRouter<TRouter>;
  const accessedRoutes = new Set<string>();

  return new Proxy(client, {
    get(target: any, routeName: string | symbol) {
      if (typeof routeName !== "string") {
        throw new Error(
          `Invalid route access: Routes must be strings, got ${typeof routeName}`
        );
      }

      // Track accessed routes for better error messages
      accessedRoutes.add(routeName);

      // Create and cache the typed route hook
      if (!(routeName in target)) {
        try {
          target[routeName] = useTypedRoute<TRouter>(routeName, config);
        } catch (error) {
          // Enhance error message with available routes hint
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Route "${routeName}" failed to initialize: ${message}\n\n` +
              `Tip: Make sure "${routeName}" is defined in your server router. ` +
              `Available routes are typically defined in your API route file.`
          );
        }
      }

      return target[routeName];
    },

    has(target, prop) {
      return typeof prop === "string";
    },

    ownKeys(target) {
      return Object.keys(target);
    },

    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && prop in target) {
        return {
          enumerable: true,
          configurable: true,
          value: target[prop],
        };
      }
      return undefined;
    },
  }) as InferClientRouter<TRouter>;
}

// ========================================
// Enhanced Client Factory with Explicit Routes
// ========================================

/**
 * Create upload client with explicit route validation (recommended for production)
 *
 * This version requires you to explicitly list the routes, providing both
 * compile-time and runtime type safety.
 *
 * @example
 * ```typescript
 * const upload = createUploadClientWithRoutes<AppRouter>(
 *   { endpoint: "/api/upload" },
 *   ["imageUpload", "documentUpload"]
 * );
 * ```
 */
export function createUploadClientWithRoutes<TRouter extends S3Router<any>>(
  config: ClientConfig,
  routes: readonly RouterRouteNames<TRouter>[]
): InferClientRouter<TRouter> {
  const client = {} as any;
  const validRoutes = new Set(routes);

  // Pre-register all valid routes
  for (const routeName of routes) {
    Object.defineProperty(client, routeName, {
      get() {
        return useTypedRoute<TRouter>(routeName as string, config);
      },
      enumerable: true,
      configurable: false,
    });
  }

  return new Proxy(client, {
    get(target, prop) {
      if (typeof prop !== "string") {
        throw new Error(
          `Invalid route access: Routes must be strings, got ${typeof prop}`
        );
      }

      if (!validRoutes.has(prop as any)) {
        throw new Error(
          `Route "${prop}" does not exist.\n\n` +
            `Available routes: ${Array.from(validRoutes).join(", ")}\n\n` +
            `Make sure the route is:\n` +
            `1. Defined in your server router\n` +
            `2. Listed in the routes array when creating the client`
        );
      }

      return target[prop];
    },

    has(target, prop) {
      return typeof prop === "string" && validRoutes.has(prop as any);
    },

    ownKeys() {
      return Array.from(validRoutes);
    },

    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && validRoutes.has(prop as any)) {
        return {
          enumerable: true,
          configurable: false,
          value: target[prop],
        };
      }
      return undefined;
    },
  }) as InferClientRouter<TRouter>;
}

// ========================================
// Utility Functions
// ========================================

/**
 * Helper to extract route names from router for documentation/debugging
 */
export function getRouterRoutes<TRouter extends S3Router<any>>(): string[] {
  // This would need runtime access to router instance for full implementation
  console.warn(
    "getRouterRoutes: Runtime route extraction not yet implemented. " +
      "Use createUploadClientWithRoutes for explicit route validation."
  );
  return [];
}
