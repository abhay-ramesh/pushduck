// Commitlint configuration for pushduck
// Enforces conventional commit format as specified in user rules

/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
    extends: ['@commitlint/config-conventional'],

    // Custom rules for pushduck project
    rules: {
        // Enforce proper format: <type>(<scope>): <subject>
        'type-enum': [
            2,
            'always',
            [
                'feat',     // New features
                'fix',      // Bug fixes
                'docs',     // Documentation changes
                'style',    // Code style changes (formatting, etc.)
                'refactor', // Code refactoring
                'test',     // Adding or updating tests
                'chore',    // Maintenance tasks
                'perf',     // Performance improvements
                'ci',       // CI/CD changes
                'build',    // Build system changes
                'revert',   // Reverting changes
            ],
        ],

        // Allow these scopes
        'scope-enum': [
            2,
            'always',
            [
                'core',        // Core functionality
                'client',      // Client-side code
                'server',      // Server-side code
                'cli',         // CLI package
                'adapters',    // Framework adapters
                'types',       // TypeScript types
                'deps',        // Dependencies
                'docs',        // Documentation
                'tests',       // Test files
                'ci',          // CI/CD
                'release',     // Release processes
                'security',    // Security-related
                'providers',   // S3 providers
                'examples',    // Example code
            ],
        ],

        // Subject format requirements
        'subject-case': [2, 'always', 'lower-case'],
        'subject-empty': [2, 'never'],
        'subject-max-length': [2, 'always', 72],
        'subject-min-length': [2, 'always', 10],

        // Body format requirements
        'body-leading-blank': [1, 'always'],
        'body-max-line-length': [1, 'always', 100],

        // Footer format requirements  
        'footer-leading-blank': [1, 'always'],
        'footer-max-line-length': [1, 'always', 100],

        // Header format requirements
        'header-max-length': [2, 'always', 100],
        'type-case': [2, 'always', 'lower-case'],
        'type-empty': [2, 'never'],
    },

    // Custom prompts for better UX
    prompt: {
        questions: {
            type: {
                description: "Select the type of change that you're committing:",
                enum: {
                    feat: {
                        description: '🎉 A new feature',
                        title: 'Features',
                        emoji: '✨',
                    },
                    fix: {
                        description: '🐛 A bug fix',
                        title: 'Bug Fixes',
                        emoji: '🐛',
                    },
                    docs: {
                        description: '📚 Documentation only changes',
                        title: 'Documentation',
                        emoji: '📚',
                    },
                    style: {
                        description: '💎 Changes that do not affect the meaning of the code',
                        title: 'Styles',
                        emoji: '💎',
                    },
                    refactor: {
                        description: '♻️ A code change that neither fixes a bug nor adds a feature',
                        title: 'Code Refactoring',
                        emoji: '♻️',
                    },
                    perf: {
                        description: '⚡️ A code change that improves performance',
                        title: 'Performance Improvements',
                        emoji: '⚡️',
                    },
                    test: {
                        description: '🧪 Adding missing tests or correcting existing tests',
                        title: 'Tests',
                        emoji: '🧪',
                    },
                    build: {
                        description: '🛠 Changes that affect the build system or external dependencies',
                        title: 'Builds',
                        emoji: '🛠',
                    },
                    ci: {
                        description: '⚙️ Changes to our CI configuration files and scripts',
                        title: 'Continuous Integrations',
                        emoji: '⚙️',
                    },
                    chore: {
                        description: '🗃 Other changes that don\'t modify src or test files',
                        title: 'Chores',
                        emoji: '🗃',
                    },
                    revert: {
                        description: '⏪️ Reverts a previous commit',
                        title: 'Reverts',
                        emoji: '⏪️',
                    },
                },
            },
            scope: {
                description: 'What is the scope of this change (e.g. component, file name)',
            },
            subject: {
                description: 'Write a short, imperative tense description of the change',
            },
            body: {
                description: 'Provide a longer description of the change',
            },
            isBreaking: {
                description: 'Are there any breaking changes?',
            },
            breakingBody: {
                description: 'A BREAKING CHANGE commit requires a body. Please enter a longer description of the commit itself',
            },
            breaking: {
                description: 'Describe the breaking changes',
            },
            isIssueAffected: {
                description: 'Does this change affect any open issues?',
            },
            issuesBody: {
                description: 'If issues are closed, the commit requires a body. Please enter a longer description of the commit itself',
            },
            issues: {
                description: 'Add issue references (e.g. "fix #123", "re #123")',
            },
        },
    },
}; 