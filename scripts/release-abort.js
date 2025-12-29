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
    title: (msg) => console.log(`${colors.bold}${colors.cyan}${msg}${colors.reset}`)
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

function checkReleaseInProgress() {
    const releaseInfoPath = '.release/.current-release.json';
    if (!fs.existsSync(releaseInfoPath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(releaseInfoPath, 'utf8'));
    } catch (error) {
        log.warning('Could not read release info file');
        return null;
    }
}

function getStagedFiles() {
    try {
        const stagedFiles = execCommand('git diff --cached --name-only', true);
        return stagedFiles ? stagedFiles.split('\n') : [];
    } catch (error) {
        return [];
    }
}

async function main() {
    try {
        log.title('Pushduck Release Abort');
        console.log();

        const releaseInfo = checkReleaseInProgress();

        if (!releaseInfo) {
            log.info('No release preparation found to abort');
            process.exit(0);
        }

        log.info(`Found release preparation for v${releaseInfo.version}`);
        console.log();

        // Show what will be cleaned up
        log.info('The following will be cleaned up:');

        const stagedFiles = getStagedFiles();
        if (stagedFiles.length > 0) {
            console.log('Staged changes:');
            stagedFiles.forEach(file => console.log(`  - ${file}`));
        }

        if (fs.existsSync(releaseInfo.notesPath)) {
            console.log(`Release notes: ${releaseInfo.notesPath}`);
        }

        console.log('Release metadata: .release/.current-release.json');
        console.log();

        const confirm = await question(`${colors.yellow}Are you sure you want to abort this release? (y/N): ${colors.reset}`);

        if (confirm.toLowerCase() !== 'y') {
            log.info('Release abort cancelled');
            process.exit(0);
        }

        console.log();
        log.info('🧹 Aborting release and cleaning up...');

        // Unstage all changes
        if (stagedFiles.length > 0) {
            log.info('📝 Unstaging changes...');
            try {
                execCommand('git reset HEAD .');
                log.success('Changes unstaged');
            } catch (error) {
                log.warning('Could not unstage changes - they may need manual cleanup');
            }
        }

        // Restore package.json files to their original state
        log.info('🔄 Restoring package.json files...');
        const packagesToRestore = [
            'packages/pushduck/package.json',
            'packages/cli/package.json',
            'package.json'
        ];

        for (const packagePath of packagesToRestore) {
            if (fs.existsSync(packagePath)) {
                try {
                    execCommand(`git checkout HEAD -- "${packagePath}"`, true);
                    log.success(`Restored ${packagePath}`);
                } catch (error) {
                    log.warning(`Could not restore ${packagePath} - may need manual restoration`);
                }
            }
        }

        // Remove release notes file
        if (fs.existsSync(releaseInfo.notesPath)) {
            log.info('📄 Removing release notes...');
            try {
                fs.unlinkSync(releaseInfo.notesPath);
                log.success(`Removed ${releaseInfo.notesPath}`);
            } catch (error) {
                log.warning(`Could not remove ${releaseInfo.notesPath}`);
            }
        }

        // Remove release metadata
        log.info('🗑️ Removing release metadata...');
        try {
            fs.unlinkSync('.release/.current-release.json');
            log.success('Release metadata removed');
        } catch (error) {
            log.warning('Could not remove release metadata');
        }

        // Clean up any temporary files
        const tempFiles = [
            '.release/.commit-message.tmp',
            '.release/.temp-notes.md'
        ];

        for (const tempFile of tempFiles) {
            if (fs.existsSync(tempFile)) {
                try {
                    fs.unlinkSync(tempFile);
                    log.success(`Removed ${tempFile}`);
                } catch (error) {
                    log.warning(`Could not remove ${tempFile}`);
                }
            }
        }

        // Verify clean state
        log.info('🔍 Verifying clean state...');
        try {
            const status = execCommand('git status --porcelain', true);
            if (!status) {
                log.success('Working directory is clean');
            } else {
                log.warning('Working directory may still have uncommitted changes:');
                console.log(status);
            }
        } catch (error) {
            log.warning('Could not verify git status');
        }

        console.log();
        log.success(`🎊 Release v${releaseInfo.version} aborted successfully!`);
        console.log();
        log.info('Your workspace has been restored to its previous state.');
        log.info('You can now start a new release with: pnpm release:prepare');

    } catch (error) {
        log.error('Release abort failed');
        log.error(error.message);
        console.log();
        log.info('💡 You may need to manually clean up:');
        console.log('  - git reset HEAD .');
        console.log('  - git checkout HEAD -- packages/*/package.json package.json');
        console.log('  - rm .release/.current-release.json');
        console.log('  - rm .release/v*-notes.md');
        process.exit(1);
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    main();
} 