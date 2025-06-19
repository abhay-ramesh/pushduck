#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import { addRouteCommand } from "./commands/add-route";
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
    "Skip provider selection (aws|cloudflare-r2|digitalocean|minio|gcs)"
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

program
  .command("add")
  .description("Add a new upload route to existing configuration")
  .action(addRouteCommand);

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
