const { generatePresignedUploadUrl, resetS3Client } = require('./dist/server.js');

// Enable debug mode
process.env.DEBUG = "true";
process.env.NODE_ENV = "development";

async function debug403Error() {
    try {
        console.log("🔍 Debugging 403 Forbidden Error");
        console.log("================================");

        // Reset client to ensure fresh instance
        resetS3Client();

        const options = {
            key: "test-upload.txt",
            contentType: "text/plain",
            expiresIn: 3600,
            metadata: {
                "test": "debug-session"
            }
        };

        console.log("📝 Generating presigned URL with options:", options);
        console.log("");

        const result = await generatePresignedUploadUrl(options);

        console.log("");
        console.log("✅ Presigned URL generated successfully!");
        console.log("🔗 URL:", result.url);
        console.log("");

        // Parse the URL to show components
        const url = new URL(result.url);
        console.log("📊 URL Components:");
        console.log("   Protocol:", url.protocol);
        console.log("   Host:", url.host);
        console.log("   Pathname:", url.pathname);
        console.log("   Search Params:");

        for (const [key, value] of url.searchParams.entries()) {
            console.log(`     ${key}: ${value}`);
        }

        console.log("");
        console.log("🧪 Test this URL with curl:");
        console.log(`curl -X PUT "${result.url}" \\`);
        console.log(`  -H "Content-Type: text/plain" \\`);
        console.log(`  -d "Hello, World!" \\`);
        console.log(`  -v`);

    } catch (error) {
        console.error("❌ Error generating presigned URL:", error);

        if (error.message.includes("Missing required S3 configuration")) {
            console.log("");
            console.log("💡 Configuration Help:");
            console.log("Make sure you have set up your upload configuration properly.");
            console.log("Check that the following environment variables are set:");
            console.log("- Access Key ID");
            console.log("- Secret Access Key");
            console.log("- Region");
            console.log("- Bucket name");
            console.log("- Endpoint (for non-AWS providers)");
        }
    }
}

debug403Error(); 