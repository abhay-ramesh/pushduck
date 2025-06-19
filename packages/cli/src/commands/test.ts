import chalk from "chalk";
import { detectProject } from "../utils/project-detector";
import {
  detectExistingCredentials,
  testConnection,
} from "../utils/provider-setup";

interface TestOptions {
  verbose?: boolean;
}

export async function testCommand(options: TestOptions = {}) {
  console.log(chalk.cyan("🔍 Testing your S3 upload configuration...\n"));

  try {
    // Detect project and configuration
    const projectInfo = await detectProject();

    if (!projectInfo.hasExistingUpload) {
      console.log(chalk.yellow("⚠ No upload configuration found."));
      console.log(chalk.gray("Run: npx @pushduck/cli@latest init"));
      return;
    }

    // Try to detect provider and credentials
    const providers = [
      "aws",
      "cloudflare-r2",
      "digitalocean",
      "minio",
      "gcs",
    ] as const;
    let foundCredentials = false;

    for (const provider of providers) {
      const credentials = await detectExistingCredentials(provider);

      if (
        credentials.accessKeyId &&
        credentials.secretAccessKey &&
        credentials.bucket
      ) {
        console.log(
          chalk.green(`✓ Found ${provider.toUpperCase()} credentials`)
        );

        const works = await testConnection(credentials as any, provider);

        if (works) {
          console.log(chalk.green("✓ Connection test successful"));
          console.log(
            chalk.green("\n🎉 Your upload configuration is working correctly!")
          );
        } else {
          console.log(chalk.red("❌ Connection test failed"));
        }

        foundCredentials = true;
        break;
      }
    }

    if (!foundCredentials) {
      console.log(
        chalk.yellow("⚠ No valid credentials found in environment variables")
      );
      console.log(
        chalk.gray(
          "Make sure your .env.local file contains the required variables"
        )
      );
    }
  } catch (error) {
    console.error(chalk.red("❌ Test failed:"), error);

    if (options.verbose) {
      console.error(error);
    }
  }
}
