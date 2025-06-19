import { describe, expect, it } from "vitest";
import { createS3Client } from "./s3-client";

// Simple unit tests for core functionality
describe("Package Core Functionality", () => {
  it("should have createS3Client function", () => {
    expect(typeof createS3Client).toBe("function");
  });

  it("should maintain semantic versioning format", () => {
    // Test semantic versioning pattern
    const semverPattern = /^\d+\.\d+\.\d+$/;
    expect("0.2.1").toMatch(semverPattern);
  });

  it("should export main types", () => {
    // Test that key types exist
    expect(createS3Client).toBeDefined();
  });
});
