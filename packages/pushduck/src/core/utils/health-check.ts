/**
 * Health check utilities for pushduck
 *
 * Validates configuration, connectivity, and system health
 */

import type { UploadConfig } from "../config/upload-config";
import { logger } from "./logger";
import { metrics } from "./metrics";

export interface HealthCheckResult {
  status: "healthy" | "warning" | "error";
  checks: HealthCheck[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failures: number;
  };
  timestamp: Date;
}

export interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: any;
  duration?: number;
}

export class HealthChecker {
  private checks: HealthCheck[] = [];

  /**
   * Run all health checks
   */
  async runHealthChecks(config?: UploadConfig): Promise<HealthCheckResult> {
    this.checks = [];
    const startTime = Date.now();

    logger.info("Starting health checks");

    // Configuration checks
    await this.checkConfiguration(config);

    // Environment checks
    await this.checkEnvironment();

    // Connectivity checks
    if (config) {
      await this.checkConnectivity(config);
    }

    // Performance checks
    await this.checkPerformance();

    const summary = this.calculateSummary();
    const overallStatus = this.determineOverallStatus(summary);

    const duration = Date.now() - startTime;
    logger.info(`Health checks completed in ${duration}ms`, {
      status: overallStatus,
      summary,
    });

    return {
      status: overallStatus,
      checks: [...this.checks],
      summary,
      timestamp: new Date(),
    };
  }

  /**
   * Check configuration validity
   */
  private async checkConfiguration(config?: UploadConfig): Promise<void> {
    const startTime = performance.now();

    try {
      if (!config) {
        this.addCheck(
          "Configuration",
          "warn",
          "No configuration provided for validation"
        );
        return;
      }

      // Basic required fields
      const requiredFields = [
        "provider",
        "accessKeyId",
        "secretAccessKey",
        "bucket",
      ];
      const missingFields = requiredFields.filter(
        (field) => !config[field as keyof UploadConfig]
      );

      if (missingFields.length > 0) {
        this.addCheck(
          "Configuration",
          "fail",
          `Missing required fields: ${missingFields.join(", ")}`,
          { missingFields }
        );
        return;
      }

      // Provider-specific validation
      const providerValidation = this.validateProviderConfig(config);
      if (!providerValidation.valid) {
        this.addCheck(
          "Configuration",
          "fail",
          `Provider configuration invalid: ${providerValidation.errors.join(", ")}`,
          { errors: providerValidation.errors }
        );
        return;
      }

      this.addCheck("Configuration", "pass", "Configuration is valid");
    } catch (error) {
      this.addCheck(
        "Configuration",
        "fail",
        error instanceof Error ? error.message : "Configuration check failed"
      );
    } finally {
      this.updateCheckDuration("Configuration", performance.now() - startTime);
    }
  }

  /**
   * Check environment and dependencies
   */
  private async checkEnvironment(): Promise<void> {
    const startTime = performance.now();

    try {
      // Node.js version check
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0]);

      if (majorVersion < 16) {
        this.addCheck(
          "Node.js Version",
          "fail",
          `Node.js ${nodeVersion} is not supported. Minimum version: 16.0.0`
        );
      } else if (majorVersion < 18) {
        this.addCheck(
          "Node.js Version",
          "warn",
          `Node.js ${nodeVersion} is supported but consider upgrading to v18+ for better performance`
        );
      } else {
        this.addCheck(
          "Node.js Version",
          "pass",
          `Node.js ${nodeVersion} is supported`
        );
      }

