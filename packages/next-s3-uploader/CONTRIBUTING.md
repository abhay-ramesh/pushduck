# Contributing to Next.js S3 Uploader

First off, thank you for considering contributing to Next.js S3 Uploader! It's people like you that make it such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue list as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* Use a clear and descriptive title
* Describe the exact steps which reproduce the problem
* Provide specific examples to demonstrate the steps
* Describe the behavior you observed after following the steps
* Explain which behavior you expected to see instead and why
* Include screenshots if possible
* Include error messages and stack traces

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* Use a clear and descriptive title
* Provide a step-by-step description of the suggested enhancement
* Provide specific examples to demonstrate the steps
* Describe the current behavior and explain which behavior you expected to see instead
* Explain why this enhancement would be useful
* List some other packages or applications where this enhancement exists

### Pull Requests

* Fork the repo and create your branch from `main`
* If you've added code that should be tested, add tests
* If you've changed APIs, update the documentation
* Ensure the test suite passes
* Make sure your code lints
* Issue that pull request!

## Development Process

1. Fork the repository
2. Create a new branch: `git checkout -b my-branch-name`
3. Make your changes
4. Run the tests: `pnpm test`
5. Build the package: `pnpm build`
6. Commit your changes: `git commit -m 'Add some feature'`
7. Push to the branch: `git push origin my-branch-name`
8. Submit a pull request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/next-s3-uploader.git

# Navigate to the project directory
cd next-s3-uploader

# Install dependencies
pnpm install

# Start development
pnpm dev
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

### Coding Style

* Use TypeScript
* Follow the existing code style
* Use meaningful variable names
* Add comments for complex logic
* Keep functions small and focused
* Use proper TypeScript types

## Project Structure

```
packages/next-s3-uploader/
├── src/
│   ├── hooks/           # React hooks
│   ├── utils/           # Utility functions
│   └── types/           # TypeScript types
├── tests/               # Test files
├── examples/            # Example implementations
└── docs/               # Documentation
```

## Documentation

* Keep README.md updated
* Document all public APIs
* Add JSDoc comments to functions
* Update CHANGELOG.md for notable changes
* Add examples for new features

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/abhay-ramesh/next-s3-uploader/tags).

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Create a new tag
4. Push changes and tag
5. Create a GitHub release
6. Publish to npm

## Questions?

Feel free to open an issue or join our [GitHub Discussions](https://github.com/abhay-ramesh/next-s3-uploader/discussions).

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
