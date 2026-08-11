/**
 * @fileoverview pushduck upload core — framework-agnostic.
 *
 * Nothing in this subtree imports React, Vue, Svelte, or any server-side module.
 * It is the shared foundation every framework binding subscribes to, and it is
 * usable directly with no framework at all.
 *
 * @example Vanilla JavaScript / Web Components
 * ```typescript
 * import { createUploadEngine } from "pushduck/core";
 *
 * const engine = createUploadEngine({
 *   endpoint: "/api/upload",
 *   route: "imageUpload",
 * });
 *
 * const unsubscribe = engine.subscribe(() => {
 *   const { progress, files } = engine.getSnapshot();
 *   document.querySelector("progress").value = progress;
 * });
 *
 * await engine.upload([...fileInput.files]);
 * ```
 */

export { createUploadEngine } from "./engine";
export { createClientProxy } from "./client-proxy";
export type { UploadClientProxyConfig } from "./client-proxy";
export {
  settleUpload,
  uploadFile,
  uploadFiles,
  UploadBatchError,
} from "./upload-files";
export type {
  UploadFileOptions,
  UploadFilesOptions,
  UploadFilesResult,
} from "./upload-files";
export type {
  UploadClientConfig,
  UploadEngine,
  UploadEngineOptions,
  UploadEngineState,
} from "./engine";

export { formatETA, formatUploadSpeed } from "./format";

export { getInputMeta, isFile, isMimeType, toBlob } from "./input";
export type { NormalizedInputMeta } from "./input";

export { computeAggregateProgress, computeFileTelemetry } from "./progress";
export type { AggregateProgress } from "./progress";

export {
  createFetchTransport,
  fetchTransport,
  UploadAbortedError,
  xhrTransport,
} from "./transport";
export type { UploadTransport, UploadTransportRequest } from "./transport";
