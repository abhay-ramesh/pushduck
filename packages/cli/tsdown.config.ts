import { fileURLToPath } from "node:url";
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
  // Bundle the provider registry from source; see the `paths` note in
  // tsconfig.json.
  alias: {
    "pushduck/providers": fileURLToPath(
      new URL("../pushduck/src/providers.ts", import.meta.url)
    ),
  },
});
