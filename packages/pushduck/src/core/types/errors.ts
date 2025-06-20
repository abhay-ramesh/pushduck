/**
 * Comprehensive error types for pushduck
 *
 * Provides structured error handling with specific error codes and context
 */

export type PushduckErrorCode =
  | "CONFIG_INVALID"
  | "CONFIG_MISSING"
  | "PROVIDER_UNSUPPORTED"
  | "PROVIDER_CONFIG_INVALID"
  | "S3_CONNECTION_FAILED"
  | "S3_BUCKET_NOT_FOUND"
  | "S3_ACCESS_DENIED"
  | "S3_INVALID_CREDENTIALS"
  | "FILE_NOT_FOUND"
  | "FILE_TOO_LARGE"
  | "FILE_TYPE_NOT_ALLOWED"
  | "FILE_VALIDATION_FAILED"
  | "UPLOAD_FAILED"
  | "DOWNLOAD_FAILED"
  | "PRESIGNED_URL_FAILED"
  | "NETWORK_ERROR"
  | "TIMEOUT_ERROR"
  | "UNKNOWN_ERROR";

export interface PushduckErrorContext {
  operation?: string;
  provider?: string;
  bucket?: string;
  key?: string;
  statusCode?: number;
  originalError?: Error;
  [key: string]: any;
}

export class PushduckError extends Error {
  public readonly code: PushduckErrorCode;
  public readonly context: PushduckErrorContext;
  public readonly timestamp: Date;

  constructor(
    code: PushduckErrorCode,
    message: string,
    context: PushduckErrorContext = {}
  ) {
    super(message);
    this.name = "PushduckError";
    this.code = code;
    this.context = context;
    this.timestamp = new Date();

    // Maintain proper stack trace (Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PushduckError);
    }
  }

  /**
   * Create a user-friendly error message
   */
  getUserMessage(): string {
    switch (this.code) {
      case "CONFIG_MISSING":
        return "Upload configuration is missing. Please set up your S3 provider configuration.";
      case "CONFIG_INVALID":
        return "Upload configuration is invalid. Please check your provider settings.";
      case "PROVIDER_UNSUPPORTED":
        return `Provider "${this.context.provider}" is not supported yet.`;
      case "S3_CONNECTION_FAILED":
        return "Failed to connect to S3. Please check your credentials and network connection.";
      case "S3_BUCKET_NOT_FOUND":
        return `Bucket "${this.context.bucket}" not found. Please check the bucket name and permissions.`;
      case "S3_ACCESS_DENIED":
        return "Access denied. Please check your S3 credentials and bucket permissions.";
      case "FILE_NOT_FOUND":
        return `File "${this.context.key}" not found.`;
      case "FILE_TOO_LARGE":
        return "File is too large. Please choose a smaller file.";
      case "FILE_TYPE_NOT_ALLOWED":
        return "File type is not allowed. Please choose a different file type.";
      case "UPLOAD_FAILED":
        return "Upload failed. Please try again.";
      case "DOWNLOAD_FAILED":
        return "Download failed. Please try again.";
      case "NETWORK_ERROR":
        return "Network error. Please check your internet connection.";
      case "TIMEOUT_ERROR":
        return "Operation timed out. Please try again.";
      default:
        return this.message || "An unexpected error occurred.";
    }
  }

  /**
   * Get debugging information
   */
  getDebugInfo(): Record<string, any> {
    return {
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * Convert to JSON for logging/serialization
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

// Factory functions for common errors
export const createConfigError = (
  message: string,
  context?: PushduckErrorContext
) => new PushduckError("CONFIG_INVALID", message, context);

export const createS3Error = (
  message: string,
  context?: PushduckErrorContext
) => new PushduckError("S3_CONNECTION_FAILED", message, context);

export const createFileError = (
  code: PushduckErrorCode,
  message: string,
  context?: PushduckErrorContext
) => new PushduckError(code, message, context);

export const createNetworkError = (
  message: string,
  context?: PushduckErrorContext
) => new PushduckError("NETWORK_ERROR", message, context);

// Type guards
export const isPushduckError = (error: unknown): error is PushduckError =>
  error instanceof PushduckError;

export const isConfigError = (error: unknown): error is PushduckError =>
  isPushduckError(error) &&
  (error.code === "CONFIG_INVALID" || error.code === "CONFIG_MISSING");

export const isS3Error = (error: unknown): error is PushduckError =>
  isPushduckError(error) && error.code.startsWith("S3_");

export const isFileError = (error: unknown): error is PushduckError =>
  isPushduckError(error) && error.code.startsWith("FILE_");

// Result types for better error handling
export type PushduckResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: PushduckError;
    };

export const createSuccessResult = <T>(data: T): PushduckResult<T> => ({
  success: true,
  data,
});

export const createErrorResult = <T>(
  error: PushduckError
): PushduckResult<T> => ({
  success: false,
  error,
});

// Async result wrapper
export const wrapAsync = async <T>(
  operation: () => Promise<T>,
  errorCode: PushduckErrorCode,
  context?: PushduckErrorContext
): Promise<PushduckResult<T>> => {
  try {
    const data = await operation();
    return createSuccessResult(data);
  } catch (error) {
    const pushduckError =
      error instanceof PushduckError
        ? error
        : new PushduckError(
            errorCode,
            error instanceof Error ? error.message : "Unknown error",
            {
              ...context,
              originalError: error instanceof Error ? error : undefined,
            }
          );
    return createErrorResult(pushduckError);
  }
};
