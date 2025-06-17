#!/usr/bin/env node

/**
 * 🛡️ Changeset Quality Validator
 * Ensures changesets are professional and informative
 */

const fs = require('fs');
const path = require('path');

// Colors for output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

const log = {
    error: (msg) => console.log(`${colors.red}❌ ERROR: ${msg}${colors.reset}`),
    warning: (msg) => console.log(`${colors.yellow}⚠️  WARNING: ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`)
};

class ChangesetValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.changesetDir = path.join(process.cwd(), '../../.changeset');
    }

    validateChangeset(filename, content) {
        const lines = content.split('\n');
        const summary = this.extractSummary(content);

        // Check 1: Minimum length
        if (summary.length < 20) {
            this.warnings.push(`${filename}: Summary too short (${summary.length} chars). Add more context.`);
        }

        // Check 2: Generic phrases
        const genericPhrases = ['fix', 'update', 'change', 'improve', 'add'];
        const isGeneric = genericPhrases.some(phrase =>
            summary.toLowerCase().includes(phrase) && summary.length < 50
        );

        if (isGeneric) {
            this.warnings.push(`${filename}: Appears generic. Specify WHAT was changed and WHY.`);
        }

        // Check 3: Breaking changes format
        if (content.includes('major') && !content.toLowerCase().includes('breaking')) {
            this.warnings.push(`${filename}: Major version but no "BREAKING" mentioned. Add breaking change details.`);
        }

        // Check 4: Missing context
        const hasExample = content.includes('```') || content.includes('`');
        const hasReason = content.toLowerCase().includes('because') ||
            content.toLowerCase().includes('to fix') ||
            content.toLowerCase().includes('to improve') ||
            content.toLowerCase().includes('why:');

        if (!hasReason && summary.length > 30) {
            this.warnings.push(`${filename}: Missing WHY. Explain the reason for this change.`);
        }

        // Check 5: Professional tone
        const casualWords = ['fix up', 'make better', 'tweak', 'stuff', 'things', 'some'];
        const hasCasualTone = casualWords.some(word => content.toLowerCase().includes(word));

        if (hasCasualTone) {
            this.warnings.push(`${filename}: Use professional language. Avoid casual terms.`);
        }

        // Check 6: Version type matches content
        const hasBreakingChange = content.toLowerCase().includes('breaking') ||
            content.toLowerCase().includes('remove') ||
            content.toLowerCase().includes('replace');
        const isMajor = content.includes('"major"');

        if (hasBreakingChange && !isMajor) {
            this.warnings.push(`${filename}: Describes breaking changes but not marked as major version.`);
        }

        // Check 7: Code examples for API changes
        const mentionsAPI = content.toLowerCase().includes('api') ||
            content.toLowerCase().includes('function') ||
            content.toLowerCase().includes('method');

        if (mentionsAPI && !hasExample && content.includes('minor')) {
            this.warnings.push(`${filename}: API changes should include usage examples.`);
        }
    }

    extractSummary(content) {
        const lines = content.split('\n');
        let summaryStarted = false;
        let summary = '';

        for (const line of lines) {
            if (line.startsWith('---')) {
                if (summaryStarted) break;
                summaryStarted = true;
                continue;
            }

            if (summaryStarted && line.trim()) {
                summary += line.trim() + ' ';
            }
        }

        return summary.trim();
    }

    async run() {
        log.info('Validating changeset quality...');

        if (!fs.existsSync(this.changesetDir)) {
            log.error('Changeset directory not found. Run from project root.');
            process.exit(1);
        }

        const files = fs.readdirSync(this.changesetDir)
            .filter(file => file.endsWith('.md') && file !== 'README.md');

        if (files.length === 0) {
            log.error('No changesets found. Create one with "pnpm changeset"');
            process.exit(1);
        }

        log.info(`Found ${files.length} changeset(s) to validate`);

        for (const file of files) {
            const content = fs.readFileSync(path.join(this.changesetDir, file), 'utf8');
            this.validateChangeset(file, content);
        }

        // Report results
        console.log('\n' + '='.repeat(50));
        console.log('📋 Changeset Quality Report');
        console.log('='.repeat(50));

        if (this.errors.length > 0) {
            log.error(`Found ${this.errors.length} error(s):`);
            this.errors.forEach(error => console.log(`  • ${error}`));
        }

        if (this.warnings.length > 0) {
            log.warning(`Found ${this.warnings.length} warning(s):`);
            this.warnings.forEach(warning => console.log(`  • ${warning}`));
        }

        if (this.errors.length === 0 && this.warnings.length === 0) {
            log.success('All changesets meet quality standards! 🎉');
        }

        // Provide suggestions
        if (this.warnings.length > 0) {
            console.log('\n💡 Suggestions for better changesets:');
            console.log('  • Be specific: "Fix memory leak in upload progress" vs "Fix bug"');
            console.log('  • Include context: WHY the change was needed');
            console.log('  • Add examples for API changes');
            console.log('  • Explain breaking changes clearly');
            console.log('  • Use professional, clear language');
        }

        console.log('');
        return this.errors.length === 0;
    }
}

// Example good changeset
const exampleGoodChangeset = `---
"next-s3-uploader": minor
"create-next-s3-uploader": minor
---

Add CloudFront CDN integration support

This adds native CloudFront support for faster global file delivery. The upload client now automatically detects CloudFront distributions and optimizes upload routes accordingly.

**New Features:**
- \`cloudFrontDistributionId\` configuration option
- Automatic edge location detection
- 40% faster uploads for global users

**Usage:**
\`\`\`typescript
const config = {
  cloudFrontDistributionId: "E1234567890123",
  // ... other options
};
\`\`\`

**Why:** Many users requested faster international uploads. CloudFront provides significant performance improvements for global applications.
`;

if (require.main === module) {
    const validator = new ChangesetValidator();
    validator.run().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = ChangesetValidator; 