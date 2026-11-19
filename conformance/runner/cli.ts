/**
 * @fileoverview `pnpm conformance --url <base-url>`
 *
 * Points the fixtures at a running server, whatever language it is written in.
 * The only assumptions are HTTP and the route surface described in the README.
 *
 * Exits non-zero on any failure, so it can gate a CI job in a Go or Python
 * repository as easily as in this one.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatResults, runAll, type Fixture } from "./run";
import { parseStorage } from "./storage";

function parseArgs(argv: string[]): {
  url: string;
  auth?: string;
  storage?: string;
  receiptSecret?: string;
} {
  const args = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1]?.startsWith("--") ? "true" : argv[i + 1];
    args.set(key, value ?? "true");
  }

  const url = args.get("url");
  if (!url) {
    // A default would silently test the wrong thing; being told is better.
    throw new Error(
      "Usage: conformance --url <base-url> [--storage <bucket-url>] [--receipt-secret <secret>]\n" +
        "  e.g. conformance --url http://localhost:3000/api/upload\n" +
        "  --storage http://KEY:SECRET@127.0.0.1:9000/bucket  the bucket the server writes to;\n" +
        "      runs the cases that check what completion does with the stored object"
    );
  }

  return {
    url,
    auth: args.get("auth"),
    storage: args.get("storage"),
    receiptSecret: args.get("receipt-secret"),
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(here, "../fixtures");

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap(
      (name) =>
        JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as Fixture[]
    );
}

async function main(): Promise<void> {
  const { url, storage, receiptSecret } = parseArgs(process.argv.slice(2));
  const fixtures = loadFixtures();

  console.log(
    `Running ${fixtures.length} conformance cases against ${url}\n`
  );

  const results = await runAll(fixtures, {
    url,
    storage: storage ? parseStorage(storage) : undefined,
    receiptSecret,
  });
  console.log(formatResults(results));

  process.exit(results.some((result) => !result.passed) ? 1 : 0);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(2);
});
