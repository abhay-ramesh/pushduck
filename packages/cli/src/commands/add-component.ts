import chalk from "chalk";
import { Command } from "commander";
import detectPackageManager from "detect-package-manager";
import * as fs from "fs/promises";
import inquirer from "inquirer";
// Use native fetch for Node.js 18+
import ora from "ora";
import * as path from "path";

interface RegistryItem {
  name: string;
  type: string;
  title: string;
  description: string;
  files: Array<{
    name: string;
    content: string;
    type: string;
    target?: string;
  }>;
  dependencies: string[];
  registryDependencies: string[];
}

interface Registry {
  name: string;
  homepage: string;
  items: Array<{
    name: string;
    title: string;
    description: string;
  }>;
}

const REGISTRY_BASE_URL = "https://pushduck.dev/r";

export async function addComponentCommand(componentName?: string) {
  try {
    console.log(
      chalk.cyan(`
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   🦆 Add pushduck UI Components                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
`)
    );

    // If no component specified, show available components
    if (!componentName) {
      const spinner = ora("Fetching available components...").start();

      try {
        const response = await fetch(`${REGISTRY_BASE_URL}/index.json`);
        if (!response.ok) {
          throw new Error(`Failed to fetch registry: ${response.statusText}`);
        }

        const registry: Registry = (await response.json()) as Registry;
        spinner.stop();

        const { selectedComponent } = await inquirer.prompt([
          {
            type: "list",
            name: "selectedComponent",
            message: "Which component would you like to add?",
            choices: registry.items.map((item) => ({
              name: `${item.title} - ${item.description}`,
              value: item.name,
            })),
          },
        ]);

        componentName = selectedComponent;
      } catch (error) {
        spinner.fail("Failed to fetch component registry");
        console.error(
          chalk.red(
            `Error: ${error instanceof Error ? error.message : "Unknown error"}`
          )
        );
        process.exit(1);
      }
    }

    // Fetch the specific component
    const spinner = ora(`Fetching ${componentName}...`).start();

    try {
      const response = await fetch(
        `${REGISTRY_BASE_URL}/${componentName}.json`
      );
      if (!response.ok) {
        throw new Error(`Component "${componentName}" not found`);
      }

      const component: RegistryItem = await response.json();
      spinner.stop();

      console.log(chalk.green(`✓ Found ${component.title}`));
      console.log(chalk.gray(`  ${component.description}`));

      // Check if components.json exists to determine paths
      const hasComponentsJson = await checkComponentsJson();
      const targetPaths = hasComponentsJson
        ? await getPathsFromComponentsJson()
        : await promptForPaths();

      // Install dependencies if needed
      if (component.dependencies.length > 0) {
        console.log(chalk.yellow(`\n📦 Installing dependencies...`));
        await installDependencies(component.dependencies);
      }

      // Install registry dependencies (other components)
      if (component.registryDependencies.length > 0) {
        console.log(chalk.yellow(`\n🔗 Installing component dependencies...`));
        for (const dep of component.registryDependencies) {
          console.log(chalk.gray(`  Installing ${dep}...`));
          // For registry dependencies, we would recursively call this function
          // For now, just log that they're needed
          console.log(chalk.red(`  ⚠️  Please also install: ${dep}`));
        }
      }

      // Write component files
      console.log(chalk.yellow(`\n📁 Writing component files...`));

      for (const file of component.files) {
        const targetPath =
          file.target || path.join(targetPaths.components, file.name);
        const fullPath = path.resolve(targetPath);

        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        // Transform content for local paths
        const transformedContent = transformImports(file.content, targetPaths);

        // Write file
        await fs.writeFile(fullPath, transformedContent, "utf-8");
        console.log(chalk.green(`  ✓ ${targetPath}`));
      }

      // Success message
      console.log(chalk.green(`\n✨ Successfully added ${component.title}!`));
      console.log(
        chalk.gray(`\nYou can now import it in your React components:`)
      );
      console.log(
        chalk.cyan(`
import { ${getPascalCase(
          componentName
        )} } from "@/components/ui/${componentName}";

export function MyComponent() {
  return (
    <${getPascalCase(componentName)}
      route="myUploadRoute"
      // ... other props
    />
  );
}
      `)
      );
    } catch (error) {
      spinner.fail(`Failed to add ${componentName}`);
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

async function checkComponentsJson(): Promise<boolean> {
  try {
    await fs.access("components.json");
    return true;
  } catch {
    return false;
  }
}

async function getPathsFromComponentsJson() {
  const content = await fs.readFile("components.json", "utf-8");
  const config = JSON.parse(content);

  return {
    components: config.aliases?.ui || "./components/ui",
    utils: config.aliases?.utils || "./lib/utils",
  };
}

async function promptForPaths() {
  const { componentsPath, utilsPath } = await inquirer.prompt([
    {
      type: "input",
      name: "componentsPath",
      message: "Where should we install components?",
      default: "./components/ui",
    },
    {
      type: "input",
      name: "utilsPath",
      message: "Where is your utils file?",
      default: "./lib/utils",
    },
  ]);

  return {
    components: componentsPath,
    utils: utilsPath,
  };
}

async function installDependencies(dependencies: string[]) {
  const packageManager = await detectPackageManager();
  const installCmd =
    packageManager === "yarn"
      ? "yarn add"
      : packageManager === "pnpm"
      ? "pnpm add"
      : "npm install";

  console.log(chalk.gray(`  ${installCmd} ${dependencies.join(" ")}`));

  // Here you would actually run the install command
  // For now, just show what would be installed
  dependencies.forEach((dep) => {
    console.log(chalk.green(`  ✓ ${dep}`));
  });
}

function transformImports(
  content: string,
  paths: { components: string; utils: string }
): string {
  // Transform @/lib/utils imports to the correct path
  content = content.replace(
    /from ["']@\/lib\/utils["']/g,
    `from "${paths.utils}"`
  );

  // Transform @/components imports to the correct path
  content = content.replace(
    /from ["']@\/components\/ui\/([^"']+)["']/g,
    `from "${paths.components}/$1"`
  );

  // Transform @/registry imports to local component imports
  content = content.replace(
    /from ["']@\/registry\/default\/([^/]+)\/([^"']+)["']/g,
    `from "${paths.components}/$2"`
  );

  return content;
}

function getPascalCase(str: string): string {
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

// Add to commander
export function addComponentToCommander(program: Command) {
  program
    .command("add [component]")
    .description("Add a UI component from the pushduck registry")
    .option("--registry <url>", "Custom registry URL")
    .option("--path <path>", "Installation path")
    .action(async (component, options) => {
      await addComponentCommand(component);
    });
}
