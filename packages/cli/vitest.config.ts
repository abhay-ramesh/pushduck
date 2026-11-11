import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // See the `paths` note in tsconfig.json.
    alias: {
      "pushduck/providers": fileURLToPath(
        new URL("../pushduck/src/providers.ts", import.meta.url)
      ),
    },
  },
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
