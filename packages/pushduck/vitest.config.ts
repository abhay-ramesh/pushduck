/// <reference types="vitest" />
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

/**
 * Shared across both projects below.
 *
 * Solid ships separate client and server builds behind export conditions.
 * Under Node's default conditions it resolves to the server build, whose
 * stores are inert frozen objects — `setStore` throws and reconcile is a
 * no-op, so the binding would be tested against a runtime no browser user
 * ever runs. `browser` selects the real reactive build.
 *
 * Listed after "development" so Solid's dev warnings stay enabled. Safe for
 * the other suites: React and Vue behave identically under this condition,
 * and the server-side modules resolve the same either way.
 */
const resolve = {
  conditions: ["development", "browser"],
};

const shared = {
  environment: "node" as const,
  globals: true,
  setupFiles: ["./src/setupTests.ts"],
  exclude: ["node_modules", "dist"],
  passWithNoTests: true,
};

/**
 * The Svelte compiler runs in its own project, because the plugin silently
 * destroys coverage.
 *
 * `@sveltejs/vite-plugin-svelte` only *transforms* `.svelte` files, but merely
 * being present in the plugin list makes v8 report 0% for every file in the
 * run — including files a passing test demonstrably executed. Nothing fails
 * and nothing warns; the report is simply all zeros, and CI publishes it.
 *
 * Isolating it to the one suite that needs a compiled component keeps the
 * fixture working and lets every other suite report real coverage. Verified by
 * reducing it to a two-file project outside this repo: identical config, the
 * only difference being the plugin, 50% versus 0%.
 */
export default defineConfig({
  resolve,
  test: {
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
        // Helpers, fixtures and the Bun/Deno scripts are test scaffolding, not
        // shipped code; counting them puts a floor under the number that has
        // nothing to do with how well the library is tested.
        "src/__tests__/**",
        "src/setupTests.ts",
      ],
    },
    projects: [
      {
        resolve,
        test: {
          ...shared,
          name: "unit",
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          // Compiled-component tests belong to the svelte project below.
          exclude: [...shared.exclude, "**/svelte-component.test.ts"],
          typecheck: {
            // Type-level assertions in *.test-d.ts guard IntelliSense and
            // route-name safety — things no runtime test can observe. Run them
            // with the suite so a regression fails CI rather than silently
            // degrading editor support.
            enabled: true,
            include: ["src/**/*.test-d.ts"],
            tsconfig: "./tsconfig.json",
          },
        },
      },
      {
        plugins: [svelte({ compilerOptions: { dev: true } })],
        resolve,
        test: {
          ...shared,
          name: "svelte",
          include: ["src/__tests__/svelte-component.test.ts"],
        },
      },
    ],
  },
});
