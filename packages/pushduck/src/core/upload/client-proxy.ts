/**
 * @fileoverview Framework-agnostic property-based client.
 *
 * `createUploadClient<AppRouter>({ endpoint })` returns an object with one
 * property per route, so route names autocomplete from the server router:
 *
 * ```typescript
 * const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
 * const { uploadFiles, files } = upload.imageUpload();
 * ```
 *
 * The Proxy itself has nothing framework-specific in it — it only forwards a
 * route name and merged config to a factory. Sharing it means React, Vue,
 * Svelte, and Solid expose the identical `upload.routeName()` surface with one
 * implementation, rather than four Proxies that drift apart.
 */

import type { UploadClientConfig } from "./engine";

/**
 * Configuration for {@link createClientProxy}.
 *
 * Mirrors the per-route config, plus `defaultOptions` applied to every route.
 */
export interface UploadClientProxyConfig extends UploadClientConfig {
  /** Base URL of your upload route handler. */
  endpoint: string;
  /** Defaults merged into every route's options; per-route values win. */
  defaultOptions?: UploadClientConfig;
}

/**
 * Builds a property-per-route client around a binding's route factory.
 *
 * @param config - Endpoint and shared defaults
 * @param factory - The binding's route entry point — `useUploadRoute` for
 *   React and Vue, `createUploadRoute` for Svelte and Solid
 *
 * @internal
 */
export function createClientProxy<TClient>(
  config: UploadClientProxyConfig,
  factory: (route: string, options: UploadClientConfig) => unknown
): TClient {
  const { endpoint, defaultOptions, ...shared } = config;

  return new Proxy({} as object, {
    get(_target, prop) {
      if (typeof prop !== "string") {
        throw new Error(
          `Invalid route access: routes must be strings, got ${typeof prop}`
        );
      }

      return (routeOptions: UploadClientConfig = {}) =>
        factory(prop, {
          endpoint,
          ...shared,
          ...defaultOptions,
          ...routeOptions,
        });
    },

    has(_target, prop) {
      return typeof prop === "string";
    },

    ownKeys() {
      // Route names live in the type system, not at runtime — the server
      // router is never shipped to the client, so there is nothing to list.
      return [];
    },
  }) as TClient;
}
