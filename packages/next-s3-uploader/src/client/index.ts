/**
 * Client-side functionality for next-s3-uploader
 *
 * This directory contains all client-side functionality including
 * the property-based upload client and related types.
 */

// Enhanced property-based client
export { createUploadClient } from "./upload-client";

// Client types
export type {
  ClientConfig,
  InferClientRouter,
  RouterRouteNames,
  TypedRouteHook,
  TypedUploadedFile,
} from "../types";
