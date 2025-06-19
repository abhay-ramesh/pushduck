# Scoped Package Strategy: @pushduck Ecosystem

## 🎯 **Strategic Decision: Use @pushduck Scoped Packages**

After investigating NPM scopes vs GitHub organizations, the **optimal strategy** is to use NPM scoped packages under `@pushduck` while keeping GitHub repository under your personal account.

## ✅ **Key Insight: NPM ≠ GitHub**

**NPM Scopes** and **GitHub Organizations** are **completely independent**:

| Platform | Namespace | Status |
|----------|-----------|---------|
| **NPM** | `@pushduck` | ✅ **Available** - You can claim this! |
| **GitHub** | `pushduck` org | ❌ Taken (but doesn't matter!) |
| **GitHub** | `abhay-ramesh/pushduck` | ✅ **Perfect** - Your personal account |

## 📦 **New Package Architecture**

### Current Structure (next-s3-uploader)

```
next-s3-uploader                    # Main package
create-next-s3-uploader             # CLI package
@next-s3-uploader/docs              # Documentation
```

### New Structure (@pushduck)

```
@pushduck/core                      # Main package (replaces next-s3-uploader)
@pushduck/cli                       # CLI package (replaces create-next-s3-uploader)
@pushduck/docs                      # Documentation (optional)
```

## 🏗️ **Implementation Plan**

### Step 1: Create NPM Organization

1. **Go to npmjs.com and create organization:**
   - Visit: <https://www.npmjs.com/org/create>
   - Organization name: `pushduck`
   - This gives you control over the entire `@pushduck` scope

2. **Verify organization creation:**

```bash
npm org ls pushduck
```

### Step 2: Update Repository Structure

```bash
# Current structure
packages/
├── next-s3-uploader/       # Rename to: core/
└── cli/                    # Keep as cli/

# New structure  
packages/
├── core/                   # Main package (@pushduck/core)
└── cli/                    # CLI package (@pushduck/cli)
```

### Step 3: Update Package Configurations

#### **Main Package: `packages/core/package.json`**

```json
{
  "name": "@pushduck/core",
  "version": "1.0.0",
  "description": "Simple S3 file uploads for Next.js",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "module": "./dist/index.mjs",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    },
    "./server": {
      "types": "./dist/server.d.ts",
      "import": "./dist/server.mjs",
      "require": "./dist/server.js"
    },
    "./client": {
      "types": "./dist/client.d.ts",
      "import": "./dist/client.mjs",
      "require": "./dist/client.js"
    }
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/abhay-ramesh/pushduck.git",
    "directory": "packages/core"
  },
  "homepage": "https://pushduck.dev",
  "keywords": [
    "nextjs", "s3", "upload", "react", "aws", "pushduck",
    "next-s3-uploader-successor", "file-upload"
  ]
}
```

#### **CLI Package: `packages/cli/package.json`**

```json
{
  "name": "@pushduck/cli",
  "version": "1.0.0",
  "description": "CLI tool for pushduck - Simple S3 uploads for Next.js",
  "main": "dist/index.js",
  "bin": {
    "pushduck": "./dist/index.js",
    "create-pushduck": "./dist/index.js"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/abhay-ramesh/pushduck.git",
    "directory": "packages/cli"
  },
  "homepage": "https://pushduck.dev",
  "keywords": [
    "nextjs", "s3", "cli", "setup", "pushduck", "scaffold"
  ],
  "dependencies": {
    "@pushduck/core": "workspace:*"
  }
}
```

### Step 4: Update Import References

#### **Generated Templates (CLI)**

```typescript
// OLD
import { uploadRouter } from 'next-s3-uploader/server';

// NEW
import { uploadRouter } from '@pushduck/core/server';
```

#### **Package Installation (CLI)**

```typescript
// OLD
const installCommand = `npm install next-s3-uploader`;

// NEW  
const installCommand = `npm install @pushduck/core`;
```

## 🚀 **Usage Examples**

### **Installation:**

```bash
# Main package
npm install @pushduck/core

# CLI globally
npm install -g @pushduck/cli

# CLI with npx (recommended)
npx @pushduck/cli init
```

### **Import Examples:**

```typescript
// Server-side imports
import { uploadRouter } from '@pushduck/core/server';
import { S3Client } from '@pushduck/core/providers';

// Client-side imports
import { useUpload } from '@pushduck/core/client';
import { UploadButton } from '@pushduck/core/react';
```

### **CLI Usage:**

```bash
# Initialize new project
npx @pushduck/cli init

# Test configuration
npx @pushduck/cli test

# Add new route
npx @pushduck/cli add
```

## 🎯 **Migration Strategy**

### Phase 1: Setup Scoped Packages (Week 2)

1. **Create NPM organization** `pushduck`
2. **Rename package directories**
3. **Update package.json** files
4. **Update import statements**
5. **Test builds**

### Phase 2: Publish Scoped Packages (Week 3)

1. **Publish `@pushduck/core@1.0.0`**
2. **Publish `@pushduck/cli@1.0.0`**
3. **Test installations**
4. **Verify functionality**

### Phase 3: Deprecate Old Packages (Week 4)

1. **Deprecate `next-s3-uploader`** with migration message
2. **Deprecate `create-next-s3-uploader`** with migration message
3. **Update documentation** to use scoped packages

## 📊 **Benefits Analysis**

### ✅ **Advantages of Scoped Packages:**

1. **Professional Appearance:**
   - `@pushduck/core` looks more established than `pushduck`
   - Consistent with industry standards (@babel, @vue, @angular)

2. **Namespace Control:**
   - Own entire `@pushduck` scope
   - Can add future packages: `@pushduck/react`, `@pushduck/vue`

3. **Clear Organization:**
   - Core functionality: `@pushduck/core`
   - CLI tooling: `@pushduck/cli`
   - Documentation: `@pushduck/docs`

4. **Future Expansion:**
   - `@pushduck/integrations`
   - `@pushduck/providers`
   - `@pushduck/plugins`

### ⚠️ **Considerations:**

1. **Slightly longer install commands** (but more descriptive)
2. **Need to create NPM organization** (one-time setup)
3. **Import paths change** (but more explicit)

## 🔄 **Backward Compatibility**

### **Transition Package Strategy:**

Create a transition package that helps users migrate:

```typescript
// In new next-s3-uploader@0.4.0
console.log(chalk.yellow(`
⚠️  next-s3-uploader has been renamed to @pushduck/core

Please update your installation:
  npm uninstall next-s3-uploader
  npm install @pushduck/core

Update your imports:
  import { uploadRouter } from '@pushduck/core/server';

Migration guide: https://pushduck.dev/migration
`));

// Re-export from new package for immediate compatibility
export * from '@pushduck/core';
```

## 📋 **Migration Checklist**

### NPM Organization Setup

- [ ] Create NPM organization "pushduck"
- [ ] Verify access to @pushduck scope
- [ ] Configure organization settings

### Package Structure Updates

- [ ] Rename `packages/next-s3-uploader/` → `packages/core/`
- [ ] Update `packages/core/package.json` name to `@pushduck/core`
- [ ] Update `packages/cli/package.json` name to `@pushduck/cli`
- [ ] Update CLI bin commands

### Code Updates

- [ ] Update all import statements in CLI templates
- [ ] Update package installation commands in CLI
- [ ] Update generated code examples
- [ ] Update documentation references

### Workspace Configuration

- [ ] Update `pnpm-workspace.yaml`
- [ ] Update `turbo.json` package references
- [ ] Update `.changeset/config.json`
- [ ] Update GitHub workflows

### Testing & Publishing

- [ ] Test builds: `pnpm build`
- [ ] Test CLI functionality locally
- [ ] Publish `@pushduck/core@1.0.0`
- [ ] Publish `@pushduck/cli@1.0.0`
- [ ] Verify packages on npmjs.com

### Documentation & Communication

- [ ] Update website to use scoped packages
- [ ] Update README with new installation instructions
- [ ] Create migration guide for users
- [ ] Announce scoped package release

## 🎉 **Final Package Ecosystem**

### **Published Packages:**

```
@pushduck/core@1.0.0          # Main library
@pushduck/cli@1.0.0           # CLI tool
@pushduck/docs@1.0.0          # Documentation (optional)
```

### **Installation Commands:**

```bash
# For developers
npm install @pushduck/core

# For CLI users  
npx @pushduck/cli init
```

### **Repository Structure:**

```
Repository: github.com/abhay-ramesh/pushduck
Website: pushduck.dev
Packages: @pushduck/* on NPM
```

---

**This scoped package strategy gives you the best of both worlds: professional NPM namespace control with the flexibility of your personal GitHub account!** 🦆

**Next Step**: Create the NPM organization at <https://www.npmjs.com/org/create> and start the package migration process.
