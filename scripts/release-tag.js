#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// Read the main package version
const pkg = require('../packages/pushduck/package.json');
const tag = `v${pkg.version}`;
const message = `Release ${tag}

🚀 Features and improvements in this release
🐞 Bug fixes and stability improvements  
📝 See full changelog: https://github.com/abhay-ramesh/pushduck/releases/tag/${tag}`;

console.log(`🏷️  Creating annotated tag: ${tag}`);
console.log(`📝 Tag message: ${message.split('\n')[0]}`);

try {
    // Add any changes, commit, create annotated tag, and push
    execSync('git add .', { stdio: 'inherit' });

    // Check if there are changes to commit
    try {
        execSync('git diff --staged --quiet');
        console.log('ℹ️  No changes to commit');
    } catch {
        console.log('📝 Committing changes...');
        execSync(`git commit -m "chore: release ${tag}"`, { stdio: 'inherit' });
    }

    console.log('🏷️  Creating annotated tag...');
    execSync(`git tag -a "${tag}" -m "${message}"`, { stdio: 'inherit' });

    console.log('📤 Pushing changes and tags...');
    execSync('git push', { stdio: 'inherit' });
    execSync('git push --tags', { stdio: 'inherit' });

    console.log(`✅ Successfully created and pushed release ${tag}`);
    console.log(`🎉 Check your GitHub Actions: https://github.com/abhay-ramesh/pushduck/actions`);
    console.log(`📦 View release: https://github.com/abhay-ramesh/pushduck/releases/tag/${tag}`);

} catch (error) {
    console.error('❌ Release failed:', error.message);
    process.exit(1);
} 