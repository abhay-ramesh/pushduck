# 🚀 Release Checklist

**Package:** pushduck + create-pushduck  
**Date:** `date +"%Y-%m-%d"`  
**Preparer:** ________________

---

## 🔍 **Pre-Release Validation**

### **Environment Check**

- [ ] On correct branch (main/master)
- [ ] Working directory clean (no uncommitted changes)
- [ ] Internet connection stable
- [ ] NPM registry accessible (`npm ping`)

### **Quality Gates**

- [ ] Health check passes (`pnpm maintenance:health`)
  - [ ] TypeScript compiles without errors
  - [ ] ESLint shows zero errors (warnings OK)
  - [ ] All tests passing
  - [ ] Bundle sizes within limits
  - [ ] No security vulnerabilities

### **Changeset Validation**

- [ ] Changeset exists (`pnpm changeset:status`)
- [ ] Changeset quality validated (`pnpm validate-changesets`)
- [ ] Version type appropriate (patch/minor/major)
- [ ] Description is professional and detailed
- [ ] Breaking changes clearly documented (if major)

---

## 📋 **Release Preparation**

### **Version Verification**

- [ ] Both packages will have matching versions
- [ ] New version doesn't already exist on NPM
- [ ] Semantic versioning rules followed correctly

### **Content Review**

- [ ] CHANGELOG.md will be properly generated
- [ ] All new features documented
- [ ] Breaking changes have migration guides
- [ ] Examples updated if needed

### **Timing Check**

- [ ] Not during peak hours (avoid 2-6 PM UTC)
- [ ] Team available to monitor post-release
- [ ] No major holidays or weekends

---

## 🚀 **Release Execution**

### **Automated Safety Release**

```bash
# One command with all safety checks
pnpm release:safe
```

**OR Manual Step-by-Step:**

### **Step 1: Final Safety Check**

```bash
pnpm pre-release
```

- [ ] All automated checks pass
- [ ] No blocking errors
- [ ] Warnings reviewed and accepted

### **Step 2: Generate Versions**

```bash
pnpm version-packages
```

- [ ] Versions updated correctly
- [ ] CHANGELOG.md generated
- [ ] Changeset files consumed

### **Step 3: Review Generated Files**

```bash
# Review changelog
cat packages/pushduck/CHANGELOG.md

# Verify versions
grep "version" packages/*/package.json
```

- [ ] Changelog entries are accurate
- [ ] Version numbers are correct
- [ ] No unexpected changes

### **Step 4: Publish**

```bash
pnpm release
```

- [ ] Build successful
- [ ] Both packages published
- [ ] NPM shows new versions

---

## ✅ **Post-Release Verification**

### **Immediate Checks (0-5 minutes)**

```bash
# Verify packages are live
npm view pushduck@latest
npm view create-pushduck@latest

# Test installation
npm info pushduck
```

- [ ] Packages visible on NPM
- [ ] Correct versions published
- [ ] No publish errors

### **Short-term Monitoring (5-30 minutes)**

- [ ] Download counts increasing
- [ ] No immediate error reports
- [ ] Documentation updated (if needed)
- [ ] GitHub release created

### **Long-term Monitoring (24 hours)**

- [ ] User feedback positive
- [ ] No critical issues reported
- [ ] Bundle analyzer results stable
- [ ] TypeScript types working correctly

---

## 🚨 **Emergency Procedures**

### **If Something Goes Wrong**

#### **Publish Failed**

```bash
# Check what's published
npm view pushduck versions --json
npm view create-pushduck versions --json

# Re-run if partial failure
pnpm release
```

#### **Wrong Version Published**

```bash
# Unpublish within 72 hours (if needed)
npm unpublish pushduck@X.X.X
npm unpublish create-pushduck@X.X.X

# Create hotfix changeset
pnpm changeset
# Then re-release
pnpm version-packages && pnpm release
```

#### **Critical Bug Discovered**

```bash
# Emergency patch
pnpm changeset  # Create hotfix changeset
pnpm release:safe  # Fast-track release
```

---

## 📊 **Success Criteria**

**Release is successful when:**

- ✅ Both packages published with matching versions
- ✅ No errors during publish process
- ✅ Packages installable via npm/pnpm/yarn
- ✅ TypeScript types available
- ✅ Documentation accurate
- ✅ No critical issues in first 24 hours

**Release Metrics:**

- Time to publish: _____ minutes
- Issues found: _____
- Download count (24h): _____

---

## 📝 **Notes & Lessons Learned**

**What went well:**

**What could be improved:**

**Action items for next release:**

---

**✅ Release Complete!**  
**Released by:** ________________  
**Date:** ________________  
**Final Status:** ✅ Success / ❌ Issues
