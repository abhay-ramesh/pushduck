import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/server.ts",
    "src/client.ts",
    "src/adapters/nextjs.ts",
  ],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  minify: true,
  treeshake: true,
  sourcemap: false,
  external: ["react", "next", "crypto"],
  // Use outExtensions instead of outExtension for tsdown
  outExtensions: ({ format }) => ({
    js: format === "cjs" ? ".js" : ".mjs",
  }),
  platform: "neutral",
  target: "es2020",
  // keepNames is not available in tsdown, removing it
  // bundle is deprecated in tsdown, use unbundle instead
  unbundle: false,
});
