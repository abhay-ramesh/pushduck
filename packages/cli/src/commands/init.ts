import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { installDependencies } from "../utils/package-manager";
import { detectProject, formatProjectInfo } from "../utils/project-detector";
import {
  createS3Bucket,
  detectExistingCredentials,
  promptForMissingCredentials,
  selectProvider,
  testConnection,
  type ProviderType,
} from "../utils/provider-setup";
import { generateFiles } from "../utils/simple-file-generator";

interface InitOptions {
  provider?: ProviderType;
  skipExamples?: boolean;
  skipBucket?: boolean;
  apiPath?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

function getCORSLinks(provider: ProviderType): {
  corsSetup: string;
  providerDocs: string;
} {
  const baseUrl = "https://pushduck.dev";

  switch (provider) {
    case "aws":
      return {
        corsSetup: `${baseUrl}/docs/guides/security/cors-and-acl`,
        providerDocs: `${baseUrl}/docs/providers/aws-s3`,
      };
    case "cloudflare-r2":
      return {
        corsSetup: `${baseUrl}/docs/guides/security/cors-and-acl`,
        providerDocs: `${baseUrl}/docs/providers/cloudflare-r2`,
      };
    case "digitalocean":
      return {
        corsSetup: `${baseUrl}/docs/guides/security/cors-and-acl`,
        providerDocs: `${baseUrl}/docs/providers/digitalocean-spaces`,
      };
    case "minio":
      return {
        corsSetup: `${baseUrl}/docs/guides/security/cors-and-acl`,
        providerDocs: `${baseUrl}/docs/providers/minio`,
      };
    case "gcs":
      return {
        corsSetup: `${baseUrl}/docs/guides/security/cors-and-acl`,
        providerDocs: `${baseUrl}/docs/providers/google-cloud`,
      };
    default:
      return {
        corsSetup: `${baseUrl}/docs/guides/security/cors-and-acl`,
        providerDocs: `${baseUrl}/docs/providers`,
      };
  }
}

export async function initCommand(options: InitOptions = {}) {
  console.log(
    chalk.cyan(`
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   🚀 Welcome to Pushduck                                    │
│                                                             │
│   Let's get your file uploads working in 2 minutes!         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
`)
  );

  try {
    // Step 1: Detect project
    console.log(chalk.cyan("🔍 Detecting your project..."));
    const projectInfo = await detectProject();
    const infoLines = formatProjectInfo(projectInfo);
    infoLines.forEach((line) => console.log(`  ${line}`));

    // Check if using Next.js - CLI currently only supports Next.js
    if (projectInfo.framework !== "nextjs") {
      const frameworkName =
        projectInfo.framework === "react"
          ? "React"
          : projectInfo.framework === "vue"
          ? "Vue"
          : projectInfo.framework === "svelte"
          ? "Svelte"
          : "Unknown framework";

      console.log(chalk.yellow(`\n⚠ ${frameworkName} Not Supported by CLI`));
      console.log(
        chalk.gray("This CLI currently only works with Next.js projects.")
      );
      console.log(
        chalk.gray(
          `For ${frameworkName.toLowerCase()} projects, please use manual setup.\n`
        )
      );

      console.log(chalk.cyan("📖 Manual Setup Documentation:"));
      console.log("  https://pushduck.dev/docs/getting-started/manual-setup");

      console.log(chalk.cyan("\n🔧 Integration Guides:"));

      // Show specific framework integration if detected
      if (projectInfo.framework === "react") {
        console.log("  React: https://pushduck.dev/docs/integrations/overview");
      } else if (projectInfo.framework === "vue") {
        console.log("  Vue: https://pushduck.dev/docs/integrations/overview");
      } else if (projectInfo.framework === "svelte") {
        console.log(
          "  Svelte: https://pushduck.dev/docs/integrations/overview"
        );
      } else {
        console.log(
          "  General: https://pushduck.dev/docs/integrations/overview"
        );
      }

      console.log(chalk.gray("\nThe manual setup will guide you through:"));
      console.log(chalk.gray("  • Installing pushduck"));
      console.log(chalk.gray("  • Configuring your storage provider"));
      console.log(chalk.gray("  • Setting up API routes"));
      console.log(chalk.gray("  • Adding client-side components"));

      return;
    }

    if (projectInfo.hasExistingUpload) {
      const { overwrite } = await inquirer.prompt([
        {
          type: "confirm",
          name: "overwrite",
          message:
            "Existing upload configuration detected. Do you want to overwrite it?",
          default: false,
        },
      ]);

      if (!overwrite) {
        console.log(
          chalk.yellow(
            "Setup cancelled. Use --force to overwrite existing configuration."
          )
        );
        return;
      }
    }

    // Step 2: Provider selection
    const provider = await selectProvider(options.provider);

    // Step 3: Environment detection & setup
    console.log(chalk.cyan(`🔧 Setting up ${provider.toUpperCase()}...`));
    console.log(chalk.cyan("\n🔍 Checking for existing credentials..."));

    const existingCredentials = await detectExistingCredentials(provider);

    // Show what we found
    Object.entries(existingCredentials).forEach(([key, value]) => {
      if (value) {
        console.log(chalk.green(`  ✓ Found ${key.toUpperCase()}`));
      } else {
        console.log(chalk.yellow(`  ⚠ ${key.toUpperCase()} not found`));
      }
    });

    // Prompt for missing credentials
    const credentials = await promptForMissingCredentials(
      provider,
      existingCredentials
    );

    // Step 4: Bucket creation (optional)
    if (
      !options.skipBucket &&
      credentials.accessKeyId &&
      credentials.secretAccessKey
    ) {
      const { createBucket } = await inquirer.prompt([
        {
          type: "confirm",
          name: "createBucket",
          message: "🔒 Would you like to create the S3 bucket automatically?",
          default: true,
        },
      ]);

      if (createBucket) {
        if (options.dryRun) {
          console.log(
            chalk.blue(
              "  [DRY RUN] Would create S3 bucket:",
              credentials.bucket
            )
          );
        } else {
          const bucketCreated = await createS3Bucket(credentials, provider);
          if (!bucketCreated) {
            console.log(
              chalk.yellow(
                "⚠ Bucket creation failed, but you can continue with manual setup"
              )
            );
          }
        }
      }
    }

    // Step 5: Route generation options
    console.log(chalk.cyan("\n🛠️ Generating API routes..."));

    const { apiPath } = await inquirer.prompt([
      {
        type: "list",
        name: "apiPath",
        message: "Where should we create the upload API?",
        choices: [
          {
            name: "app/api/upload/route.ts (recommended)",
            value: "/api/upload",
            short: "upload",
          },
          {
            name: "app/api/s3-upload/route.ts (classic)",
            value: "/api/s3-upload",
            short: "s3-upload",
          },
          { name: "Custom path", value: "custom", short: "custom" },
        ],
        default: "/api/upload",
      },
    ]);

    let finalApiPath = apiPath;
    if (apiPath === "custom") {
      const { customPath } = await inquirer.prompt([
        {
          type: "input",
          name: "customPath",
          message: "Enter custom API path:",
          default: "/api/upload",
          validate: (input: string) => {
            if (!input.startsWith("/api/")) {
              return "API path must start with /api/";
            }
            return true;
          },
        },
      ]);
      finalApiPath = customPath;
    }

    // Step 6: Example generation options
    let generateExamples = true;
    if (!options.skipExamples) {
      const { exampleType } = await inquirer.prompt([
        {
          type: "list",
          name: "exampleType",
          message: "🎨 Generate example upload page?",
          choices: [
            {
              name: "Yes, create app/upload/page.tsx with full example",
              value: "full",
            },
            {
              name: "Yes, just add components to components/ui/",
              value: "components",
            },
            { name: "No, I'll build my own", value: "none" },
          ],
          default: "full",
        },
      ]);

      generateExamples = exampleType !== "none";
      options.skipExamples = exampleType === "none";
    }

    // Step 7: Generate files
    if (options.dryRun) {
      console.log(chalk.blue("\n[DRY RUN] Files that would be created:"));
      console.log(chalk.blue("  ├── app/api/upload/route.ts"));
      console.log(chalk.blue("  ├── lib/upload-config.ts"));
      if (generateExamples) {
        console.log(chalk.blue("  ├── components/ui/upload-zone.tsx"));
        console.log(chalk.blue("  ├── components/ui/file-list.tsx"));
        console.log(chalk.blue("  ├── app/upload/page.tsx"));
      }
      console.log(chalk.blue("  └── .env.local (updated)"));
      return;
    }

    const spinner = ora("Generating files...").start();

    await generateFiles({
      projectInfo,
      provider,
      credentials,
      apiPath: finalApiPath,
      generateExamples,
      verbose: options.verbose,
    });

    spinner.succeed("Files generated successfully");

    // Step 8: Install dependencies
    if (!projectInfo.hasExistingUpload) {
      await installDependencies(
        projectInfo.packageManager,
        projectInfo.rootDir
      );
    } else if (generateExamples) {
      // Install dependencies if we're generating examples but pushduck already exists
      await installDependencies(
        projectInfo.packageManager,
        projectInfo.rootDir
      );
    }

    // Step 9: Configuration summary
    console.log(chalk.green("\n🎉 Setup complete! Here's what was created:\n"));

    console.log(chalk.cyan("📁 Files created:"));
    console.log(
      `  ├── ${finalApiPath.replace(
        "/api/",
        "app/api/"
      )}/route.ts        # Upload API endpoint`
    );
    console.log(`  ├── lib/upload-config.ts           # Upload configuration`);

    if (generateExamples) {
      console.log(
        `  ├── components/ui/upload-zone.tsx  # Drag & drop component`
      );
      console.log(
        `  ├── components/ui/file-list.tsx   # Upload progress display`
      );
      console.log(`  ├── app/upload/page.tsx           # Example upload page`);
    }

    console.log(`  └── .env.local                     # Environment variables`);

    console.log(chalk.cyan("\n🔧 Configuration:"));
    console.log(`  Provider:   ${provider.toUpperCase()}`);
    console.log(`  Bucket:     ${credentials.bucket}`);
    console.log(`  Region:     ${credentials.region}`);
    console.log(`  API Route:  ${finalApiPath}`);

    console.log(chalk.cyan("\n🚀 Next steps:"));
    console.log("  1. Run: npm run dev");
    if (generateExamples) {
      console.log("  2. Visit: http://localhost:3000/upload");
      console.log("  3. Try uploading a file!");
    } else {
      console.log("  2. Import components from pushduck");
      console.log("  3. Build your upload interface!");
    }

    console.log(chalk.cyan("\n📚 Documentation: https://pushduck.dev/docs"));

    // Step 10: Test configuration
    if (credentials.accessKeyId && credentials.secretAccessKey) {
      console.log(chalk.cyan("\n🔍 Testing your configuration..."));

      const connectionWorks = await testConnection(credentials, provider);

      if (connectionWorks) {
        console.log(
          chalk.green(
            "\n🎉 Everything looks good! Your upload system is ready."
          )
        );
      } else {
        console.log(
          chalk.yellow(
            "\n⚠ Connection test failed. Please check your credentials and try again."
          )
        );
        console.log(
          chalk.gray(
            "You can test your configuration anytime with: npx @pushduck/cli test"
          )
        );
      }
    }

    // Step 11: CORS Setup Reminder
    console.log(chalk.cyan("\n🔒 Important: CORS Configuration"));
    console.log(chalk.yellow("Have you configured CORS for your bucket?"));
    console.log(
      chalk.gray("File uploads from browsers require proper CORS settings.")
    );

    const corsLinks = getCORSLinks(provider);
    console.log(chalk.cyan("\n📖 Setup guides:"));
    console.log(`  CORS Setup: ${corsLinks.corsSetup}`);
    console.log(`  Provider Docs: ${corsLinks.providerDocs}`);

    const { corsConfigured } = await inquirer.prompt([
      {
        type: "confirm",
        name: "corsConfigured",
        message: "Have you already configured CORS?",
        default: false,
      },
    ]);

    if (!corsConfigured) {
      console.log(
        chalk.yellow("\n⚠ Please configure CORS before testing uploads:")
      );
      console.log(chalk.gray("  1. Follow the CORS setup guide above"));
      console.log(
        chalk.gray("  2. Test your configuration with: npx @pushduck/cli test")
      );
      console.log(
        chalk.gray("  3. If uploads fail, double-check your CORS settings")
      );
    } else {
      console.log(
        chalk.green("\n✅ Great! Your CORS configuration should be ready.")
      );
    }
  } catch (error) {
    console.error(chalk.red("\n❌ Setup failed:"), error);

    if (options.verbose) {
      console.error(error);
    }

    console.log(
      chalk.gray(
        "\nFor help, visit: https://pushduck.dev/docs/api/troubleshooting"
      )
    );
    process.exit(1);
  }
}
