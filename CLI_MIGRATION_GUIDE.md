# CLI Migration Guide: create-next-s3-uploader → create-pushduck

## 🎯 Overview

Your CLI package `create-next-s3-uploader` needs to be migrated to `create-pushduck` as part of the overall package migration. This guide covers the complete transformation process.

## 📦 Current CLI Structure

```
packages/cli/
├── package.json          # Main CLI configuration
├── src/
│   ├── index.ts         # CLI entry point
│   ├── commands/
│   │   ├── init.ts      # Initialize S3 upload config
│   │   ├── add-route.ts # Add new upload routes
│   │   └── test.ts      # Test S3 configuration
│   └── utils/
│       ├── package-manager.ts
│       ├── project-detector.ts
│       ├── provider-setup.ts
│       └── simple-file-generator.ts
└── templates/           # File templates for generation
```

## 🔄 Migration Steps

### Step 1: Update Package Configuration

Update `packages/cli/package.json`:

```json
{
  "name": "create-pushduck",
  "version": "1.0.0",
  "description": "Zero-config setup CLI for pushduck - Simple S3 uploads for Next.js",
  "main": "dist/index.js",
  "bin": {
    "create-pushduck": "./dist/index.js",
    "pushduck": "./dist/index.js"
  },
  "keywords": [
    "nextjs",
    "s3",
    "upload",
    "cli",
    "setup",
    "scaffold",
    "aws",
    "cloudflare",
    "digitalocean",
    "pushduck",
    "next-s3-uploader-successor"
  ],
  "author": "Abhay Ramesh",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/abhay-ramesh/pushduck.git",
    "directory": "packages/cli"
  },
  "homepage": "https://pushduck.dev"
}
```

### Step 2: Update CLI Entry Point

Update `packages/cli/src/index.ts`:

```typescript
#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import { addRouteCommand } from "./commands/add-route";
import { initCommand } from "./commands/init";
import { testCommand } from "./commands/test";

const program = new Command();

program
  .name("pushduck")
  .description("Zero-config setup for Next.js S3 file uploads with pushduck")
  .version("1.0.0");

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
```

### Step 3: Update Init Command Branding

Update `packages/cli/src/commands/init.ts`:

```typescript
// Update the welcome message
console.log(
  chalk.cyan(`
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   🦆 Welcome to pushduck                                   │
│                                                             │
│   Let's get your S3 file uploads working in 2 minutes!     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
`)
);
```

### Step 4: Update Package Installation References

Update all package installation commands in your CLI to use `pushduck`:

```typescript
// In utils/package-manager.ts or wherever you install dependencies
const installCommand = {
  npm: `npm install pushduck`,
  yarn: `yarn add pushduck`, 
  pnpm: `pnpm add pushduck`
};
```

### Step 5: Update Generated Templates

Update any generated code templates to use `pushduck` imports:

```typescript
// Template for generated API routes
const routeTemplate = `
import { uploadRouter } from 'pushduck/server';

export const { GET, POST } = uploadRouter({
  // configuration
});
`;

// Template for generated components
const componentTemplate = `
import { useUpload } from 'pushduck/client';

export function UploadComponent() {
  const { upload, isUploading } = useUpload();
  // component implementation
}
`;
```

### Step 6: Update Help Text and Documentation

Update all help text, descriptions, and URLs:

```typescript
// Update references to documentation
const helpText = `
For more information, visit: https://pushduck.dev
Documentation: https://pushduck.dev/docs
Examples: https://pushduck.dev/examples
`;
```

## 🔧 Technical Migration Process

### Rename Package Directory (Optional)

If you want to keep the directory structure clean:

```bash
# In packages/
mv cli @pushduck/cli
# Or keep it as cli, both work fine
```

### Update Workspace Configuration

Update `pnpm-workspace.yaml` if you renamed the directory:

```yaml
packages:
  - "packages/*"
  - "packages/@pushduck/cli"  # if renamed
```

