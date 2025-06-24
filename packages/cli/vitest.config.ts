import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Don't fail when no test files are found
    passWithNoTests: true,
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "coverage/**",
        "dist/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/node_modules/**",
      ],
    },
  },
});
