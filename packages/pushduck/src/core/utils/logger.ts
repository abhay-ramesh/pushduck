/**
 * Logging utility for pushduck
 *
 * Provides structured logging with different levels and optional debug mode
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  operation?: string;
  provider?: string;
  key?: string;
  bucket?: string;
  [key: string]: any;
}

class Logger {
  private isDebugMode: boolean;

  constructor(options: { debug?: boolean } = {}) {
    this.isDebugMode = options.debug ?? false;
  }

  setDebugMode(enabled: boolean): void {
    this.isDebugMode = enabled;
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): string {
    const timestamp = new Date().toISOString();
    const prefix = this.getLogPrefix(level);
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `${timestamp} ${prefix} ${message}${contextStr}`;
  }

  private getLogPrefix(level: LogLevel): string {
    switch (level) {
      case "debug":
        return "🔧";
      case "info":
        return "📦";
      case "warn":
        return "⚠️";
      case "error":
        return "❌";
      default:
        return "📝";
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.isDebugMode) {
      console.log(this.formatMessage("debug", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    console.log(this.formatMessage("info", message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage("warn", message, context));
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    };
    console.error(this.formatMessage("error", message, errorContext));
  }

  // Operation-specific loggers
  s3Operation(operation: string, details: LogContext): void {
    this.debug(`S3 Operation: ${operation}`, details);
  }

  configInit(provider: string, details: LogContext): void {
    this.info(
      `Upload configuration initialized with provider: ${provider}`,
      details
    );
  }

  presignedUrl(key: string, details: LogContext): void {
    this.debug(`Generated presigned URL for ${key}`, details);
  }

  fileOperation(operation: string, key: string, details?: LogContext): void {
    this.debug(`File ${operation}: ${key}`, details);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for testing
export { Logger };
