# Security Policy

## Supported Versions

We actively provide security updates for the following versions of pushduck:

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in pushduck, please report it responsibly by following these steps:

### 🔒 Private Disclosure

**DO NOT** create public GitHub issues for security vulnerabilities. Instead, please use one of these secure reporting methods:

1. **GitHub Security Advisories** (Recommended)
   - Go to the [Security tab](https://github.com/abhay/pushduck/security/advisories) of this repository
   - Click "Report a vulnerability"
   - Fill out the advisory form with detailed information

2. **Email**
   - Send an email to: [security@your-domain.com] (replace with your actual security email)
   - Include "SECURITY VULNERABILITY" in the subject line
   - Provide detailed information about the vulnerability

### 📋 What to Include

When reporting a vulnerability, please provide:

- **Description**: Clear description of the vulnerability
- **Impact**: What could an attacker do with this vulnerability?
- **Reproduction Steps**: Step-by-step instructions to reproduce the issue
- **Environment**: Operating system, Node.js version, package version
- **Affected Components**: Which parts of the package are affected
- **Proof of Concept**: Code or screenshots demonstrating the vulnerability (if applicable)
- **Suggested Fix**: If you have ideas for fixing the issue

### 🕒 Response Timeline

We take security seriously and will respond as quickly as possible:

- **Initial Response**: Within 48 hours of report
- **Investigation**: 1-7 days for initial assessment  
- **Fix Development**: 1-14 days depending on complexity
- **Release**: Security fixes are prioritized and released ASAP

### 🏆 Recognition

We appreciate security researchers who help keep our project safe:

- We will acknowledge your contribution in the security advisory (unless you prefer to remain anonymous)
- For significant vulnerabilities, we may offer public recognition on our website/docs
- We believe in responsible disclosure and will coordinate with you on timing

## Security Best Practices

When using pushduck in your applications:

### 🔐 Server-Side Configuration

- **Never expose AWS credentials** in client-side code
- **Validate all uploads** on the server side
- **Use IAM policies** with minimal required permissions
- **Set appropriate CORS policies** for your S3 bucket
- **Implement rate limiting** for upload endpoints
- **Validate file types and sizes** before generating presigned URLs

### 🛡️ Client-Side Security

- **Validate file types** before attempting upload
- **Implement file size limits** on the client
- **Use HTTPS** for all upload operations
- **Handle errors gracefully** without exposing sensitive information

### 🔍 Regular Audits

- Keep the package updated to the latest version
- Regularly audit your dependencies with `npm audit`
- Monitor for security advisories related to this package
- Review your S3 bucket policies and permissions regularly

## Scope

This security policy covers:

- ✅ The core `pushduck` package
- ✅ The `create-pushduck` CLI tool
- ✅ Documentation and examples that could lead to insecure implementations
- ✅ Dependencies that could affect security

This policy does not cover:

- ❌ Issues in your AWS configuration or credentials management
- ❌ General S3 security best practices (covered by AWS documentation)
- ❌ Third-party packages used alongside pushduck
- ❌ Issues related to your specific implementation

## Contact

For security-related questions or concerns:

- **Security Issues**: Use the private reporting methods above
- **General Questions**: Create a public GitHub issue or discussion
- **Documentation**: Suggest improvements via pull request

---

*This security policy is inspired by industry best practices and is regularly updated to reflect current threats and mitigation strategies.*
