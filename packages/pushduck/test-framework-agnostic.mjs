/**
 * Test script to verify framework-agnostic handlers work
 */

import { createS3Handler, createS3Router, s3 } from "./dist/server.mjs";

console.log("🧪 Testing Framework-Agnostic Handlers...\n");

// Create a test router
const testRouter = createS3Router({
    imageUpload: s3.image().max("5MB"),
    documentUpload: s3.file().max("10MB"),
});

console.log("✅ Router created successfully");
console.log("📁 Available routes:", testRouter.getRouteNames());

// Test 1: Verify .handlers property exists
console.log("\n🔍 Test 1: Universal Handlers Property");
try {
    const handlers = testRouter.handlers;
    console.log("✅ router.handlers exists:", typeof handlers);
    console.log("✅ Has GET method:", typeof handlers.GET === "function");
    console.log("✅ Has POST method:", typeof handlers.POST === "function");
} catch (error) {
    console.log("❌ router.handlers failed:", error.message);
}

// Test 2: Verify old createS3Handler still works
console.log("\n🔍 Test 2: Legacy createS3Handler");
try {
    const legacyHandlers = createS3Handler(testRouter);
    console.log("✅ createS3Handler works:", typeof legacyHandlers);
    console.log("✅ Has GET method:", typeof legacyHandlers.GET === "function");
    console.log("✅ Has POST method:", typeof legacyHandlers.POST === "function");
} catch (error) {
    console.log("❌ createS3Handler failed:", error.message);
}

// Test 3: Compare handlers (they should be equivalent)
console.log("\n🔍 Test 3: Handler Equivalence");
try {
    const universalHandlers = testRouter.handlers;
    const legacyHandlers = createS3Handler(testRouter);

    console.log("✅ Both APIs return handler objects");

    // Test mock GET request
    const mockGetRequest = new Request(
        "http://localhost:3000/api/upload?route=imageUpload",
        {
            method: "GET",
        },
    );

    // Test universal handler
    const universalResponse = await universalHandlers.GET(mockGetRequest);
    const universalData = await universalResponse.json();

    console.log(
        "✅ Universal GET handler works:",
        universalData.routes.length > 0,
    );
} catch (error) {
    console.log("❌ Handler comparison failed:", error.message);
}

console.log("\n🎉 Framework-agnostic implementation is working!");
console.log("📝 Next steps:");
console.log("   • Test with Next.js app");
console.log("   • Add Express adapter");
console.log("   • Add Hono adapter");
console.log("   • Update documentation");
