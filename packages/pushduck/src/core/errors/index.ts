/**
 * @fileoverview Ecosystem-neutral error handling.
 *
 * Built on HTTP status codes (RFC 9110), Problem Details (RFC 9457), ES2022
 * `Error.cause`, and plain TypeScript unions — nothing that belongs to a
 * framework, and nothing with an upstream to keep up with.
 *
 * Shared by the server handler and the client engine, so one error vocabulary
 * spans the whole library and the wire between its halves.
 */

export {
  errorTypeUri,
  isRequestScoped,
  isUploadError,
  toUploadError,
  UPLOAD_ERROR_CODES,
  UploadError,
} from "./upload-error";
export type { UploadErrorCode, UploadErrorOptions } from "./upload-error";

export {
  codeForStatus,
  fromProblemDetails,
  PROBLEM_JSON_MEDIA_TYPE,
  toProblemDetails,
  toProblemResponse,
} from "./problem-details";
export type { ProblemDetails, ProblemDetailsOptions } from "./problem-details";
