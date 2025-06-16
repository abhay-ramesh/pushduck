import chalk from "chalk";
import inquirer from "inquirer";

export async function addRouteCommand() {
  console.log(chalk.cyan("🛠️ Add a new upload route\n"));

  try {
    const { routeName } = await inquirer.prompt([
      {
        type: "input",
        name: "routeName",
        message: 'Route name (e.g., "avatarUpload"):',
        validate: (input: string) => {
          if (!input) return "Route name is required";
          if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(input)) {
            return "Route name must be a valid JavaScript identifier";
          }
          return true;
        },
      },
    ]);

    const { fileType } = await inquirer.prompt([
      {
        type: "list",
        name: "fileType",
        message: "What type of files will this route handle?",
        choices: [
          { name: "Images (.jpg, .png, .webp)", value: "image" },
          { name: "Documents (.pdf, .doc, .txt)", value: "document" },
          { name: "Any file type", value: "file" },
          { name: "Custom configuration", value: "custom" },
        ],
      },
    ]);

    console.log(chalk.green("\n✨ Route configuration generated!\n"));
    console.log(chalk.cyan("Add this to your upload-config.ts:"));
    console.log(chalk.gray("----------------------------------------"));

    const routeConfig = generateRouteConfig(routeName, fileType);
    console.log(routeConfig);

    console.log(chalk.gray("----------------------------------------"));
    console.log(
      chalk.blue("\n💡 Don't forget to update your TypeScript types!")
    );
  } catch (error) {
    console.error(chalk.red("❌ Failed to generate route:"), error);
  }
}

function generateRouteConfig(routeName: string, fileType: string): string {
  const baseConfig = `  ${routeName}: uploadConfig
    .aws() // or your provider
    .${fileType}()`;

  switch (fileType) {
    case "image":
      return `${baseConfig}
    .maxSize("5MB")
    .allowedTypes(["image/jpeg", "image/png", "image/webp"])
    .build(),`;

    case "document":
      return `${baseConfig}
    .maxSize("10MB")
    .allowedTypes(["application/pdf", "application/msword", "text/plain"])
    .build(),`;

    case "file":
      return `${baseConfig}
    .maxSize("50MB")
    .allowedTypes(["*"])
    .build(),`;

    default:
      return `${baseConfig}
    .maxSize("10MB")
    .allowedTypes(["your/mime-type"])
    .build(),`;
  }
}
