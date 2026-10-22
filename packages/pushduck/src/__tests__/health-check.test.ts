/**
 * @fileoverview The health check's configuration verdict.
 *
 * `runHealthCheck` is public API that operators wire into readiness probes, so
 * its "Configuration" check has to agree with what actually happens at upload
 * time: pass every config the provider accepts, and fail with the provider's
 * own error for every config it rejects.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import type { UploadConfig } from "../core/config/upload-config";
import {
  HealthChecker,
  type HealthCheckResult,
} from "../core/utils/health-check";

function configurationCheck(result: HealthCheckResult) {
  const check = result.checks.find((c) => c.name === "Configuration");
  if (!check) throw new Error("no Configuration check was reported");
  return check;
}

beforeEach(() => {
  // The connectivity check talks to the provider; nothing here is about that.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("health check configuration verdict", () => {
  it("passes a valid provider config", async () => {
    const { config } = createUploadConfig()
      .provider("aws", {
        bucket: "uploads",
        region: "us-east-1",
        accessKeyId: "AKIAEXAMPLE",
        secretAccessKey: "secret",
      })
      .build();

    const result = await new HealthChecker().runHealthChecks(config);

    expect(configurationCheck(result)).toMatchObject({ status: "pass" });
  });

  it("fails with the provider's own error when a credential is missing", async () => {
    // Built by hand: createProvider would refuse this config outright.
    const config = {
      provider: {
        provider: "minio",
        endpoint: "localhost:9000",
        bucket: "uploads",
        accessKeyId: "minio",
        secretAccessKey: "",
      },
    } as unknown as UploadConfig;

    const result = await new HealthChecker().runHealthChecks(config);

    expect(configurationCheck(result)).toMatchObject({ status: "fail" });
    expect(configurationCheck(result).message).toContain(
      "MinIO Secret Access Key is required"
    );
  });
});
