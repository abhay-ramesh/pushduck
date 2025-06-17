# 🦋 Changesets Guide - Automated Changelog & Releases

## ✅ **Setup Complete**

Your monorepo now has **enterprise-grade changelog and release automation** with GitHub integration!

---

## 🚀 **Quick Start - Release Workflow**

### **1. Create a Changeset (Document Your Changes)**

```bash
# Add a changeset for your changes
pnpm changeset

# Or use the shortcut
pnpm changeset:add
```

**This will:**

- 🎯 Prompt you to select affected packages
- 📝 Ask for change type (patch/minor/major)
- ✍️ Let you write a changelog entry
- 💾 Create a `.changeset/*.md` file

### **2. Preview Your Release**

```bash
# See what will be released
pnpm changeset:status

# Detailed view
pnpm release:check
```

### **3. Release (Automated)**

```bash
# Update versions and generate changelog
pnpm version-packages

# Publish to NPM
pnpm release
```

---

## 📋 **Changeset Types & Examples**

### **Patch Release** (Bug Fixes: 0.2.1 → 0.2.2)

```
---
"next-s3-uploader": patch
---

Fix memory leak in upload progress tracking
```

### **Minor Release** (New Features: 0.2.1 → 0.3.0)

```
---
"next-s3-uploader": minor
---

Add support for custom S3 endpoints and CloudFront integration
```

### **Major Release** (Breaking Changes: 0.2.1 → 1.0.0)

```
---
"next-s3-uploader": major
---

BREAKING: Remove legacy useS3FileUpload hook, update to new useUploadRoute API
```

---

## 🛠️ **Available Commands**

### **Workspace Level (Root)**

```bash
# Add changeset
pnpm changeset
pnpm changeset:add

# Check status
pnpm changeset:status
pnpm release:check

# Version & Release
pnpm version-packages    # Updates package.json + CHANGELOG.md
pnpm release            # Publishes to NPM

# Testing
pnpm release:dry        # Dry run (no actual publish)
pnpm release:snapshot   # Beta/test releases

# Preview
pnpm changelog:preview  # See what changelog will look like
```

### **Package Level (next-s3-uploader)**

```bash
cd packages/next-s3-uploader

# Changeset workflow
pnpm release:changeset  # Full workflow: add → version → release
pnpm release:preview    # Preview changes
pnpm release:snapshot   # Test release

# Traditional (backup)
pnpm release:patch      # Direct npm version + publish
pnpm release:minor
pnpm release:major
```

---

## 📊 **Changeset Benefits**

### **🤖 Automated**

- ✅ **Auto-generates** CHANGELOG.md
- ✅ **Semantic versioning** based on change types
- ✅ **GitHub releases** with links to PRs/commits
- ✅ **Monorepo coordination** across packages

### **🔗 GitHub Integration**

- ✅ **PR links** in changelog entries
- ✅ **Commit SHAs** for traceability
- ✅ **Author attribution** automatic
- ✅ **Release notes** generated

### **📦 Monorepo Smart**

- ✅ **Dependency awareness** (if package A depends on B)
- ✅ **Selective releases** (only changed packages)
- ✅ **Version coordination** across related packages

---

## 🎯 **Example Workflow**

### **Scenario: You fixed a bug in upload progress tracking**

```bash
# 1. Create changeset
pnpm changeset
# Select: next-s3-uploader
# Type: patch
# Summary: "Fix memory leak in upload progress tracking"

# 2. Preview what will happen
pnpm changeset:status
# Shows: next-s3-uploader will go from 0.2.1 → 0.2.2

# 3. Generate versions and changelog
pnpm version-packages
# Updates: packages/next-s3-uploader/package.json
# Creates: packages/next-s3-uploader/CHANGELOG.md

# 4. Publish
pnpm release
# Publishes to NPM with updated version
```

### **Generated CHANGELOG.md:**

```markdown
# next-s3-uploader

## 0.2.2

### Patch Changes

- [#123](https://github.com/your-username/next-s3-uploader/pull/123) [`abc1234`](https://github.com/your-username/next-s3-uploader/commit/abc1234) - Fix memory leak in upload progress tracking

## 0.2.1
...
```

---

## ⚙️ **Configuration Details**

### **Current Config** (`.changeset/config.json`)

```json
{
  "changelog": ["@changesets/changelog-github", {
    "repo": "YOUR_GITHUB_USERNAME/next-s3-uploader"
  }],
  "access": "public",
  "linked": [
    ["next-s3-uploader", "create-next-s3-uploader"]
  ],
  "updateInternalDependencies": "patch",
  "ignore": ["new-api-demo", "eslint-config-custom"],
  "baseBranch": "main"
}
```

### **Features Enabled:**

- ✅ **GitHub changelog** with PR/commit links
- ✅ **Public NPM** publishing
- ✅ **Linked packages** - both packages always release together with same version
- ✅ **Demo app ignored** (won't trigger releases)
- ✅ **Internal deps** auto-bumped on changes

### **Package Linking**

The `linked` configuration ensures that `next-s3-uploader` and `create-next-s3-uploader` always maintain the same version. When you create a changeset for either package, both will be bumped to the same new version automatically.

---

## 🚀 **Advanced Workflows**

### **Snapshot Releases** (Beta/Testing)

```bash
# Create test release
pnpm release:snapshot
# Publishes as: 0.2.1-snapshot-20241217
```

### **Dry Run** (Test Without Publishing)

```bash
# See what would be published
pnpm release:dry
```

### **Selective Package Release**

```bash
# Only release specific package
pnpm changeset publish --filter=next-s3-uploader
```

---

## 🔄 **Integration with Existing Scripts**

### **Health Check Integration**

Your existing `pnpm maintenance:health` now works perfectly with changesets!

### **CI/CD Integration**

Add to your GitHub Actions:

```yaml
- name: Create Release
  run: |
    pnpm changeset:status
    pnpm version-packages
    pnpm release
```

---

## 🎉 **Benefits Over Manual Releases**

| Manual NPM | Changesets |
|------------|------------|
| ❌ Manual CHANGELOG.md | ✅ Auto-generated |
| ❌ Forget semantic versioning | ✅ Enforced by type selection |
| ❌ No PR/commit links | ✅ GitHub integration |
| ❌ Inconsistent format | ✅ Standardized format |
| ❌ Easy to forget releases | ✅ Changeset reminds you |

---

## 🎯 **Next Steps**

1. **Update GitHub repo URL** in `.changeset/config.json`
2. **Try it out** with a test changeset
3. **Integrate with CI/CD** for fully automated releases

```bash
# Ready to test? Create your first changeset!
pnpm changeset
```

Your changelog and release workflow is now **enterprise-ready**! 🚀
