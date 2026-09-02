/// <reference types="vitest" />
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Compiles the `.svelte` fixture used by `svelte-component.test.ts`. Svelte's
  // `$store` auto-subscription is compiler output, so the only way to test it
  // is to compile a real component. Scoped to `.svelte` files, so every other
  // suite is untouched.
  plugins: [svelte({ compilerOptions: { dev: true } })],
  resolve: {
    // Solid ships separate client and server builds behind export conditions.
    // Under Node's default conditions it resolves to the server build, whose
    // stores are inert frozen objects — `setStore` throws and reconcile is a
    // no-op, so the binding would be tested against a runtime no browser user
    // ever runs. `browser` selects the real reactive build.
    //
    // Listed after "development" so Solid's dev warnings stay enabled. Safe for
    // the other suites: React and Vue behave identically under this condition,
    // and the server-side modules resolve the same either way.
    conditions: ["development", "browser"],
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
    passWithNoTests: true,
    typecheck: {
      // Type-level assertions in *.test-d.ts guard IntelliSense and route-name
      // safety — things no runtime test can observe. Run them with the suite so
      // a regression fails CI rather than silently degrading editor support.
      enabled: true,
      include: ["src/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json",
    },
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
