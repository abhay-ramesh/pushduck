# Merge Strategy Guide: Why Squash and Merge

This document explains our choice of **Squash and Merge** as the primary merge strategy for Pushduck and how it benefits the project.

## 🎯 Strategy Overview

**Primary Strategy**: **Squash and Merge** (enforced via GitHub settings)
**Alternative**: None (merge commits and rebase disabled)
**Enforcement**: Repository settings + branch protection rules

## 📊 Strategy Comparison

| Strategy | Git History | Changelog | Debugging | Complexity | Best For |
|----------|-------------|-----------|-----------|------------|----------|
| **Squash & Merge** ✅ | Linear, clean | Perfect | Simple | Low | Libraries |
| Merge Commit | Branched, messy | Complex | Hard | Medium | Large teams |
| Rebase & Merge | Linear, detailed | Good | Medium | High | Core teams |

## 🏆 Why Squash and Merge for Pushduck

### ✅ **Perfect for Library Projects**

```bash
# Clean, atomic commits per feature
* feat(core): add retry mechanism (#45)
* fix(client): resolve memory leak in progress tracking (#44)  
* docs(api): update configuration examples (#43)
* chore(deps): update development dependencies (#42)
```

### ✅ **Excellent Changelog Generation**

Our changesets + conventional commits create perfect release notes:

```markdown
## 1.2.0 (2024-01-15)

### Features
- **core**: add retry mechanism (#45)
- **client**: add upload progress events (#41)

### Bug Fixes  
- **client**: resolve memory leak in progress tracking (#44)

### Documentation
- **api**: update configuration examples (#43)
```

### ✅ **Simplified Debugging**

```bash
# Easy to identify problematic commits
git log --oneline
* a1b2c3d feat(core): add retry mechanism (#45)
* e4f5g6h fix(client): resolve memory leak (#44)
* i7j8k9l docs(api): update examples (#43)

# Simple to revert problematic features
git revert a1b2c3d  # Reverts entire retry feature
```

### ✅ **Better Bundle Analysis**

Each commit represents one logical change, making bundle size tracking more meaningful:

```bash
# Bundle size changes per feature
feat(core): add retry mechanism (+1.2KB)
fix(client): optimize progress tracking (-0.5KB)
refactor(utils): improve tree shaking (-0.8KB)
```

## 🔧 Implementation Details

### Repository Settings (`.github/settings.yml`)

```yaml
repository:
  # ENFORCE SQUASH AND MERGE ONLY
  allow_squash_merge: true
  allow_merge_commit: false      # ❌ Disabled
  allow_rebase_merge: false      # ❌ Disabled
  
  # Squash commit format
  squash_merge_commit_title: PR_TITLE
  squash_merge_commit_message: PR_BODY
  
  # Auto-cleanup
  delete_branch_on_merge: true
```

### Branch Protection Rules

```yaml
branches:
  - name: main
    protection:
      require_linear_history: true  # Enforces linear history
      required_conversation_resolution: true
```

### Contributor Guidelines

Contributors follow this simple workflow:

```bash
# 1. Create feature branch
git checkout -b feat/new-feature

# 2. Make commits (any format, gets squashed)
git commit -m "wip: initial implementation"
git commit -m "fix typo"  
git commit -m "add tests"
git commit -m "update docs"

# 3. Create PR with conventional title
# Title: "feat(core): add new feature"
# Body: Detailed description

# 4. Maintainer squashes on merge
# Result: Single clean commit in main
```

## 📈 Benefits in Practice

### **1. Release Management**

```bash
# Simple release process
pnpm changeset version  # Bumps versions based on conventional commits
pnpm release           # Publishes with clean changelog
```

### **2. Git Operations**

```bash
# Fast git operations
git log --oneline      # Clean, readable history
git bisect            # Efficient debugging
git revert            # Safe feature rollbacks
```

### **3. Code Review**

- **Focus on functionality** over commit history
- **PR title becomes commit message** (encourages good titles)
- **Simplified review process** (one logical change per PR)

