/**
 * @fileoverview What `pushduck init` writes into lib/upload-config.
 *
 * The generated config is the first code a new user runs, so it has to work
 * against the bucket `init` itself creates. It used to set
 * `acl: "public-read"` for every provider. New AWS buckets have ACLs disabled
 * (Object Ownership "Bucket owner enforced", the default since April 2023), and
 * reject any upload that sends an ACL other than bucket-owner-full-control:
 * "AccessControlListNotSupported: The bucket does not allow ACLs". Block Public
 * Access, also on by default, refuses public ACLs as well.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectInfo } from "./project-detector";
import type { ProviderType } from "./provider-setup";
import { generateFiles } from "./simple-file-generator";

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "pushduck-cli-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

async function generatedConfig(provider: ProviderType): Promise<string> {
  const projectInfo: ProjectInfo = {
    framework: "nextjs",
    version: "15.0.0",
    router: "app",
    typescript: true,
    cssFramework: "none",
    packageManager: "pnpm",
    hasExistingUpload: false,
    rootDir,
    useSrcDir: false,
    pathMappings: [],
  };

  await generateFiles({
    projectInfo,
    provider,
    credentials: {
      accessKeyId: "key",
      secretAccessKey: "secret",
      region: "us-east-1",
      bucket: "b",
    },
    apiPath: "/api/upload",
    generateExamples: false,
  });

  return readFile(path.join(rootDir, "lib/upload-config.ts"), "utf8");
}

describe("generated upload config", () => {
  it.each<ProviderType>(["aws", "cloudflare-r2", "digitalocean", "minio", "neon", "gcs"])(
    "%s: sets no ACL, so uploads work on buckets with ACLs disabled",
    async (provider) => {
      const content = await generatedConfig(provider);

      expect(content).toContain('.provider("');
      expect(content).not.toMatch(/\bacl\s*:/);
    }
  );
});
