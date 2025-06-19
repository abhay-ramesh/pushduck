import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  dts: true,
  clean: true,
  minify: true,
  // CLI needs to be bundled and executable
  unbundle: false,
  platform: "node",
  target: "node16",
});
