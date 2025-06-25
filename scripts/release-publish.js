#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function validateReleasePreparation() {
    log.info('🔍 Validating release preparation...');

    // Check if current release info exists
    const releaseInfoPath = '.release/.current-release.json';
    if (!fs.existsSync(releaseInfoPath)) {
        log.error('No release preparation found. Please run: pnpm release:prepare');
        process.exit(1);
    }

    const releaseInfo = JSON.parse(fs.readFileSync(releaseInfoPath, 'utf8'));

    // Check if release notes exist
    if (!fs.existsSync(releaseInfo.notesPath)) {
        log.error(`Release notes not found: ${releaseInfo.notesPath}`);
        process.exit(1);
    }

    // Check if release notes have been edited (not just template)
    const notesContent = fs.readFileSync(releaseInfo.notesPath, 'utf8');
    const templateContent = fs.readFileSync('.release/template.md', 'utf8').replace(/{VERSION}/g, releaseInfo.version);

    if (notesContent.trim() === templateContent.trim()) {
        log.warning('Release notes appear to be unchanged from template');
        log.info('Please edit the release notes before publishing');
        process.exit(1);
    }

    // Check if changes are staged
    try {
        const stagedFiles = execCommand('git diff --cached --name-only', true);
        if (!stagedFiles) {
            log.error('No staged changes found. Please run: pnpm release:prepare');
            process.exit(1);
        }
    } catch (error) {
        log.error('Failed to check staged changes');
        process.exit(1);
    }

    // Check if GitHub CLI is available and authenticated
    try {
        execCommand('gh --version', true);
    } catch (error) {
        log.error('GitHub CLI (gh) is not installed. Please install it first:');
        console.log('  brew install gh');
        process.exit(1);
    }

    try {
        execCommand('gh auth status', true);
    } catch (error) {
        log.error('Not authenticated with GitHub CLI. Please run:');
        console.log('  gh auth login');
        process.exit(1);
    }

    log.success('Release preparation validation passed');
    return releaseInfo;
}

function createCommitMessage(version, notesPath) {
    const notesContent = fs.readFileSync(notesPath, 'utf8');

    // Create conventional commit message
    const commitMessage = `feat(release): v${version}\n\n${notesContent}`;

    return commitMessage;
}

function getRepositoryInfo() {
    try {
        const remoteUrl = execCommand('git config --get remote.origin.url', true);
        const match = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
        if (match) {
            return {
                owner: match[1],
                repo: match[2]
            };
        }
    } catch (error) {
        log.warning('Could not determine repository info from git remote');
    }

    // Fallback: try to get from gh CLI
    try {
        const repoInfo = execCommand('gh repo view --json owner,name', true);
        const parsed = JSON.parse(repoInfo);
        return {
            owner: parsed.owner.login,
            repo: parsed.name
        };
    } catch (error) {
        log.error('Could not determine repository information');
        process.exit(1);
    }
}

async function main() {
    try {
        log.title('Pushduck Release Publishing');
        console.log();

        const releaseInfo = validateReleasePreparation();
        const { version, notesPath } = releaseInfo;

        log.info(`Publishing release v${version}...`);
        console.log();

        // Create commit
        log.info('📝 Creating release commit...');
        const commitMessage = createCommitMessage(version, notesPath);

        // Write commit message to temp file for git commit
        const tempCommitFile = '.release/.commit-message.tmp';
        fs.writeFileSync(tempCommitFile, commitMessage);

        try {
            execCommand(`git commit -F "${tempCommitFile}"`);
            fs.unlinkSync(tempCommitFile); // Clean up temp file
            log.success(`Committed: "feat(release): v${version}"`);
        } catch (error) {
            fs.unlinkSync(tempCommitFile); // Clean up temp file
            throw error;
        }

        // Create and push tag
        log.info('🏷️ Creating and pushing tag...');
        execCommand(`git tag "v${version}"`);
        execCommand('git push origin main');
        execCommand(`git push origin "v${version}"`);
        log.success(`Tag v${version} created and pushed`);

        // Create GitHub release
        log.info('🚀 Creating GitHub release...');
        const notesContent = fs.readFileSync(notesPath, 'utf8');

        // Determine if this is a prerelease
        const isPrerelease = version.includes('-');
        const prereleaseFlag = isPrerelease ? '--prerelease' : '';

        // Create GitHub release with your notes (workflow will append auto-generated content)
        execCommand(`gh release create "v${version}" --title "v${version}" --notes "${notesContent}" ${prereleaseFlag}`.trim());
        log.success('GitHub release created');

        // Get repository info for links
        const repoInfo = getRepositoryInfo();

        // Trigger workflow and show monitoring info
        log.info('⚡ Publishing workflow triggered!');
        console.log();

        log.title('🎉 Release v' + version + ' published successfully!');
        console.log();

        log.info('📊 Monitor the release workflow:');
        console.log(`  https://github.com/${repoInfo.owner}/${repoInfo.repo}/actions`);
        console.log();

        log.info('🔗 View the release:');
        console.log(`  https://github.com/${repoInfo.owner}/${repoInfo.repo}/releases/tag/v${version}`);
        console.log();

        log.info('📦 NPM packages will be available shortly:');
        console.log(`  npm install pushduck@${version}`);
        console.log();

        // Clean up
        log.info('🧹 Cleaning up...');
        fs.unlinkSync('.release/.current-release.json');
        log.success('Cleanup completed');

        console.log();
        log.success('🎊 All done! Your release is now live and publishing to NPM!');

    } catch (error) {
        log.error('Release publishing failed');
        log.error(error.message);
        console.log();
        log.info('💡 To abort and clean up, run: pnpm release:abort');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
} 