/**
 * @fileoverview pushduck - React Native client
 *
 * Drop-in for `pushduck/client` in React Native and Expo apps.
 * The API is identical — `useUploadRoute` and `createUploadClient` work
 * exactly the same way. The only difference is that `uploadFiles` here
 * accepts `UploadInput[]` instead of `File[]`, so you can pass asset
 * objects from image and document pickers directly without any mapping.
 *
 * Supported picker shapes (pass result.assets directly, no mapping):
 * - expo-image-picker   → `{ uri, fileName?, mimeType?, fileSize? }`
 * - expo-document-picker → `{ uri, name, mimeType?, size? }`
 * - react-native-image-picker → `{ uri?, fileName?, type?, fileSize? }`
 *   (filter for `uri` first since rn-image-picker types it as optional)
 *
 * @example expo-image-picker — pass result.assets directly
 * ```typescript
 * import { useUploadRoute } from 'pushduck/react-native';
 * import * as ImagePicker from 'expo-image-picker';
 *
 * const { uploadFiles, isUploading, progress } = useUploadRoute('avatarUpload');
 *
 * const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
 * if (!result.canceled) await uploadFiles(result.assets);
 * ```
 *
 * @example expo-document-picker — pass result.assets directly
 * ```typescript
 * import { useUploadRoute } from 'pushduck/react-native';
 * import * as DocumentPicker from 'expo-document-picker';
 *
 * const { uploadFiles } = useUploadRoute('documentUpload');
 *
 * const result = await DocumentPicker.getDocumentAsync({ type: '*\/*' });
 * if (result.assets) await uploadFiles(result.assets);
 * ```
 *
 * @example react-native-image-picker — filter for uri first
 * ```typescript
 * import { useUploadRoute } from 'pushduck/react-native';
 * import { launchImageLibrary } from 'react-native-image-picker';
 *
 * const { uploadFiles } = useUploadRoute('photoUpload');
 *
 * const result = await launchImageLibrary({ mediaType: 'photo' });
 * const assets = result.assets?.filter((a): a is typeof a & { uri: string } => !!a.uri);
 * if (assets?.length) await uploadFiles(assets);
 * ```
 *
 * @example createUploadClient (type-safe property-based access)
 * ```typescript
 * import { createUploadClient } from 'pushduck/react-native';
 * import type { AppRouter } from '@/lib/upload';
 *
 * const upload = createUploadClient<AppRouter>({ endpoint: 'https://api.example.com/upload' });
 *
 * function UploadScreen() {
 *   const { uploadFiles, progress, isUploading } = upload.avatarUpload();
 *
 *   const handlePick = async () => {
 *     const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
 *     if (!result.canceled) await uploadFiles(result.assets);
 *   };
 * }
 * ```
 */

import {
  useUploadRoute as _useUploadRoute,
  createUploadClient as _createUploadClient,
  formatETA,
  formatUploadSpeed,
} from "./client";

import type {
  ClientConfig,
  RouterRouteNames,
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3Router,
  S3UploadedFile,
  TypedRouteHook,
  TypedUploadedFile,
  UploadInput,
  UploadRouteConfig,
} from "./types";

// ─── RN-specific result types ─────────────────────────────────────────────────

/**
 * Return type of `useUploadRoute` from `pushduck/react-native`.
 * Identical to `S3RouteUploadResult` except `uploadFiles` accepts `UploadInput[]`
 * instead of `File[]`.
 */
export interface RNRouteUploadResult extends Omit<S3RouteUploadResult, "uploadFiles"> {
  uploadFiles: (files: UploadInput[], metadata?: any) => Promise<void>;
}

/**
 * Return type of property-hook calls on the client from `pushduck/react-native`.
 * Identical to `TypedRouteHook` except `uploadFiles` accepts `UploadInput[]`.
 */
export interface RNTypedRouteHook<
  TRouter = any,
  TRouteName extends string = string,
> extends Omit<TypedRouteHook<TRouter, TRouteName>, "uploadFiles"> {
  uploadFiles: (files: UploadInput[], metadata?: any) => Promise<any[]>;
}

/** @internal */
type RNInferClientRouter<T> =
  T extends S3Router<infer TRoutes>
    ? {
        readonly [K in keyof TRoutes]: (
          options?: UploadRouteConfig
        ) => RNTypedRouteHook<T, K extends string ? K : string>;
      }
    : never;

// ─── Wrapper hooks ────────────────────────────────────────────────────────────

/**
 * React Native equivalent of `useUploadRoute` from `pushduck/client`.
 *
 * Identical API — same state shape, same progress/speed/ETA tracking,
 * same callbacks. The only difference: `uploadFiles` accepts `UploadInput[]`
 * so you can pass picker assets directly without mapping field names.
 */
export function useUploadRoute<TRouter extends S3Router<any>>(
  routeName: RouterRouteNames<TRouter>,
  config?: UploadRouteConfig
): RNRouteUploadResult;
export function useUploadRoute(
  routeName: string,
  config?: UploadRouteConfig
): RNRouteUploadResult;
export function useUploadRoute(
  routeName: string,
  config?: UploadRouteConfig
): RNRouteUploadResult {
  // The runtime implementation already accepts UploadInput[] internally.
  // This wrapper only changes the TypeScript signature visible to RN consumers.
  return _useUploadRoute(routeName, config) as unknown as RNRouteUploadResult;
}

/**
 * React Native equivalent of `createUploadClient` from `pushduck/client`.
 *
 * Returns the same property-based client — each route property is a hook
 * factory. The difference: `uploadFiles` on each hook accepts `UploadInput[]`.
 */
export function createUploadClient<TRouter extends S3Router<any>>(
  config: ClientConfig
): RNInferClientRouter<TRouter> {
  return _createUploadClient<TRouter>(config) as unknown as RNInferClientRouter<TRouter>;
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { formatETA, formatUploadSpeed };

export type {
  UploadInput,
  ClientConfig,
  RouterRouteNames,
  S3FileMetadata,
  S3RouteUploadConfig,
  S3RouteUploadResult,
  S3Router,
  S3UploadedFile,
  TypedRouteHook,
  TypedUploadedFile,
  UploadRouteConfig,
};
