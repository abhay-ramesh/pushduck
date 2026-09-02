/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // `pushduck/client` is aliased to source in another workspace package, so
    // without this its `react` resolves to that package's copy while the
    // components use this one. Two Reacts means every hook call throws
    // "Invalid hook call", which reads like a component bug and is not one.
    dedupe: ["react", "react-dom"],
    alias: {
      // Mirrors the `paths` in tsconfig.json. The registry components are
      // authored as if they had already been copied into a consumer's app, so
      // `@/lib/utils` has to resolve the same way here as it does there.
      "@": resolve(__dirname, "."),
      // Against source rather than the built package: these components are the
      // first consumer of `pushduck/client`, and testing them against a stale
      // `dist` would hide a break in the hook they depend on.
      "pushduck/client": resolve(__dirname, "../pushduck/src/client.ts"),
      pushduck: resolve(__dirname, "../pushduck/src/index.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["registry/**/*.test.{ts,tsx}", "__tests__/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "public"],
  },
});
