#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import { addComponentCommand } from "./commands/add-component";
import { addRouteCommand } from "./commands/add-route";
import { corsApplyCommand, corsCheckCommand } from "./commands/cors";
import { initCommand } from "./commands/init";
import { testCommand } from "./commands/test";

const program = new Command();

program
  .name("pushduck")
  .description("Zero-config setup for Next.js S3 file uploads")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize S3 upload configuration in your Next.js project")
  .option(
    "--provider <type>",
    "Skip provider selection (aws|cloudflare-r2|digitalocean|minio|neon|gcs)"
  )
  .option("--skip-examples", "Don't generate example components")
  .option("--skip-bucket", "Don't create S3 bucket automatically")
  .option("--api-path <path>", "Custom API route path", "/api/upload")
  .option("--dry-run", "Show what would be created without creating")
  .option("--verbose", "Show detailed output")
  .action(initCommand);

program
  .command("test")
  .description("Test your current S3 upload configuration")
  .option("--verbose", "Show detailed test output")
  .action(testCommand);

const PROVIDER_OPTION = [
  "--provider <type>",
  "Use this provider's credentials (aws|cloudflare-r2|digitalocean|minio|neon|gcs); detected from the environment by default",
] as const;

const cors = program
  .command("cors")
  .description(
    "Check or fix the bucket CORS rules browser uploads need"
  );

cors
  .command("check")
  .description(
    "Report whether browser uploads and downloads from each origin pass the bucket's CORS"
  )
  .requiredOption(
    "--origin <origins...>",
    "Origins the app is served from, e.g. http://localhost:3000 https://app.example.com"
  )
  .option(...PROVIDER_OPTION)
  .action(async (options) => {
    process.exitCode = await corsCheckCommand(options);
  });

cors
  .command("apply")
  .description(
    "Add origins to the bucket's CORS rules, keeping the rules already there"
  )
  .requiredOption(
    "--origin <origins...>",
    "Origins to allow; one * is allowed, e.g. https://*.example.com"
  )
  .option(...PROVIDER_OPTION)
  .option("-y, --yes", "Apply without asking for confirmation")
  .action(async (options) => {
    process.exitCode = await corsApplyCommand(options);
  });

program
  .command("add-route")
  .description("Add a new upload route to existing configuration")
  .action(addRouteCommand);

program
  .command("add [component]")
  .description("Add a UI component from the pushduck registry")
  .option("--registry <url>", "Custom registry URL")
  .option("--path <path>", "Installation path")
  .action(async (component, options) => {
    await addComponentCommand(component);
  });

// Handle unknown commands
program.on("command:*", () => {
  console.log(chalk.red(`Unknown command: ${program.args.join(" ")}`));
  console.log("Run --help for available commands");
  process.exit(1);
});

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

program.parse(process.argv);
