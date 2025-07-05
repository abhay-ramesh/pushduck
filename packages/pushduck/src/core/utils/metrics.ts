/**
 * Performance monitoring and metrics for pushduck
 *
 * Tracks operation performance, file sizes, and success rates
 */

export interface OperationMetrics {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  fileSize?: number;
  provider?: string;
  errorCode?: string;
  metadata?: Record<string, any>;
}

export interface AggregatedMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  successRate: number;
  averageDuration: number;
  totalDataTransferred: number;
  operationsByType: Record<string, number>;
  errorsByCode: Record<string, number>;
  providerUsage: Record<string, number>;
}

class MetricsCollector {
  private metrics: OperationMetrics[] = [];
  private maxMetricsHistory = 1000;
  private isEnabled: boolean;

  constructor(options: { enabled?: boolean } = {}) {
    this.isEnabled = options.enabled ?? false;
  }

  /**
   * Start tracking an operation
   */
  startOperation(operation: string, metadata?: Record<string, any>): string {
    if (!this.isEnabled) return "";

    const operationId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const metric: OperationMetrics = {
      operation,
      startTime: performance.now(),
      success: false,
      metadata: { operationId, ...metadata },
    };

    this.metrics.push(metric);
    this.trimMetricsHistory();

    return operationId;
  }

  /**
   * End tracking an operation
   */
  endOperation(
    operationId: string,
    success: boolean,
    options?: {
      fileSize?: number;
      provider?: string;
      errorCode?: string;
      metadata?: Record<string, any>;
    }
  ): void {
    if (!this.isEnabled || !operationId) return;

    const metric = this.metrics.find(
      (m) => m.metadata?.operationId === operationId
    );
    if (!metric) return;

    const endTime = performance.now();
    metric.endTime = endTime;
    metric.duration = endTime - metric.startTime;
    metric.success = success;
    metric.fileSize = options?.fileSize;
    metric.provider = options?.provider;
    metric.errorCode = options?.errorCode;

    if (options?.metadata) {
      metric.metadata = { ...metric.metadata, ...options.metadata };
    }
  }

  /**
   * Record a simple operation (start and end together)
   */
  recordOperation(
    operation: string,
    duration: number,
    success: boolean,
    options?: {
      fileSize?: number;
      provider?: string;
      errorCode?: string;
      metadata?: Record<string, any>;
    }
  ): void {
    if (!this.isEnabled) return;

    const metric: OperationMetrics = {
      operation,
      startTime: performance.now() - duration,
      endTime: performance.now(),
      duration,
      success,
      fileSize: options?.fileSize,
      provider: options?.provider,
      errorCode: options?.errorCode,
      metadata: options?.metadata,
    };

    this.metrics.push(metric);
    this.trimMetricsHistory();
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(timeWindow?: number): AggregatedMetrics {
    const cutoffTime = timeWindow ? Date.now() - timeWindow : 0;
    const relevantMetrics = this.metrics.filter(
      (m) => m.endTime && m.startTime >= cutoffTime
    );

    const totalOperations = relevantMetrics.length;
    const successfulOperations = relevantMetrics.filter(
      (m) => m.success
    ).length;
    const failedOperations = totalOperations - successfulOperations;
    const successRate =
      totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0;

    const durations = relevantMetrics
      .filter((m) => m.duration !== undefined)
      .map((m) => m.duration!);
    const averageDuration =
      durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0;

    const totalDataTransferred = relevantMetrics
      .filter((m) => m.fileSize !== undefined)
      .reduce((sum, m) => sum + (m.fileSize || 0), 0);

    const operationsByType = relevantMetrics.reduce(
      (acc, m) => {
        acc[m.operation] = (acc[m.operation] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const errorsByCode = relevantMetrics
      .filter((m) => !m.success && m.errorCode)
      .reduce(
        (acc, m) => {
          acc[m.errorCode!] = (acc[m.errorCode!] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

    const providerUsage = relevantMetrics
      .filter((m) => m.provider)
      .reduce(
        (acc, m) => {
          acc[m.provider!] = (acc[m.provider!] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      successRate,
      averageDuration,
      totalDataTransferred,
      operationsByType,
      errorsByCode,
      providerUsage,
    };
  }

  /**
   * Get raw metrics (for debugging)
   */
  getRawMetrics(): OperationMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): string {
    const metrics = this.getAggregatedMetrics();

    return `
📊 Pushduck Performance Summary
================================
Total Operations: ${metrics.totalOperations}
Success Rate: ${metrics.successRate.toFixed(1)}%
Average Duration: ${metrics.averageDuration.toFixed(1)}ms
Data Transferred: ${this.formatBytes(metrics.totalDataTransferred)}

Operations by Type:
${Object.entries(metrics.operationsByType)
  .map(([op, count]) => `  ${op}: ${count}`)
  .join("\n")}

${
  Object.keys(metrics.errorsByCode).length > 0
    ? `
Errors by Code:
${Object.entries(metrics.errorsByCode)
  .map(([code, count]) => `  ${code}: ${count}`)
  .join("\n")}
`
    : ""
}

Provider Usage:
${Object.entries(metrics.providerUsage)
  .map(([provider, count]) => `  ${provider}: ${count}`)
  .join("\n")}
    `.trim();
  }

  private trimMetricsHistory(): void {
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Enable or disable metrics collection
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Check if metrics collection is enabled
   */
  isMetricsEnabled(): boolean {
    return this.isEnabled;
  }
}

// Export singleton instance
export const metrics = new MetricsCollector();

// Convenience functions
export const startOperation = (
  operation: string,
  metadata?: Record<string, any>
) => metrics.startOperation(operation, metadata);

export const endOperation = (
  operationId: string,
  success: boolean,
  options?: Parameters<typeof metrics.endOperation>[2]
) => metrics.endOperation(operationId, success, options);

export const recordOperation = (
  operation: string,
  duration: number,
  success: boolean,
  options?: Parameters<typeof metrics.recordOperation>[3]
) => metrics.recordOperation(operation, duration, success, options);

// Decorator for automatic operation tracking
export function trackOperation(operationName: string) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!;

    descriptor.value = async function (this: any, ...args: any[]) {
      const operationId = startOperation(operationName, {
        method: propertyKey,
        args: args.length,
      });

      try {
        const result = await originalMethod.apply(this, args);
        endOperation(operationId, true);
        return result;
      } catch (error) {
        endOperation(operationId, false, {
          errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
        });
        throw error;
      }
    } as T;

    return descriptor;
  };
}

export { MetricsCollector };
