import fs from "fs-extra";
import path from "path";

export interface ProjectInfo {
  framework: "nextjs" | "unknown";
  version: string;
  router: "app" | "pages" | "unknown";
  typescript: boolean;
  cssFramework: "tailwind" | "styled-components" | "css-modules" | "none";
  packageManager: "npm" | "yarn" | "pnpm";
  hasExistingUpload: boolean;
  rootDir: string;
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
  if (!nextVersion) {
    throw new Error(
      "Next.js not detected. This tool only works with Next.js projects."
    );
  }

  // Detect router type
  const hasAppDir = await fs.pathExists(path.join(cwd, "app"));
  const hasPagesDir = await fs.pathExists(path.join(cwd, "pages"));

  let router: ProjectInfo["router"] = "unknown";
  if (hasAppDir) {
    router = "app";
  } else if (hasPagesDir) {
    router = "pages";
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

  return {
    framework: "nextjs",
    version: nextVersion,
    router,
    typescript: hasTypeScript,
    cssFramework,
    packageManager,
    hasExistingUpload,
    rootDir: cwd,
  };
}

export function formatProjectInfo(info: ProjectInfo): string[] {
  const lines = [];

  lines.push(`✓ Next.js ${info.version} detected`);

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
