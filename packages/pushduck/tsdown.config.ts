import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/server.ts",
    "src/client.ts",
    "src/adapters/index.ts",
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
  // unbundle: false,
  outputOptions: {
    // Only add "use client" to actual client entry files, not shared chunks
    banner: (chunk) => {
      // Only add to the main client entry files, not shared chunks
      if (
        chunk.fileName === "client.js" ||
        chunk.fileName === "client.mjs" ||
        (chunk.fileName.includes("use-upload-route") &&
          !chunk.fileName.includes("server"))
      ) {
        return '"use client";';
      }
      return "";
    },
  },
});
