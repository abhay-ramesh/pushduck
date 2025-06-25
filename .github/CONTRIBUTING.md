# Contributing to Pushduck

Thank you for considering contributing to Pushduck! This guide will help you understand our development workflow and contribution standards.

## 🚀 Quick Start

```bash
# 1. Fork and clone
git clone https://github.com/your-username/pushduck.git
cd pushduck

# 2. Install dependencies  
pnpm install

# 3. Create feature branch
git checkout -b feat/your-feature-name

# 4. Make changes and test
pnpm test
pnpm build
pnpm lint

# 5. Commit with conventional format
git commit -m "feat(core): add your feature description"

# 6. Push and create PR
git push origin feat/your-feature-name
```

## 📋 Development Workflow

### Branch Naming Convention

```bash
feat/feature-name      # New features
fix/issue-description  # Bug fixes  
docs/update-topic     # Documentation
chore/maintenance     # Maintenance tasks
refactor/component    # Code refactoring
```

### Commit Message Format

We use [Conventional Commits](https://conventionalcommits.org/):

```bash
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Scopes:**

- `core`: Core functionality
- `client`: Client-side code
- `server`: Server-side code
- `cli`: CLI tool
- `docs`: Documentation
- `examples`: Examples
- `deps`: Dependencies

**Examples:**

```bash
feat(core): add retry mechanism for failed uploads
fix(client): resolve memory leak in upload progress
docs(api): update configuration options
chore(deps): update development dependencies
```

## 🔄 Merge Strategy

We use **Squash and Merge** for all pull requests:

### Why Squash and Merge?

- ✅ **Clean history**: Each PR becomes one atomic commit
- ✅ **Easy reverts**: Simple to rollback problematic changes
- ✅ **Better changelogs**: Clean commits generate better release notes
- ✅ **Simplified debugging**: `git bisect` works more effectively

### What This Means for Contributors

1. **Don't worry about commit history in your PR** - it gets squashed anyway
2. **Focus on clear PR titles** - they become the commit message
3. **Write good PR descriptions** - they help reviewers and become part of history

### PR Title Format

Your PR title becomes the squashed commit message, so use conventional commit format:

```bash
✅ Good PR titles:
feat(core): add file type validation
fix(client): resolve upload progress memory leak
docs(api): add configuration examples

❌ Bad PR titles:  
Add validation
Fix bug
Update docs
```

## 🧪 Testing Requirements

### Before Submitting a PR

```bash
# Run full test suite
pnpm test

# Check code formatting
pnpm lint

# Verify build works
pnpm build

# Run type checking
pnpm type-check

# Test in example app
cd examples/enhanced-demo
pnpm dev
```

### Test Coverage

- Maintain **>90% code coverage**
- Add tests for new features
- Update tests for bug fixes
- Include integration tests for API changes

## 📝 Documentation Standards

### Code Documentation

```typescript
/**
 * Uploads a file to S3 with progress tracking
 * @param file - The file to upload
 * @param options - Upload configuration options
 * @returns Promise resolving to upload result
 * @example
 * ```typescript
 * const result = await uploadFile(file, {
 *   onProgress: (progress) => console.log(progress)
 * });
 * ```
 */
export async function uploadFile(
  file: File,
  options: UploadOptions
): Promise<UploadResult> {
  // Implementation
}
```

### Changeset Requirements

For significant changes, add a changeset:

```bash
pnpm changeset
```

Choose the appropriate change type:

- **patch**: Bug fixes, minor improvements
- **minor**: New features, non-breaking changes  
- **major**: Breaking changes

## 🔍 Code Review Process

### What We Look For

1. **Functionality**: Does it work as intended?
2. **Testing**: Are there adequate tests?
3. **Performance**: Any performance implications?
4. **Security**: Any security concerns?
5. **Documentation**: Is it properly documented?
6. **Style**: Does it follow our conventions?

### Review Timeline

- **Initial response**: Within 2 business days
- **Full review**: Within 1 week for most PRs
- **Urgent fixes**: Same day for critical issues

## 🚨 Security

### Reporting Security Issues

**Do not open public issues for security vulnerabilities.**

Email security concerns to: [security@pushduck.dev](mailto:security@pushduck.dev)

### Security Checklist

- [ ] No hardcoded secrets or credentials
- [ ] Input validation for all user data
- [ ] Proper error handling (no information leakage)
- [ ] Dependencies are up to date
- [ ] No eval() or similar dangerous functions

## 📦 Release Process

### How Releases Work

1. **Contributors** add changesets to PRs
2. **Changesets bot** creates version PR automatically  
3. **Maintainers** review and merge version PR
4. **GitHub Actions** publishes to npm automatically

### Release Schedule

- **Patch releases**: As needed (usually weekly)
- **Minor releases**: Monthly or when significant features accumulate
- **Major releases**: Quarterly or for breaking changes

## 💡 Tips for Contributors

### Getting Started

1. **Start small**: Look for `good first issue` labels
2. **Ask questions**: Use GitHub Discussions for clarification
3. **Read existing code**: Understand patterns before adding new ones
4. **Test thoroughly**: Include edge cases in your testing

### Making Great PRs

1. **Single responsibility**: One feature/fix per PR
2. **Clear descriptions**: Explain what, why, and how
3. **Include examples**: Show usage of new features
4. **Update docs**: Keep documentation in sync
5. **Test edge cases**: Think about error scenarios

### Common Pitfalls to Avoid

- ❌ Large PRs that change many things
- ❌ Missing tests for new functionality  
- ❌ Breaking changes without major version bump
- ❌ Inconsistent code style
- ❌ Missing or unclear commit messages

## 🛠 Development Environment

### Recommended Setup

```bash
# Node.js version (use exact version)
node --version  # Should match .nvmrc

# Package manager
npm install -g pnpm

# IDE extensions (VS Code)
- ESLint
- Prettier
- TypeScript
- GitLens
```

### Useful Commands

```bash
# Development
pnpm dev              # Start development mode
pnpm build           # Build all packages
pnpm test            # Run all tests
pnpm test:watch      # Run tests in watch mode
pnpm lint            # Lint code
pnpm lint:fix        # Fix linting issues

# Package-specific
pnpm --filter pushduck test    # Test specific package
pnpm --filter cli build       # Build specific package

# Release management  
pnpm changeset              # Add changeset
pnpm changeset version      # Version packages
pnpm release               # Publish (maintainers only)
```

## 📞 Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Discord**: Real-time community chat (coming soon)

### Response Times

- **Critical bugs**: Same day
- **General issues**: 2-3 business days
- **Feature requests**: Weekly review
- **Questions**: 1-2 business days

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## 🙏 Recognition

All contributors are recognized in our:

- GitHub contributors page
- Release notes for significant contributions  
- Annual contributor appreciation posts

Thank you for making Pushduck better! 🦆