      // Memory check
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);

      if (heapUsedMB > 512) {
        this.addCheck(
          "Memory Usage",
          "warn",
          `High memory usage: ${heapUsedMB}MB used of ${heapTotalMB}MB total`,
          { memoryUsage }
        );
      } else {
        this.addCheck(
          "Memory Usage",
          "pass",
          `Memory usage is normal: ${heapUsedMB}MB used of ${heapTotalMB}MB total`
        );
      }

      // Performance API check
      if (typeof performance === "undefined") {
        this.addCheck(
          "Performance API",
          "warn",
          "Performance API not available - metrics collection may be limited"
        );
      } else {
        this.addCheck(
          "Performance API",
          "pass",
          "Performance API is available"
        );
      }
    } catch (error) {
      this.addCheck(
        "Environment",
        "fail",
        error instanceof Error ? error.message : "Environment check failed"
      );
    } finally {
      this.updateCheckDuration("Environment", performance.now() - startTime);
    }
  }

  /**
   * Check S3 connectivity
   */
  private async checkConnectivity(config: UploadConfig): Promise<void> {
    const startTime = performance.now();

    try {
      // Import the validation function dynamically to avoid circular dependencies
      const { validateS3Connection } = await import("../storage/client");

      const result = await validateS3Connection(config);

      if (result.success) {
        this.addCheck(
          "S3 Connectivity",
          "pass",
          "Successfully connected to S3"
        );
      } else {
        this.addCheck(
          "S3 Connectivity",
          "fail",
          `Failed to connect to S3: ${result.error}`,
          { error: result.error }
        );
      }
    } catch (error) {
      this.addCheck(
        "S3 Connectivity",
        "fail",
        error instanceof Error ? error.message : "Connectivity check failed"
      );
    } finally {
      this.updateCheckDuration(
        "S3 Connectivity",
        performance.now() - startTime
      );
    }
  }

  /**
   * Check performance metrics
   */
  private async checkPerformance(): Promise<void> {
    const startTime = performance.now();

    try {
      if (!metrics.isMetricsEnabled()) {
        this.addCheck(
          "Performance Metrics",
          "warn",
          "Metrics collection is disabled"
        );
        return;
      }

      const aggregatedMetrics = metrics.getAggregatedMetrics();

      if (aggregatedMetrics.totalOperations === 0) {
        this.addCheck(
          "Performance Metrics",
          "pass",
          "No operations recorded yet"
        );
        return;
      }

      // Check success rate
      if (aggregatedMetrics.successRate < 90) {
        this.addCheck(
          "Success Rate",
          "warn",
          `Success rate is ${aggregatedMetrics.successRate.toFixed(1)}% (below 90%)`,
          { metrics: aggregatedMetrics }
        );
      } else {
        this.addCheck(
          "Success Rate",
          "pass",
          `Success rate is ${aggregatedMetrics.successRate.toFixed(1)}%`
        );
      }

      // Check average duration
      if (aggregatedMetrics.averageDuration > 5000) {
        this.addCheck(
          "Performance",
          "warn",
          `Average operation duration is ${aggregatedMetrics.averageDuration.toFixed(1)}ms (above 5s)`,
          { metrics: aggregatedMetrics }
        );
      } else {
        this.addCheck(
          "Performance",
          "pass",
          `Average operation duration is ${aggregatedMetrics.averageDuration.toFixed(1)}ms`
        );
      }
    } catch (error) {
      this.addCheck(
        "Performance Metrics",
        "fail",
        error instanceof Error ? error.message : "Performance check failed"
      );
    } finally {
      this.updateCheckDuration(
        "Performance Metrics",
        performance.now() - startTime
      );
    }
  }

  /**
   * Validate provider-specific configuration
   */
  private validateProviderConfig(config: UploadConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    switch (config.provider.provider) {
      case "aws":
        if (!config.provider.region) {
          errors.push("AWS region is required");
        }
        break;

      case "cloudflare-r2":
        if (!config.provider.endpoint) {
          errors.push("Cloudflare R2 endpoint is required");
        }
        break;

      case "digitalocean-spaces":
        if (!config.provider.endpoint) {
          errors.push("DigitalOcean Spaces endpoint is required");
        }
        break;

      case "minio":
        if (!config.provider.endpoint) {
          errors.push("MinIO endpoint is required");
        }
        break;

      case "s3-compatible":
        if (!config.provider.endpoint) {
          errors.push("S3-compatible endpoint is required");
        }
        break;

      default:
        errors.push(`Unsupported provider: ${config.provider.provider}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private addCheck(
    name: string,
    status: "pass" | "warn" | "fail",
    message: string,
    details?: any
  ): void {
    this.checks.push({
      name,
      status,
      message,
      details,
    });
  }

  private updateCheckDuration(name: string, duration: number): void {
    const check = this.checks.find((c) => c.name === name);
    if (check) {
      check.duration = duration;
    }
  }

  private calculateSummary() {
    const total = this.checks.length;
    const passed = this.checks.filter((c) => c.status === "pass").length;
    const warnings = this.checks.filter((c) => c.status === "warn").length;
    const failures = this.checks.filter((c) => c.status === "fail").length;

    return { total, passed, warnings, failures };
  }

  private determineOverallStatus(summary: {
    failures: number;
    warnings: number;
  }): "healthy" | "warning" | "error" {
    if (summary.failures > 0) return "error";
    if (summary.warnings > 0) return "warning";
    return "healthy";
  }

  /**
   * Get a formatted health report
   */
  getHealthReport(result: HealthCheckResult): string {
    const statusEmoji = {
      healthy: "✅",
      warning: "⚠️",
      error: "❌",
    };

    const checkEmoji = {
      pass: "✅",
      warn: "⚠️",
      fail: "❌",
    };

    return `
${statusEmoji[result.status]} Pushduck Health Check Report
==========================================
Status: ${result.status.toUpperCase()}
Timestamp: ${result.timestamp.toISOString()}

Summary:
- Total Checks: ${result.summary.total}
- Passed: ${result.summary.passed}
- Warnings: ${result.summary.warnings}
- Failures: ${result.summary.failures}

Detailed Results:
${result.checks
  .map((check) => {
    const duration = check.duration ? ` (${check.duration.toFixed(1)}ms)` : "";
    return `${checkEmoji[check.status]} ${check.name}: ${check.message}${duration}`;
  })
  .join("\n")}
    `.trim();
  }
}

// Export singleton instance
export const healthChecker = new HealthChecker();

// Convenience function
export const runHealthCheck = (config?: UploadConfig) =>
  healthChecker.runHealthChecks(config);

export const getHealthReport = (result: HealthCheckResult) =>
  healthChecker.getHealthReport(result);
