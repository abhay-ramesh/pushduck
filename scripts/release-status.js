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
        return null;
    }
}

function getCurrentVersion() {
    const packagePath = path.join(process.cwd(), 'packages/pushduck/package.json');
    try {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return packageJson.version;
    } catch (error) {
        return 'unknown';
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
        return null;
    }
}

function getStagedFiles() {
    const staged = execCommand('git diff --cached --name-only', true);
    return staged ? staged.split('\n').filter(Boolean) : [];
}

function getUncommittedFiles() {
    const uncommitted = execCommand('git status --porcelain', true);
    return uncommitted ? uncommitted.split('\n').filter(Boolean) : [];
}

function getLatestTag() {
    return execCommand('git describe --tags --abbrev=0', true) || 'none';
}

function getBranchInfo() {
    const branch = execCommand('git branch --show-current', true) || 'unknown';
    const behind = execCommand('git rev-list --count HEAD..@{u}', true);
    const ahead = execCommand('git rev-list --count @{u}..HEAD', true);

    return {
        name: branch,
        behind: behind ? parseInt(behind) : 0,
        ahead: ahead ? parseInt(ahead) : 0
    };
}

function main() {
    log.title('Pushduck Release Status');
    console.log();

    // Current version
    const currentVersion = getCurrentVersion();
    log.info(`Current version: ${currentVersion}`);

    // Git status
    const branchInfo = getBranchInfo();
    console.log(`📍 Branch: ${branchInfo.name}`);
    if (branchInfo.behind > 0) {
        log.warning(`Behind remote by ${branchInfo.behind} commits`);
    }
    if (branchInfo.ahead > 0) {
        log.info(`Ahead of remote by ${branchInfo.ahead} commits`);
    }

    // Latest tag
    const latestTag = getLatestTag();
    console.log(`🏷️  Latest tag: ${latestTag}`);

    // Release preparation status
    const releaseInfo = checkReleaseInProgress();
    if (releaseInfo) {
        console.log();
        log.warning('🚧 Release preparation in progress!');
        console.log(`   Version: ${releaseInfo.version}`);
        console.log(`   Type: ${releaseInfo.type}`);
        console.log(`   Started: ${new Date(releaseInfo.timestamp).toLocaleString()}`);
        console.log(`   Notes: ${releaseInfo.notesPath}`);

        // Check if notes file exists
        if (fs.existsSync(releaseInfo.notesPath)) {
            log.success('✅ Release notes file exists');
        } else {
            log.error('❌ Release notes file missing');
        }
    } else {
        console.log();
        log.success('✅ No release preparation in progress');
    }

    // Staged changes
    const stagedFiles = getStagedFiles();
    if (stagedFiles.length > 0) {
        console.log();
        log.warning('📝 Staged changes:');
        stagedFiles.forEach(file => console.log(`   ${file}`));
    }

    // Uncommitted changes
    const uncommittedFiles = getUncommittedFiles();
    if (uncommittedFiles.length > 0) {
        console.log();
        log.warning('🔄 Uncommitted changes:');
        uncommittedFiles.slice(0, 10).forEach(file => console.log(`   ${file}`));
        if (uncommittedFiles.length > 10) {
            console.log(`   ... and ${uncommittedFiles.length - 10} more`);
        }
    }

    // Available commands
    console.log();
    log.title('📋 Release Methods');

    console.log(`${colors.bold}${colors.green}1. Enhanced CLI${colors.reset} ${colors.cyan}(Recommended)${colors.reset}`);
    if (releaseInfo) {
        console.log(`   ${colors.cyan}pnpm release:publish${colors.reset} - Complete the prepared release`);
        console.log(`   ${colors.cyan}pnpm release:abort${colors.reset}   - Cancel and clean up`);
        console.log(`   ${colors.cyan}code ${releaseInfo.notesPath}${colors.reset} - Edit release notes`);
    } else {
        console.log(`   ${colors.cyan}pnpm release:prepare${colors.reset} - Start a new release`);
        console.log(`   ${colors.cyan}pnpm release${colors.reset}         - Full release (prepare + publish)`);
    }

    console.log(`${colors.bold}${colors.blue}2. GitHub UI${colors.reset}`);
    console.log(`   ${colors.cyan}pnpm release:ui${colors.reset}      - GitHub releases interface`);

    console.log(`${colors.bold}${colors.magenta}3. Manual Dispatch${colors.reset}`);
    console.log(`   ${colors.cyan}pnpm release:manual${colors.reset}  - GitHub Actions workflow`);

    console.log();
    console.log(`${colors.cyan}pnpm release:methods${colors.reset} - Show all release methods`);
    console.log(`${colors.cyan}pnpm release:status${colors.reset}  - Show this status`);

    console.log();

    // Quick health check
    if (branchInfo.name !== 'main' && branchInfo.name !== 'master') {
        log.warning(`⚠️  Not on main branch (currently on ${branchInfo.name})`);
    }

    if (uncommittedFiles.length > 0) {
        log.warning('⚠️  Working directory has uncommitted changes');
    }

    if (branchInfo.behind > 0) {
        log.warning('⚠️  Local branch is behind remote');
    }

    if (branchInfo.name === 'main' && uncommittedFiles.length === 0 && branchInfo.behind === 0) {
        log.success('✅ Ready for release!');
    }
}

if (require.main === module) {
    main();
} 