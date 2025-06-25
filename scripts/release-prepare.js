#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Colors for output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

const log = {
    info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
    title: (msg) => console.log(`${colors.bold}${colors.cyan}🦆 ${msg}${colors.reset}`)
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

function execCommand(command, silent = false) {
    try {
        const result = execSync(command, { encoding: 'utf8' });
        return result.trim();
    } catch (error) {
        if (!silent) {
            log.error(`Command failed: ${command}`);
            log.error(error.message);
        }
        throw error;
    }
}

function getCurrentVersion() {
    const packagePath = path.join(process.cwd(), 'packages/pushduck/package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return packageJson.version;
}

function incrementVersion(version, type) {
    const parts = version.split('.');
    let [major, minor, patch] = parts.map(Number);

    switch (type) {
        case 'patch':
            patch++;
            break;
        case 'minor':
            minor++;
            patch = 0;
            break;
        case 'major':
            major++;
            minor = 0;
            patch = 0;
            break;
        default:
            return version;
    }

    return `${major}.${minor}.${patch}`;
}

function updatePackageVersion(packagePath, newVersion) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    packageJson.version = newVersion;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
}

function createReleaseNotes(version) {
    const templatePath = path.join(process.cwd(), '.release/template.md');
    const notesPath = path.join(process.cwd(), `.release/v${version}-notes.md`);

    if (!fs.existsSync(templatePath)) {
        log.error('Release template not found at .release/template.md');
        process.exit(1);
    }

    let template = fs.readFileSync(templatePath, 'utf8');
    template = template.replace(/{VERSION}/g, version);

    // Get repository info for links
    try {
        const remoteUrl = execCommand('git config --get remote.origin.url', true);
        const match = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
        if (match) {
            template = template.replace(/{REPO_OWNER}/g, match[1]);
            template = template.replace(/{REPO_NAME}/g, match[2]);
        }
    } catch (error) {
        // Keep placeholders if we can't determine repo info
        log.warning('Could not determine repository info for template links');
    }

    fs.writeFileSync(notesPath, template);
    return notesPath;
}

function openInEditor(filePath) {
    const editors = [
        process.env.EDITOR,
        'code',  // VS Code
        'subl',  // Sublime Text
        'atom',  // Atom
        'vim',   // Vim
        'nano'   // Nano
    ].filter(Boolean);

    for (const editor of editors) {
        try {
            if (editor === 'code') {
                execCommand(`${editor} "${filePath}" --wait`, true);
            } else {
                execCommand(`${editor} "${filePath}"`, true);
            }
            return true;
        } catch (error) {
            continue;
        }
    }

    log.warning('Could not open editor automatically');
    log.info(`Please edit: ${filePath}`);
    return false;
}

async function validateEnvironment() {
    log.info('Validating environment...');

    // Check if we're in a git repository
    try {
        execCommand('git rev-parse --git-dir', true);
    } catch (error) {
        log.error('Not in a git repository');
        process.exit(1);
    }

    // Check if working directory is clean
    try {
        const status = execCommand('git status --porcelain', true);
        if (status) {
            log.error('Working directory is not clean. Please commit or stash changes first.');
            console.log('\nUncommitted changes:');
            console.log(status);
            process.exit(1);
        }
    } catch (error) {
        log.error('Failed to check git status');
        process.exit(1);
    }

    // Check if on main branch
    try {
        const branch = execCommand('git branch --show-current', true);
        if (branch !== 'main' && branch !== 'master') {
            log.warning(`You are on branch '${branch}', not 'main'`);
            const confirm = await question('Continue anyway? (y/N): ');
            if (confirm.toLowerCase() !== 'y') {
                process.exit(1);
            }
        }
    } catch (error) {
        log.warning('Could not determine current branch');
    }

    // Check if up to date with origin
    try {
        execCommand('git fetch', true);
        const behind = execCommand('git rev-list --count HEAD..@{u}', true);
        if (parseInt(behind) > 0) {
            log.error('Local branch is behind remote. Please pull latest changes.');
            process.exit(1);
        }
    } catch (error) {
        log.warning('Could not check if up to date with remote');
    }

    log.success('Environment validation passed');
}

async function main() {
    try {
        log.title('Pushduck Release Preparation');
        console.log();

        await validateEnvironment();

        const currentVersion = getCurrentVersion();
        log.info(`Current version: ${currentVersion}`);
        console.log();

        // Show release type options
        console.log('Select release type:');
        console.log(`1) patch (${currentVersion} → ${incrementVersion(currentVersion, 'patch')}) - Bug fixes`);
        console.log(`2) minor (${currentVersion} → ${incrementVersion(currentVersion, 'minor')}) - New features`);
        console.log(`3) major (${currentVersion} → ${incrementVersion(currentVersion, 'major')}) - Breaking changes`);
        console.log('4) prerelease - Custom prerelease version');
        console.log('5) custom - Enter specific version');
        console.log();

        const choice = await question('Choice (1-5): ');
        let newVersion;
        let releaseType;

        switch (choice) {
            case '1':
                newVersion = incrementVersion(currentVersion, 'patch');
                releaseType = 'patch';
                break;
            case '2':
                newVersion = incrementVersion(currentVersion, 'minor');
                releaseType = 'minor';
                break;
            case '3':
                newVersion = incrementVersion(currentVersion, 'major');
                releaseType = 'major';
                break;
            case '4':
                console.log();
                console.log('Prerelease options:');
                console.log(`1) alpha (${currentVersion} → ${incrementVersion(currentVersion, 'minor')}-alpha.1)`);
                console.log(`2) beta (${currentVersion} → ${incrementVersion(currentVersion, 'minor')}-beta.1)`);
                console.log(`3) rc (${currentVersion} → ${incrementVersion(currentVersion, 'minor')}-rc.1)`);
                console.log('4) custom');
                console.log();

                const prereleaseChoice = await question('Prerelease type (1-4): ');
                const baseVersion = incrementVersion(currentVersion, 'minor');

                switch (prereleaseChoice) {
                    case '1':
                        newVersion = `${baseVersion}-alpha.1`;
                        break;
                    case '2':
                        newVersion = `${baseVersion}-beta.1`;
                        break;
                    case '3':
                        newVersion = `${baseVersion}-rc.1`;
                        break;
                    case '4':
                        newVersion = await question('Enter prerelease version: ');
                        break;
                    default:
                        log.error('Invalid choice');
                        process.exit(1);
                }
                releaseType = 'prerelease';
                break;
            case '5':
                newVersion = await question('Enter custom version: ');
                releaseType = 'custom';
                break;
            default:
                log.error('Invalid choice');
                process.exit(1);
        }

        // Validate version format
        const versionRegex = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$/;
        if (!versionRegex.test(newVersion)) {
            log.error(`Invalid version format: ${newVersion}`);
            log.error('Expected format: x.y.z or x.y.z-prerelease');
            process.exit(1);
        }

        console.log();
        log.info(`New version will be: ${newVersion}`);

        // Check if tag already exists
        try {
            execCommand(`git rev-parse v${newVersion}`, true);
            log.error(`Tag v${newVersion} already exists`);
            process.exit(1);
        } catch (error) {
            // Tag doesn't exist, which is good
        }

        console.log();
        log.info('📊 Version Changes:');
        console.log(`├── packages/pushduck: ${currentVersion} → ${newVersion}`);
        console.log(`├── packages/cli: ${currentVersion} → ${newVersion}`);
        console.log(`└── root package.json: ${currentVersion} → ${newVersion}`);
        console.log();

        const confirm = await question(`Proceed with version ${newVersion}? (Y/n): `);
        if (confirm.toLowerCase() === 'n') {
            log.warning('Release preparation cancelled');
            process.exit(0);
        }

        // Update package versions
        log.info('🔄 Updating package versions...');

        const packagesToUpdate = [
            'packages/pushduck/package.json',
            'packages/cli/package.json',
            'package.json'
        ];

        for (const packagePath of packagesToUpdate) {
            const fullPath = path.join(process.cwd(), packagePath);
            if (fs.existsSync(fullPath)) {
                updatePackageVersion(fullPath, newVersion);
                log.success(`Updated ${packagePath}`);
            }
        }

        // Create release notes
        log.info('📝 Creating release notes template...');
        const notesPath = createReleaseNotes(newVersion);
        log.success(`Created: ${path.relative(process.cwd(), notesPath)}`);

        // Stage changes
        log.info('🎨 Staging changes...');
        execCommand('git add packages/pushduck/package.json packages/cli/package.json package.json .release/');
        log.success('Changes staged');

        // Open editor
        console.log();
        log.info('🎨 Opening release notes in your editor...');
        const editorOpened = openInEditor(notesPath);

        console.log();
        log.title('📋 Next Steps:');
        console.log('1. ✍️  Edit release notes in your editor');
        console.log(`2. 🔍 Review staged changes: ${colors.cyan}git diff --staged${colors.reset}`);
        console.log(`3. 🚀 When ready to publish: ${colors.cyan}pnpm release:publish${colors.reset}`);
        console.log(`4. 🚫 To abort this release: ${colors.cyan}pnpm release:abort${colors.reset}`);
        console.log();
        log.success(`Release v${newVersion} prepared successfully!`);

        // Save release info for publish script
        const releaseInfo = {
            version: newVersion,
            type: releaseType,
            notesPath: path.relative(process.cwd(), notesPath),
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync('.release/.current-release.json', JSON.stringify(releaseInfo, null, 2));

    } catch (error) {
        log.error('Release preparation failed');
        log.error(error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    main();
} 