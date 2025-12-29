#!/usr/bin/env node

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
    title: (msg) => console.log(`${colors.bold}${colors.cyan}${msg}${colors.reset}`),
    method: (num, name, desc) => console.log(`${colors.bold}${colors.green}${num}. ${name}${colors.reset} ${colors.cyan}(${desc})${colors.reset}`),
    step: (msg) => console.log(`   ${colors.blue}→${colors.reset} ${msg}`),
    command: (cmd) => console.log(`   ${colors.cyan}${cmd}${colors.reset}`),
    link: (text, url) => console.log(`   ${colors.blue}${text}:${colors.reset} ${url}`)
};

function getRepositoryInfo() {
    try {
        const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
        const match = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
        if (match) {
            return {
                owner: match[1],
                repo: match[2],
                url: `https://github.com/${match[1]}/${match[2]}`
            };
        }
    } catch (error) {
        return {
            owner: 'your-username',
            repo: 'your-repo',
            url: 'https://github.com/your-username/your-repo'
        };
    }
}

function main() {
    const repo = getRepositoryInfo();

    log.title('Release Methods Guide');
    console.log();
    console.log('Choose the method that best fits your workflow:');
    console.log();

    // Method 1: Enhanced CLI
    log.method('1', 'Enhanced CLI', 'Recommended - 90% of releases');
    log.step('Interactive prompts with rich editor experience');
    log.command('pnpm release:prepare  # Interactive setup');
    log.command('pnpm release:publish  # Execute release');
    log.command('# OR combined:');
    log.command('pnpm release          # Both phases together');
    console.log();
    console.log('   • Best developer experience');
    console.log('   ✅ Full control and review capability');
    console.log('   ✅ Professional release notes');
    console.log();

    // Method 2: GitHub UI  
    log.method('2', 'GitHub UI', 'Manual creation - 8% of releases');
    log.step('Create releases directly in GitHub interface');
    log.link('GitHub Releases', `${repo.url}/releases/new`);
    log.step('Steps:');
    console.log('     1. Choose a tag (e.g., v1.5.0)');
    console.log('     2. Set release title');
    console.log('     3. Write release notes');
    console.log('     4. Publish release');
    console.log();
    console.log('   ✅ Quick and familiar');
    console.log('   ✅ Perfect for emergency releases');
    console.log('   ✅ Same automation triggers');
    console.log();

    // Method 3: Manual Dispatch
    log.method('3', 'Manual Dispatch', 'Workflow trigger - 2% of releases');
    log.step('Trigger releases via GitHub Actions');
    log.link('Create Release Workflow', `${repo.url}/actions/workflows/create-release.yml`);
    log.step('Steps:');
    console.log('     1. Go to Actions → Create Release');
    console.log('     2. Click "Run workflow"');
    console.log('     3. Select version type (patch/minor/major)');
    console.log('     4. Add release notes (optional)');
    console.log('     5. Run workflow');
    console.log();
    console.log('   ✅ Perfect for CI/CD integration');
    console.log('   ✅ Automated version calculation');
    console.log('   ✅ Dry run capability');
    console.log();

    // Status and help
    console.log(`${colors.bold}Quick Commands:${colors.reset}`);
    log.command('pnpm release:status   # Check current state');
    log.command('pnpm release:ui       # GitHub UI instructions');
    log.command('pnpm release:manual   # Manual dispatch instructions');
    console.log();

    console.log(`${colors.bold}${colors.yellow}All methods trigger the same professional release workflow!${colors.reset}`);
    console.log('• Auto-generated release notes + your custom notes');
    console.log('• NPM package publishing with provenance');
    console.log('• Bundle size reporting and validation');
    console.log('• Professional release formatting');
}

if (require.main === module) {
    main();
} 