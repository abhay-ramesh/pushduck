/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      // Without `include`, Vitest 3+ only reports files a test imported, so
      // untested files vanish from the denominator instead of counting as 0%.
      include: ["src/**"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.{ts,tsx}",
        "src/setupTests.ts",
      ],
    },
  },
});