Update `turbo.json` references:

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    }
  }
}
```

## 📋 Complete File Updates Checklist

### Package Configuration

- [ ] Update `package.json` name to `create-pushduck`
- [ ] Update version to `1.0.0`
- [ ] Update description with pushduck branding
- [ ] Update bin commands to use pushduck
- [ ] Update repository URL
- [ ] Update homepage URL
- [ ] Add migration keywords

### Source Code Updates

- [ ] Update CLI name in `src/index.ts`
- [ ] Update welcome message in `src/commands/init.ts`
- [ ] Update package installation commands
- [ ] Update generated template imports
- [ ] Update help text and documentation URLs
- [ ] Update error messages and logs

### Dependencies

- [ ] Update package.json dependencies to use `pushduck` instead of `next-s3-uploader`
- [ ] Ensure all dependencies are compatible
- [ ] Test CLI functionality

### Templates & Generated Code

- [ ] Update API route templates to import from `pushduck/server`
- [ ] Update component templates to import from `pushduck/client`
- [ ] Update example configurations
- [ ] Update documentation references in generated files

## 🧪 Testing Your CLI Migration

### Test Commands

1. **Build the CLI:**

```bash
cd packages/cli
pnpm build
```

2. **Test CLI Commands:**

```bash
# Test help
node dist/index.js --help

# Test init command (dry run)
node dist/index.js init --dry-run

# Test in a sample Next.js project
cd /tmp
npx create-next-app@latest test-pushduck
cd test-pushduck
node /path/to/your/packages/cli/dist/index.js init --dry-run
```

3. **Test Package Installation:**

```bash
# Test the published package
npm pack  # Creates tarball for testing
npm install -g ./create-pushduck-1.0.0.tgz
create-pushduck init --help
```

## 🚀 CLI Usage Examples

### Before (next-s3-uploader)

```bash
npx create-next-s3-uploader@latest init
npx create-next-s3-uploader@latest test
npx create-next-s3-uploader@latest add
```

### After (pushduck)

```bash
npx create-pushduck@latest init
npx create-pushduck@latest test  
npx create-pushduck@latest add
```

## 🔄 Backward Compatibility

Consider creating a transition package that helps users migrate:

```typescript
// In old create-next-s3-uploader package
console.log(chalk.yellow(`
⚠️  create-next-s3-uploader has been renamed to create-pushduck

Please use the new CLI:
  npx create-pushduck@latest init

Migration guide: https://pushduck.dev/migration
`));

// Optionally redirect to new CLI
import { spawn } from 'child_process';
spawn('npx', ['create-pushduck@latest', ...process.argv.slice(2)], { 
  stdio: 'inherit' 
});
```

## 📦 Publishing Strategy

### 1. Publish New CLI Package

```bash
cd packages/cli
pnpm build
pnpm publish
```

### 2. Deprecate Old CLI Package

```bash
npm deprecate create-next-s3-uploader "Renamed to 'create-pushduck'. Use: npx create-pushduck@latest"
```

### 3. Update Documentation

- [ ] Update all documentation to use new CLI commands
- [ ] Update getting started guides
- [ ] Update README examples
- [ ] Update migration guide

## 🎯 Success Verification

After migration, verify:

- [ ] `npx create-pushduck@latest --help` works
- [ ] `npx create-pushduck@latest init` creates correct files
- [ ] Generated files import from `pushduck` package
- [ ] All CLI commands function correctly
- [ ] Documentation URLs point to pushduck.dev
- [ ] Package installs pushduck (not next-s3-uploader)

## 📚 Documentation Updates

Update these documentation sections:

1. **Installation Guide:**

```bash
# OLD
npx create-next-s3-uploader@latest init

# NEW  
npx create-pushduck@latest init
```

2. **CLI Reference:**

```bash
# Initialize new project
npx create-pushduck@latest init

# Test configuration
npx create-pushduck@latest test

# Add new route
npx create-pushduck@latest add
```

3. **Migration Guide:**
Add a section explaining the CLI migration for existing users.

---

**Ready to start the CLI migration?** The process is straightforward and ensures your users have a smooth transition to the new pushduck branding! 🦆
