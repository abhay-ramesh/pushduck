#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, join } from 'path';
import { gzipSync } from 'zlib';

const DIST_DIR = 'dist';
const SIZE_LIMITS = {
    'client.mjs': 5 * 1024,    // 5KB
    'server.mjs': 10 * 1024,   // 10KB  
    'index.mjs': 7 * 1024,     // 7KB
};

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getGzipSize(filePath) {
    const content = readFileSync(filePath);
    const gzipped = gzipSync(content);
    return gzipped.length;
}

function analyzeBundle() {
    console.log('Bundle Size Analysis\n');

    try {
        const files = readdirSync(DIST_DIR);
        const results = [];
        let totalRaw = 0;
        let totalGzip = 0;
        let hasErrors = false;

        for (const file of files) {
            if (!['.js', '.mjs', '.cjs'].includes(extname(file))) continue;

            const filePath = join(DIST_DIR, file);
            const stats = statSync(filePath);
            const rawSize = stats.size;
            const gzipSize = getGzipSize(filePath);
            const limit = SIZE_LIMITS[file];
            const withinLimit = !limit || gzipSize <= limit;

            if (!withinLimit) hasErrors = true;

            results.push({
                file,
                rawSize,
                gzipSize,
                limit,
                withinLimit,
                compression: ((rawSize - gzipSize) / rawSize * 100).toFixed(1)
            });

            totalRaw += rawSize;
            totalGzip += gzipSize;
        }

        // Sort by gzip size descending
        results.sort((a, b) => b.gzipSize - a.gzipSize);

        // Print results
        console.log('File'.padEnd(20) + 'Raw Size'.padEnd(12) + 'Gzipped'.padEnd(12) + 'Limit'.padEnd(12) + 'Status');
        console.log('─'.repeat(68));

        for (const result of results) {
            const status = result.withinLimit ? 'OK' : 'OVER';
            const limitStr = result.limit ? formatSize(result.limit) : 'N/A';

            console.log(
                result.file.padEnd(20) +
                formatSize(result.rawSize).padEnd(12) +
                formatSize(result.gzipSize).padEnd(12) +
                limitStr.padEnd(12) +
                status
            );
        }

        console.log('─'.repeat(68));
        console.log(
            'TOTAL'.padEnd(20) +
            formatSize(totalRaw).padEnd(12) +
            formatSize(totalGzip).padEnd(12) +
            `${((totalRaw - totalGzip) / totalRaw * 100).toFixed(1)}% saved`.padEnd(12)
        );

        console.log(`\nSummary:`);
        console.log(`• Total files analyzed: ${results.length}`);
        console.log(`• Total raw size: ${formatSize(totalRaw)}`);
        console.log(`• Total gzipped: ${formatSize(totalGzip)}`);
        console.log(`• Compression ratio: ${((totalRaw - totalGzip) / totalRaw * 100).toFixed(1)}%`);

        if (hasErrors) {
            console.log(`\nError: Some bundles exceed size limits!`);
            process.exit(1);
        } else {
            console.log(`\nAll bundles within size limits!`);
        }

    } catch (error) {
        console.error(`Error analyzing bundles: ${error.message}`);
        process.exit(1);
    }
}

analyzeBundle(); 