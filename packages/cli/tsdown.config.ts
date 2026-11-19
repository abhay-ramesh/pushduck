import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  // ESM, because the CLI's runtime dependencies are: chalk, ora, execa and
  // inquirer ship only ES modules. A CommonJS bundle has to `require()` them,
  // which throws ERR_REQUIRE_ESM on older Node and, on Node with require(esm),
  // returns the module namespace — the bundler's interop helper then wraps
  // that namespace as the default export, so `chalk.cyan` becomes
  // `namespace.cyan`, which is undefined. Emitting ESM lets Node's own loader
  // resolve every default and named import, CommonJS dependencies included.
  format: ["esm"],
  // A bin, not a library: nothing imports this package, so no declarations.
  dts: false,
  clean: true,
  minify: true,
  // CLI needs to be bundled and executable
  unbundle: false,
  platform: "node",
  // The floor set by the dependencies (ora, commander and @aws-sdk/client-s3
  // all declare node >=20); matches `engines` in package.json.
  target: "node20",
  // Bundle the provider registry from source; see the `paths` note in
  // tsconfig.json.
  alias: {
    "pushduck/providers": fileURLToPath(
      new URL("../pushduck/src/providers.ts", import.meta.url)
    ),
  },
});
