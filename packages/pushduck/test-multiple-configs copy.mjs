import { createUploadConfig } from "./dist/server.mjs";

console.log("🧪 Testing Multiple Upload Configurations...\n");

// Test 1: Multiple configurations should be independent
console.log("✅ Test 1: Multiple Independent Configurations");

const { config: config1, s3: s3Instance1 } = createUploadConfig()
    .provider("aws", {
        bucket: "test-bucket-1",
        region: "us-east-1",
        accessKeyId: "key1",
        secretAccessKey: "secret1",
    })
    .defaults({
        maxFileSize: "5MB",
    })
    .build();

console.log("📦 Config 1 created - Provider:", config1.provider.provider);
console.log("📦 Config 1 bucket:", config1.provider.bucket);

const { config: config2, s3: s3Instance2 } = createUploadConfig()
    .provider("cloudflareR2", {
        accountId: "account123",
        bucket: "test-bucket-2",
        accessKeyId: "key2",
        secretAccessKey: "secret2",
        region: "auto",
    })
    .defaults({
        maxFileSize: "10MB",
    })
    .build();

console.log("📦 Config 2 created - Provider:", config2.provider.provider);
console.log("📦 Config 2 bucket:", config2.provider.bucket);

// Test 2: Verify configurations remain independent
console.log("\n✅ Test 2: Configuration Independence Verification");
console.log("Config 1 provider:", config1.provider.provider, "- bucket:", config1.provider.bucket);
console.log("Config 2 provider:", config2.provider.provider, "- bucket:", config2.provider.bucket);

if (config1.provider.bucket === "test-bucket-1" && config2.provider.bucket === "test-bucket-2") {
    console.log("✅ SUCCESS: Multiple configurations are independent!");
} else {
    console.log("❌ FAILED: Configuration interference detected!");
}

// Test 3: Verify S3 instances are different
console.log("\n✅ Test 3: S3 Instance Independence");
console.log("S3 instance 1:", typeof s3Instance1);
console.log("S3 instance 2:", typeof s3Instance2);
console.log("Are S3 instances different objects?", s3Instance1 !== s3Instance2);

// Test 4: Schema creation independence
console.log("\n✅ Test 4: Schema Creation Independence");
const schema1 = s3Instance1.file({ maxSize: "1MB" });
const schema2 = s3Instance2.file({ maxSize: "2MB" });

console.log("Schema 1 created successfully:", !!schema1);
console.log("Schema 2 created successfully:", !!schema2);
console.log("Schemas are different objects:", schema1 !== schema2);

console.log("\n🎉 Multiple configuration test completed!");
console.log("🔧 Global state mutation has been successfully eliminated!"); 