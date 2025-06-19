import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts", "src/client.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  minify: true,
  treeshake: true,
  splitting: true,
  sourcemap: false,
  external: ["react", "next"],
  // Remove global "use client" directive for now
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".js" : ".mjs",
    };
  },
  platform: "neutral",
  target: "es2020",
  keepNames: false,
  bundle: true,
});