### **4. Community Contributions**

- **Lower barrier to entry** (don't need to know git rebase)
- **Less friction** for occasional contributors
- **Consistent history** regardless of contributor experience

## 🚫 What We Avoid

### **Merge Commits**

```bash
# Messy history we avoid:
*   Merge pull request #45 from user/feature
|\  
| * fix: typo in documentation
| * feat: add new upload method
| * wip: initial implementation  
|/  
* Previous commit
```

### **Complex Rebase Workflows**

```bash
# Complex contributor workflow we avoid:
git rebase -i HEAD~3   # Squash commits manually
git push --force       # Dangerous for new contributors
```

## 🛠 Tooling Integration

### **Changesets**

```json
{
  "changelog": [
    "@changesets/changelog-github",
    {
      "repo": "abhay-ramesh/pushduck"
    }
  ]
}
```

### **Conventional Commits**

```bash
# Enforced via commitlint
feat(scope): description
fix(scope): description  
docs(scope): description
```

### **GitHub Actions**

```yaml
# Automatic releases based on squashed commits
- name: Release
  run: pnpm changeset publish
```

## 📚 Industry Examples

Many successful libraries use squash and merge:

| Library | Strategy | Repository | Reasoning |
|---------|----------|------------|-----------|
| **Next.js** | Squash & Merge | vercel/next.js | Clean history, easy debugging |
| **React** | Squash & Merge | facebook/react | Atomic commits per feature |
| **Vue.js** | Squash & Merge | vuejs/core | Simplified release management |
| **Vite** | Squash & Merge | vitejs/vite | Better changelog generation |

## 🔄 Alternative Scenarios

### **When to Consider Other Strategies**

**Merge Commits**:

- ✅ Large teams with complex branching
- ✅ Need to preserve detailed commit history
- ❌ Not suitable for libraries

**Rebase & Merge**:

- ✅ Small, experienced core team
- ✅ Want detailed commit history
- ❌ Higher complexity for contributors

### **Our Context**

- **Library project** ✅ (perfect for squash)
- **Open source** ✅ (simplifies contributions)
- **Automated releases** ✅ (works best with atomic commits)
- **Community-driven** ✅ (lower barrier to entry)

## 📋 Migration Checklist

- [x] **Repository settings** configured
- [x] **Branch protection** rules enabled
- [x] **Contributing guidelines** updated
- [x] **Documentation** reflects new strategy
- [x] **Team alignment** on approach
- [ ] **Community communication** about change

## 🎓 Best Practices

### **For Contributors**

1. **Focus on PR titles** - they become commit messages
2. **Write detailed PR descriptions** - they provide context
3. **Don't worry about commit history** - it gets squashed
4. **Use conventional commit format** for PR titles

### **For Maintainers**

1. **Review PR titles** before merging
2. **Edit titles if needed** to follow conventions
3. **Ensure PR descriptions** are comprehensive
4. **Use squash merge consistently** (never merge commits)

### **For Releases**

1. **Changesets drive versioning** based on squashed commits
2. **Conventional commits** generate changelogs automatically
3. **Bundle size tracking** works per logical change
4. **Rollbacks are simple** with atomic commits

## 🚀 Expected Outcomes

### **Short Term (1-3 months)**

- ✅ Cleaner git history
- ✅ Simplified contributor onboarding
- ✅ Better changelog generation
- ✅ Easier debugging and rollbacks

### **Long Term (6+ months)**

- ✅ Increased community contributions
- ✅ More reliable release process
- ✅ Better project maintainability
- ✅ Enhanced developer experience

---

## 📞 Questions & Feedback

If you have questions about this merge strategy or suggestions for improvement:

- **GitHub Issues**: For bugs or problems with the strategy
- **GitHub Discussions**: For general questions or ideas
- **Contributing Guide**: For implementation details

**Remember**: This strategy optimizes for **library maintainability** and **contributor experience** over preserving detailed commit history. It's the right choice for Pushduck! 🦆
