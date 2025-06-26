module.exports = {
    extends: [
        "next/core-web-vitals",
        "next/typescript"
    ],
    rules: {
        // Allow any types in demo code
        "@typescript-eslint/no-explicit-any": "off",
        // Allow unused variables in demo code
        "@typescript-eslint/no-unused-vars": "off"
    }
}; 