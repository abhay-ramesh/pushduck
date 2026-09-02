/**
 * @fileoverview pushduck - Framework-agnostic upload core
 *
 * The upload engine with no framework attached. Import this when you are not
 * using React, or when you are writing a binding for a framework pushduck does
 * not ship one for yet.
 *
 * This entry point is guaranteed to contain **no framework code and no
 * server-side code**. It never imports React, Vue, Svelte, Solid, `aws4fetch`,
 * or anything under `core/storage`. That guarantee is enforced in CI by
 * `src/__tests__/architecture.test.ts`.
 *
 * If you are using React, import from `pushduck/client` instead — it is a thin
 * binding over exactly this engine.
 *
 * @example Vanilla JavaScript
 * ```typescript
 * import { createUploadEngine } from "pushduck/core";
 *
 * const engine = createUploadEngine({
 *   endpoint: "/api/upload",
 *   route: "imageUpload",
 * });
 *
 * engine.subscribe(() => {
 *   const { progress, files, isUploading } = engine.getSnapshot();
 *   progressBar.value = progress;
 *   button.disabled = isUploading;
 * });
 *
 * await engine.upload([...input.files], { albumId: "summer-2026" });
 * ```
 *
 * @example Writing a binding for a new framework
 * ```typescript
 * import { createUploadEngine } from "pushduck/core";
 *
 * export function useUploadRoute(route: string, options = {}) {
 *   const engine = createUploadEngine({ route, ...options });
 *
 *   // Translate subscribe/getSnapshot into your framework's reactivity:
 *   //   React  -> useSyncExternalStore(engine.subscribe, engine.getSnapshot)
 *   //   Vue    -> shallowRef + engine.subscribe, disposed in onScopeDispose
 *   //   Svelte -> engine already satisfies the store contract
 *   //   Solid  -> createStore + engine.subscribe, disposed in onCleanup
 *
 *   return engine;
 * }
 * ```
 */

export {
  computeAggregateProgress,
  computeFileTelemetry,
  createFetchTransport,
  createUploadEngine,
  fetchTransport,
  formatETA,
  formatUploadSpeed,
  getInputMeta,
  isFile,
  isMimeType,
  toBlob,
  uploadFile,
  uploadFiles,
  UploadAbortedError,
  UploadBatchError,
  xhrTransport,
} from "./core/upload";

export type {
  AggregateProgress,
  NormalizedInputMeta,
  UploadClientConfig,
  UploadEngine,
  UploadEngineOptions,
  UploadEngineState,
  UploadFileOptions,
  UploadFilesOptions,
  UploadFilesResult,
  UploadTransport,
  UploadTransportRequest,
} from "./core/upload";

export {
  isRequestScoped,
  isUploadError,
  toUploadError,
  UPLOAD_ERROR_CODES,
  UploadError,
} from "./core/errors";
export type {
  ProblemDetails,
  UploadErrorCode,
  UploadErrorOptions,
} from "./core/errors";

export type {
  S3FileMetadata,
  S3UploadedFile,
  UploadInput,
  UploadRouteConfig,
} from "./types";
