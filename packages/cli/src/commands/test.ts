import chalk from "chalk";
import { detectProject } from "../utils/project-detector";
import {
  findConfiguredProvider,
  testConnection,
} from "../utils/provider-setup";

interface TestOptions {
  verbose?: boolean;
}

export async function testCommand(options: TestOptions = {}) {
  console.log(chalk.cyan("Testing your S3 upload configuration...\n"));

  try {
    // Detect project and configuration
    const projectInfo = await detectProject();

    if (!projectInfo.hasExistingUpload) {
      console.log(chalk.yellow("No upload configuration found."));
      console.log(chalk.gray("Run: npx @pushduck/cli@latest init"));
      return;
    }

    const found = await findConfiguredProvider();

    if (found) {
      const { provider, credentials } = found;
      console.log(chalk.green(`✓ Found ${provider.toUpperCase()} credentials`));

      const works = await testConnection(credentials, provider);

      if (works) {
        console.log(chalk.green("✓ Connection test successful"));
        console.log(
          chalk.green("\nYour upload configuration is working correctly!")
        );
      } else {
        console.log(chalk.red("Connection test failed"));
      }
    }

    if (!found) {
      console.log(
        chalk.yellow("No valid credentials found in environment variables")
      );
      console.log(
        chalk.gray(
          "Make sure your .env.local file contains the required variables"
        )
      );
    }
  } catch (error) {
    console.error(chalk.red("Test failed:"), error);

    if (options.verbose) {
      console.error(error);
    }
  }
}
