import fs from "fs-extra";
import path from "path";

export interface PathMapping {
  alias: string; // e.g., "@/*"
  target: string; // e.g., "./src/*" or "./*"
}

async function parseTsConfig(cwd: string): Promise<{
  pathMappings: PathMapping[];
  baseUrl?: string;
}> {
  const tsconfigPath = path.join(cwd, "tsconfig.json");

  if (!(await fs.pathExists(tsconfigPath))) {
    return { pathMappings: [] };
  }

  try {
    const tsconfig = await fs.readJson(tsconfigPath);
    const compilerOptions = tsconfig.compilerOptions || {};
    const paths = compilerOptions.paths || {};
    const baseUrl = compilerOptions.baseUrl;

    const pathMappings: PathMapping[] = [];

    // Parse path mappings from tsconfig.json
    for (const [alias, targets] of Object.entries(paths)) {
      if (Array.isArray(targets) && targets.length > 0) {
        pathMappings.push({
          alias,
          target: targets[0] as string, // Use the first target
        });
      }
    }

    return { pathMappings, baseUrl };
  } catch (error) {
    // If tsconfig.json is malformed, fall back to no path mappings
    return { pathMappings: [] };
  }
}

export interface ProjectInfo {
  framework: "nextjs" | "react" | "vue" | "svelte" | "unknown";
  version: string;
  router: "app" | "pages" | "unknown";
  typescript: boolean;
  cssFramework: "tailwind" | "styled-components" | "css-modules" | "none";
  packageManager: "npm" | "yarn" | "pnpm";
  hasExistingUpload: boolean;
  rootDir: string;
  useSrcDir: boolean;
  pathMappings: PathMapping[];
  baseUrl?: string;
}

export async function detectProject(
  cwd: string = process.cwd()
): Promise<ProjectInfo> {
  const packageJsonPath = path.join(cwd, "package.json");

  if (!(await fs.pathExists(packageJsonPath))) {
    throw new Error(
      "No package.json found. Please run this command in a Next.js project root."
    );
  }

  const packageJson = await fs.readJson(packageJsonPath);

  // Detect Next.js
  const nextVersion =
    packageJson.dependencies?.next || packageJson.devDependencies?.next;

  // If not Next.js, detect other frameworks
  if (!nextVersion) {
    const reactVersion =
      packageJson.dependencies?.react || packageJson.devDependencies?.react;
    const vueVersion =
      packageJson.dependencies?.vue || packageJson.devDependencies?.vue;
    const svelteVersion =
      packageJson.dependencies?.svelte || packageJson.devDependencies?.svelte;

    let framework: "nextjs" | "react" | "vue" | "svelte" | "unknown" =
      "unknown";
    let version = "unknown";

    if (reactVersion) {
      framework = "react";
      version = reactVersion;
    } else if (vueVersion) {
      framework = "vue";
      version = vueVersion;
    } else if (svelteVersion) {
      framework = "svelte";
      version = svelteVersion;
    }

    return {
      framework,
      version,
      router: "unknown",
      typescript: false,
      cssFramework: "none",
      packageManager: "npm",
      hasExistingUpload: false,
      rootDir: cwd,
      useSrcDir: false,
      pathMappings: [],
      baseUrl: undefined,
    };
  }

  // Detect router type and src directory structure
  const hasAppDir = await fs.pathExists(path.join(cwd, "app"));
  const hasPagesDir = await fs.pathExists(path.join(cwd, "pages"));
  const hasSrcAppDir = await fs.pathExists(path.join(cwd, "src", "app"));
  const hasSrcPagesDir = await fs.pathExists(path.join(cwd, "src", "pages"));

  let router: ProjectInfo["router"] = "unknown";
  let useSrcDir = false;

  if (hasSrcAppDir) {
    router = "app";
    useSrcDir = true;
  } else if (hasAppDir) {
    router = "app";
    useSrcDir = false;
  } else if (hasSrcPagesDir) {
    router = "pages";
    useSrcDir = true;
  } else if (hasPagesDir) {
    router = "pages";
    useSrcDir = false;
  }

  // Detect TypeScript
  const hasTypeScript =
    (await fs.pathExists(path.join(cwd, "tsconfig.json"))) ||
    (await fs.pathExists(path.join(cwd, "next-env.d.ts")));

  // Detect CSS framework
  let cssFramework: ProjectInfo["cssFramework"] = "none";
  if (
    packageJson.dependencies?.tailwindcss ||
    packageJson.devDependencies?.tailwindcss
  ) {
    cssFramework = "tailwind";
  } else if (packageJson.dependencies?.["styled-components"]) {
    cssFramework = "styled-components";
  } else if (await fs.pathExists(path.join(cwd, "styles"))) {
    cssFramework = "css-modules";
  }

  // Detect package manager
  let packageManager: ProjectInfo["packageManager"] = "npm";
  if (await fs.pathExists(path.join(cwd, "pnpm-lock.yaml"))) {
    packageManager = "pnpm";
  } else if (await fs.pathExists(path.join(cwd, "yarn.lock"))) {
    packageManager = "yarn";
  }

  // Check for existing upload configuration
  const hasExistingUpload =
    (await fs.pathExists(path.join(cwd, "lib/upload-config.ts"))) ||
    (await fs.pathExists(path.join(cwd, "lib/upload-config.js"))) ||
    (await fs.pathExists(path.join(cwd, "upload.ts"))) ||
    (await fs.pathExists(path.join(cwd, "upload.js"))) ||
    packageJson.dependencies?.["pushduck"] !== undefined;

  // Parse TypeScript config for path mappings
  const { pathMappings, baseUrl } = await parseTsConfig(cwd);

  return {
    framework: "nextjs",
    version: nextVersion,
    router,
    typescript: hasTypeScript,
    cssFramework,
    packageManager,
    hasExistingUpload,
    rootDir: cwd,
    useSrcDir,
    pathMappings,
    baseUrl,
  };
}

export function formatProjectInfo(info: ProjectInfo): string[] {
  const lines = [];

  if (info.framework === "nextjs") {
    lines.push(`✓ Next.js ${info.version} detected`);
  } else if (info.framework === "react") {
    lines.push(`✓ React ${info.version} detected`);
  } else if (info.framework === "vue") {
    lines.push(`✓ Vue ${info.version} detected`);
  } else if (info.framework === "svelte") {
    lines.push(`✓ Svelte ${info.version} detected`);
  } else {
    lines.push("⚠ Unknown framework detected");
  }

  if (info.typescript) {
    lines.push("✓ TypeScript enabled");
  }

  if (info.router === "app") {
    lines.push("✓ App Router detected");
  } else if (info.router === "pages") {
    lines.push("✓ Pages Router detected");
  }

  if (info.cssFramework === "tailwind") {
    lines.push("✓ Tailwind CSS detected");
  }

  if (info.hasExistingUpload) {
    lines.push("⚠ Existing upload configuration found");
  }

  return lines;
}
