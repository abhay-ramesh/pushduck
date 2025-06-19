#!/usr/bin/env tsx

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.resolve(__dirname, "..");
const registryDir = path.join(packagesDir, "registry");
const outputDir = path.join(packagesDir, "public", "r");

interface RegistryItem {
  name: string;
  type: string;
  title: string;
  description: string;
  files: Array<{
    path: string;
    type: string;
    target?: string;
  }>;
  dependencies?: string[];
  registryDependencies?: string[];
}

interface Registry {
  $schema: string;
  name: string;
  homepage: string;
  items: RegistryItem[];
}

async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    console.warn(`Warning: Could not read file ${filePath}`);
    return "";
  }
}

async function buildRegistryItem(item: RegistryItem): Promise<any> {
  const files = [];

  for (const file of item.files) {
    const fullPath = path.join(packagesDir, file.path);
    const content = await readFile(fullPath);

    files.push({
      path: path.basename(file.path),
      content,
      type: file.type,
      target: file.target,
    });
  }

  return {
    name: item.name,
    type: item.type,
    title: item.title,
    description: item.description,
    files,
    dependencies: item.dependencies || [],
    registryDependencies: item.registryDependencies || [],
  };
}

async function buildRegistry() {
  console.log("🚀 Building pushduck UI registry...");

  try {
    // Read registry.json
    const registryJsonPath = path.join(packagesDir, "registry.json");
    const registryContent = await fs.readFile(registryJsonPath, "utf-8");
    const registry: Registry = JSON.parse(registryContent);

    // Ensure output directory exists
    await ensureDir(outputDir);

    // Build each registry item
    for (const item of registry.items) {
      console.log(`  📦 Building ${item.name}...`);

      const builtItem = await buildRegistryItem(item);
      const outputPath = path.join(outputDir, `${item.name}.json`);

      await fs.writeFile(
        outputPath,
        JSON.stringify(builtItem, null, 2),
        "utf-8"
      );

      console.log(`    ✅ Built ${item.name}.json`);
    }

    // Build index file with all items
    const indexPath = path.join(outputDir, "index.json");
    await fs.writeFile(indexPath, JSON.stringify(registry, null, 2), "utf-8");

    console.log("✨ Registry build complete!");
    console.log(`📁 Output directory: ${outputDir}`);
    console.log(`🔗 Registry items: ${registry.items.length}`);
  } catch (error) {
    console.error("❌ Registry build failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildRegistry();
}

export { buildRegistry };
