#!/usr/bin/env node

/**
 * Simple changeset validator - checks existence and basic format
 */

const fs = require('fs');
const path = require('path');

const changesetDir = path.join(process.cwd(), '../../.changeset');

// Check if changeset directory exists
if (!fs.existsSync(changesetDir)) {
    console.log('❌ Changeset directory not found');
    process.exit(1);
}

// Find changeset files (exclude README.md)
const files = fs.readdirSync(changesetDir)
    .filter(file => file.endsWith('.md') && file !== 'README.md');

if (files.length === 0) {
    console.log('❌ No changesets found. Run "pnpm changeset" first.');
    process.exit(1);
}

// Basic validation - check if content exists
for (const file of files) {
    const content = fs.readFileSync(path.join(changesetDir, file), 'utf8');
    const summary = content.split('---')[2]?.trim();

    if (!summary || summary.length < 10) {
        console.log(`❌ Changeset ${file} is too short or empty`);
        process.exit(1);
    }
}

console.log(`✅ Found ${files.length} valid changeset(s)`);
process.exit(0); 