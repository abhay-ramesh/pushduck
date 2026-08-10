import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/server.ts",
    "src/client.ts",
    "src/react-native.ts",
    // The barrel is the documented entry point, but each adapter is also
    // published on its own subpath. The barrel's .d.ts references next,
    // express and fastify types, so a project that installs only one of them
    // and sets skipLibCheck: false gets TS2307 for the peers it lacks.
    // Importing a single adapter avoids pulling in the others' types.
    "src/adapters/index.ts",
    "src/adapters/nextjs.ts",
    "src/adapters/nextjs-pages.ts",
    "src/adapters/express.ts",
    "src/adapters/fastify.ts",
  ],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  minify: true,
  treeshake: true,
  sourcemap: false,
  external: ["react", "next", "crypto"],
  // The package is "type": "module", so a .js file is parsed as ESM by Node.
  // Emitting the CommonJS build as .js therefore produced files Node could not
  // load via require() at all. CJS must carry the .cjs extension.
  outExtensions: ({ format }) => ({
    js: format === "cjs" ? ".cjs" : ".mjs",
    dts: format === "cjs" ? ".d.cts" : ".d.mts",
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
        (chunk.fileName === "client.js" ||
          chunk.fileName === "client.mjs" ||
          ((chunk.fileName.includes("hook") ||
            chunk.fileName.includes("use-upload-route")) &&
            !chunk.fileName.includes("server"))) &&
        !chunk.fileName.includes("react-native")
      ) {
        return '"use client";';
      }
      return "";
    },
  },
});
