# 📦 Release & Maintenance Guide

## 🚀 **Quick Release Commands**

```bash
# Patch release (bug fixes: 0.2.1 → 0.2.2)
cd packages/pushduck
pnpm release:patch

# Minor release (new features: 0.2.1 → 0.3.0)
pnpm release:minor

# Major release (breaking changes: 0.2.1 → 1.0.0)
pnpm release:major
```

## 📋 **Pre-Release Checklist**

### 1. **Quality Assurance**

```bash
# Run full CI pipeline locally
pnpm ci

# Check bundle sizes
pnpm build:analyze
pnpm size-check

# Test in demo app
cd ../../apps/new-api-demo
pnpm build
```

### 2. **Documentation Updates**

- [ ] Update `CHANGELOG.md` with new features/fixes
- [ ] Update `README.md` if API changed
- [ ] Check that all examples still work
- [ ] Update version in `package.json` (done automatically by release scripts)

### 3. **Breaking Changes**

If making breaking changes:

- [ ] Update migration guide
- [ ] Bump major version
- [ ] Add deprecation warnings in previous version
- [ ] Update peer dependency requirements

## 🔄 **Release Process**

### **Method 1: Automated Release (Recommended)**

```bash
# 1. Ensure you're on main branch
git checkout main
git pull origin main

# 2. Run quality checks
cd packages/pushduck
pnpm ci

# 3. Choose release type and run
pnpm release:patch   # or minor/major

# 4. Create GitHub Release
# Go to: https://github.com/abhay-ramesh/pushduck/releases/new
# Tag: v0.2.2 (use the new version)
# Title: "Release v0.2.2"
# Auto-generate notes or write changelog
```

**What happens automatically:**

1. ✅ Version bump in `package.json`
2. ✅ Git tag created
3. ✅ Package built and published to NPM
4. ✅ GitHub Release triggers CI/CD pipeline

### **Method 2: Manual Release**

```bash
# 1. Version bump
npm version patch  # or minor/major

# 2. Build package
pnpm build

# 3. Publish to NPM
npm publish

# 4. Push tags
git push --follow-tags
```

## 🛡️ **Pre-Publish Validation**

Our `prepublishOnly` script runs automatically:

```bash
# Runs before every publish
pnpm ci              # Lint + TypeCheck + Test + Build
pnpm size-check      # Enforce bundle size limits
```

**What gets validated:**

- ✅ All tests pass
- ✅ TypeScript compilation
- ✅ ESLint rules
- ✅ Bundle size limits
- ✅ Build artifacts exist

## 📊 **Bundle Size Monitoring**

### **Local Monitoring**

```bash
# Full analysis
pnpm build:analyze

# Quick size check
pnpm size-check

# Visualize bundle
pnpm bundle:visualize
```

### **CI Monitoring**

- Bundle size checked on every commit
- Automated PR comments with size reports
- Fails CI if limits exceeded

**Current Limits:**

- Client bundle: **5KB gzipped**
- Server bundle: **10KB gzipped**  
- Main bundle: **7KB gzipped**

## 🏷️ **Version Strategy**

Following [Semantic Versioning](https://semver.org/):

### **Patch (0.2.1 → 0.2.2)**

- Bug fixes
- Performance improvements
- Documentation updates
- Internal refactoring

```bash
pnpm release:patch
```

### **Minor (0.2.1 → 0.3.0)**

- New features
- New provider support
- New configuration options
- Deprecations (non-breaking)

```bash
pnpm release:minor
```

### **Major (0.2.1 → 1.0.0)**

- Breaking API changes
- Removed deprecated features
- Major architecture changes
- Peer dependency updates

```bash
pnpm release:major
```

## 🔧 **Maintenance Tasks**

### **Weekly**

- [ ] Check for dependency updates
- [ ] Review open issues
- [ ] Monitor bundle size trends
- [ ] Check GitHub security alerts

```bash
# Update dependencies
pnpm update
pnpm audit

# Check for outdated packages
pnpm outdated
```

### **Monthly**

- [ ] Review and update documentation
- [ ] Check demo app performance
- [ ] Review and optimize bundle sizes
- [ ] Update provider SDK versions

### **Quarterly**

- [ ] Major dependency updates
- [ ] Review and optimize CI/CD pipeline
- [ ] Performance benchmarking
- [ ] Security audit

## 🚨 **Emergency Releases**

For critical bugs or security issues:

### **Hotfix Process**

```bash
# 1. Create hotfix branch
git checkout -b hotfix/critical-bug
git push -u origin hotfix/critical-bug

# 2. Fix the issue
# ... make changes ...

# 3. Test thoroughly
pnpm ci

# 4. Merge to main
git checkout main
git merge hotfix/critical-bug

# 5. Emergency release
pnpm release:patch

# 6. Notify users
# - GitHub Release with security notice
# - Update documentation
# - Consider Discord/Twitter announcement
```

## 📈 **Release Analytics**

Monitor package health:

### **NPM Analytics**

- Download stats: <https://npm-stat.com/charts.html?package=pushduck>
- Bundle size: <https://bundlephobia.com/package/pushduck>

### **GitHub Analytics**

- Release adoption rates
- Issue resolution time
- Star growth
- Fork activity

### **Bundle Analytics**

```bash
# Track size over time
pnpm build:analyze > bundle-report-$(date +%Y%m%d).txt
```

## 🔐 **Security Considerations**

### **NPM Token Security**

- Use automation tokens (not personal)
- Rotate tokens quarterly
- Use 2FA on NPM account
- Limit token scope to specific packages

### **Dependency Security**

```bash
# Regular security audits
pnpm audit
npm audit fix

# Check for known vulnerabilities
npx audit-ci --moderate
```

### **Release Security**

- Always use `prepublishOnly` hooks
- Never publish manually without tests
- Review all changes before release
- Use signed commits for releases

## 📞 **Support & Communication**

### **Release Announcements**

1. **GitHub Release** - Automatic changelog
2. **NPM Description** - Keep updated
3. **Documentation** - Update examples
4. **Demo App** - Ensure compatibility

### **User Support**

- Monitor GitHub issues
- Respond to questions within 48 hours
- Maintain comprehensive documentation
- Provide migration guides for breaking changes

## 🎯 **Quality Metrics**

Track these KPIs:

- **Bundle size trend** (should stay stable/decrease)
- **Download count** (growth indicator)
- **Issue resolution time** (aim for <3 days)
- **Test coverage** (maintain >80%)
- **TypeScript strict mode** (100% compliance)

---

## 🚀 **Quick Reference**

```bash
# Development
pnpm dev              # Watch mode
pnpm build            # Production build
pnpm test             # Run tests
pnpm ci               # Full quality check

# Analysis
pnpm build:analyze    # Bundle analysis
pnpm size-check       # Size limits
pnpm bundle:visualize # Interactive visualization

# Release
pnpm release:patch    # Bug fixes
pnpm release:minor    # New features  
pnpm release:major    # Breaking changes
```

**Remember**: Quality over speed. Better to take time and release solid versions than rush and break user code! 🛡️
