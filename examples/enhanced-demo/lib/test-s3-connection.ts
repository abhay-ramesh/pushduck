/**
 * S3 Connection Test Script
 *
 * This script tests the S3 connection and list operations
 * Run with: npx tsx lib/test-s3-connection.ts
 */

import { storage } from "./upload";

async function testS3Connection() {
  console.log("Testing S3 connection...");

  try {
    // Test connection
    const connectionResult = await storage.validation.connection();
    if (connectionResult.success) {
      console.log("S3 connection successful!");
    } else {
      console.log("S3 connection failed:", connectionResult.error);
      return;
    }

    // Test listing files
    console.log("\nTesting file listing...");
    const files = await storage.list.files({ maxFiles: 5 });
    console.log(`Found ${files.length} files:`);

    files.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.key}`);
      console.log(`     Size: ${(file.size / 1024).toFixed(1)}KB`);
      console.log(`     Type: ${file.contentType}`);
      console.log(`     URL: ${file.url}`);
    });

    // Test getting file info for the first file
    if (files.length > 0) {
      console.log("\nTesting file info...");
      const fileInfo = await storage.metadata.getInfo(files[0].key);
      console.log("File info:", fileInfo);
    }

    console.log("\nAll tests passed!");
  } catch (error) {
    console.error("Test failed:", error);

    // Check if it's a configuration issue
    const requiredEnvVars = [
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
      "CLOUDFLARE_ACCOUNT_ID",
    ];

    const missingVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );

    if (missingVars.length > 0) {
      console.log("\nMissing environment variables:");
      missingVars.forEach((varName) => {
        console.log(`   - ${varName}`);
      });
      console.log("\nMake sure to:");
      console.log("   1. Copy env.example to .env.local");
      console.log("   2. Fill in your actual R2 credentials");
      console.log("   3. Make sure the bucket exists and is accessible");
    }
  }
}

// Run the test
testS3Connection();
