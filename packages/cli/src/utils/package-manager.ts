import chalk from "chalk";
import { execa } from "execa";
import ora from "ora";

export async function installDependencies(
  packageManager: "npm" | "yarn" | "pnpm",
  cwd: string
): Promise<void> {
  const spinner = ora("Installing dependencies...").start();

  try {
    spinner.text = "Adding next-s3-uploader to package.json...";

    // Install next-s3-uploader
    const installArgs = getInstallArgs(packageManager);
    await execa(packageManager, [...installArgs, "next-s3-uploader@latest"], {
      cwd,
    });

    // Install peer dependencies if needed
    spinner.text = "Installing additional dependencies...";
    await execa(packageManager, [...installArgs, "react-dropzone"], { cwd });

    spinner.succeed("Dependencies installed successfully");

    console.log(chalk.green("\n📦 Added to package.json:"));
    console.log("  ✓ next-s3-uploader@latest");
    console.log("  ✓ react-dropzone (for drag & drop)");
  } catch (error) {
    spinner.fail("Failed to install dependencies");
    console.error(chalk.red("Error:"), error);
    console.log(chalk.yellow("\nYou can install dependencies manually:"));
    console.log(
      chalk.gray(
        `  ${packageManager} ${getInstallArgs(packageManager).join(
          " "
        )} next-s3-uploader react-dropzone`
      )
    );
    throw error;
  }
}

function getInstallArgs(packageManager: "npm" | "yarn" | "pnpm"): string[] {
  switch (packageManager) {
    case "npm":
      return ["install"];
    case "yarn":
      return ["add"];
    case "pnpm":
      return ["add"];
    default:
      return ["install"];
  }
}
