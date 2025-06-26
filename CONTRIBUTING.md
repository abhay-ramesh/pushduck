# Contributing to Pushduck

Thank you for your interest in contributing to Pushduck! 🦆 We welcome contributions from the community and are excited to work with you.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Release Process](#release-process)
- [Getting Help](#getting-help)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [maintainers](mailto:abhayramesh@duck.com).

## Getting Started

### Prerequisites

- **Node.js** 18+ and **pnpm** 9+
- **Git** for version control
- **AWS Account** or compatible S3 service for testing
- **TypeScript** knowledge (helpful but not required)

### First Time Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:

   ```bash
   git clone https://github.com/YOUR_USERNAME/pushduck.git
   cd pushduck
   ```

3. **Install dependencies**:

   ```bash
   pnpm install
   ```

4. **Set up environment variables**:

   ```bash
   cp examples/enhanced-demo/env.example examples/enhanced-demo/.env.local
   # Edit the .env.local file with your S3 credentials
   ```

5. **Run the development server**:

   ```bash
   pnpm dev
   ```

## Development Setup

### Repository Structure

```
pushduck/
├── packages/
│   ├── pushduck/           # Main library package
│   ├── cli/                # CLI tool for setup
│   └── ui/                 # UI components (optional)
├── examples/
│   └── enhanced-demo/      # Complete demo application
├── docs/                   # Documentation site
├── scripts/                # Release and maintenance scripts
└── .github/                # GitHub workflows and templates
```

### Available Scripts

```bash
# Development
pnpm dev                    # Start development servers
pnpm build                  # Build all packages
pnpm test                   # Run test suite
pnpm lint                   # Lint code
pnpm type-check            # TypeScript type checking

# Release (maintainers only)
pnpm release:prepare       # Prepare a new release
pnpm release:publish       # Publish the release
pnpm release:status        # Check release status

# Maintenance
pnpm clean                 # Clean build artifacts
pnpm format               # Format code with Prettier
```

## How to Contribute

### 🐛 Reporting Bugs

1. **Check existing issues** to avoid duplicates
2. **Use the bug report template** when creating new issues
3. **Include reproduction steps** and environment details
4. **Add relevant labels** (bug, needs-triage, etc.)

### 💡 Suggesting Features

1. **Check the roadmap** and existing feature requests
2. **Use the feature request template**
3. **Explain the use case** and expected behavior
4. **Consider implementation complexity**

### 🔧 Code Contributions

1. **Pick an issue** (good first issues are labeled)
2. **Comment on the issue** to claim it
3. **Create a branch** from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Make your changes** following our coding standards
5. **Test your changes** thoroughly
6. **Submit a pull request**

## Pull Request Process

### Before Submitting

- [ ] **Tests pass**: `pnpm test`
- [ ] **Linting passes**: `pnpm lint`
- [ ] **Types are correct**: `pnpm type-check`
- [ ] **Build succeeds**: `pnpm build`
- [ ] **Documentation updated** (if needed)

### PR Template

Use our pull request template and include:

- **Clear description** of changes
- **Issue reference** (fixes #123)
- **Testing instructions**
- **Breaking changes** (if any)
- **Screenshots** (for UI changes)

### Review Process

1. **Automated checks** must pass (CI/CD)
2. **Code review** by maintainers
3. **Testing** in demo environment
4. **Approval** and merge

## Coding Standards

### TypeScript

- **Strict mode enabled** - no `any` types
- **Proper type exports** for public APIs
- **JSDoc comments** for public functions
- **Generic constraints** where appropriate

### Code Style

We use **Prettier** and **ESLint** for consistent formatting:

```bash
# Auto-format code
pnpm format

# Check linting
pnpm lint

# Fix auto-fixable issues
pnpm lint --fix
```

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Functions**: `camelCase`
- **Types**: `PascalCase`
- **Constants**: `SCREAMING_SNAKE_CASE`
- **Components**: `PascalCase`

### Commit Messages

We follow **Conventional Commits** specification:

```bash
# Format: <type>(<scope>): <subject>
feat(client): add progress tracking for uploads
fix(server): handle edge case in presigned URL generation
docs(readme): update installation instructions
test(upload): add integration tests for S3 client
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Maintenance tasks

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

### Writing Tests

- **Unit tests** for utilities and core functions
- **Integration tests** for S3 operations
- **E2E tests** for critical user flows
- **Mock external dependencies** (AWS SDK, etc.)

### Test Structure

```typescript
// packages/pushduck/src/__tests__/client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createS3Client } from '../client';

describe('createS3Client', () => {
  it('should create S3 client with correct configuration', () => {
    // Test implementation
  });
});
```

## Documentation

### Types of Documentation

1. **API Documentation** - JSDoc comments in code
2. **User Guides** - In `/docs` directory
3. **Examples** - Working code in `/examples`
4. **README** - Project overview and quick start

### Documentation Standards

- **Clear examples** for all public APIs
- **TypeScript code blocks** with proper syntax highlighting
- **Step-by-step guides** for complex setups
- **Troubleshooting sections** for common issues

### Building Documentation

```bash
# Start documentation development server
pnpm docs

# Build documentation for production
pnpm build:docs
```

## Release Process

> **Note**: Only maintainers can create releases

### Release Methods

1. **Enhanced CLI** (Recommended):

   ```bash
   pnpm release:prepare    # Interactive setup
   pnpm release:publish    # Create GitHub release
   ```

2. **GitHub UI**: Create releases directly on GitHub

3. **Manual Dispatch**: Trigger via GitHub Actions

### Versioning

We follow **Semantic Versioning** (SemVer):

- **Patch** (0.1.1): Bug fixes, documentation updates
- **Minor** (0.2.0): New features, backward compatible
- **Major** (1.0.0): Breaking changes

### Release Checklist

- [ ] All tests passing
- [ ] Documentation updated
- [ ] Examples working
- [ ] CHANGELOG.md updated
- [ ] Version bumped correctly
- [ ] GitHub release created
- [ ] NPM packages published

## Getting Help

### Community Support

- **GitHub Discussions**: Ask questions and share ideas
- **GitHub Issues**: Report bugs and request features
- **Discord**: Join our community chat (coming soon)

### Maintainer Contact

- **Email**: [abhayramesh@duck.com](mailto:abhayramesh@duck.com)
- **GitHub**: [@abhay-ramesh](https://github.com/abhay-ramesh)
- **Twitter**: [@abhayramesh](https://twitter.com/abhayramesh)

### Response Times

- **Critical bugs**: 24-48 hours
- **Feature requests**: 1-2 weeks
- **General questions**: 2-5 days

## Recognition

Contributors are recognized in:

- **README.md** contributors section
- **GitHub releases** changelog
- **Documentation** acknowledgments
- **Social media** shout-outs

## License

By contributing to Pushduck, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

## 🎉 Thank You

Your contributions help make Pushduck better for everyone. Whether you're fixing bugs, adding features, improving documentation, or helping other users, every contribution matters.

**Happy coding!** 🦆✨
