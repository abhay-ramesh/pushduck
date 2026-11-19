/**
 * @fileoverview `pushduck cors check|apply` — does the bucket let the browser
 * upload from these origins, and make it so.
 *
 * Browser uploads go straight to the bucket, so its CORS rules — not the
 * app — decide whether they work. A missing origin fails the upload with a
 * bare network error; a rule that hides `ETag` fails every multipart upload.
 * Apps have worked around it with server-side proxy routes, pinned dev
 * ports and one-off scripts; these commands answer it directly.
 *
 * What the browser needs is `corsRequirements` from the library, and how a
 * provider's CORS is managed is its definition's `cors` — nothing here
 * branches on a provider's name.
 */

import { GetBucketCorsCommand, type S3Client } from "@aws-sdk/client-s3";
import chalk from "chalk";
import inquirer from "inquirer";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import {
  corsRequirements,
  corsRule,
  objectApiUrl,
  type CorsRule,
  type StorageTarget,
} from "pushduck/providers";
import {
  diffRules,
  fromS3Rule,
  mergeOrigins,
  normalizeOrigin,
  preflightHeaders,
  putBucketCors,
  reportOrigin,
  type CheckLine,
  type HttpAnswer,
} from "../utils/cors";
import {
  definitionOf,
  findConfiguredProvider,
  resolveTarget,
  s3ClientFor,
  type ProviderType,
} from "../utils/provider-setup";

export interface CorsOptions {
  origin: string[];
  provider?: ProviderType;
  yes?: boolean;
}

/** What the commands do to the outside world, replaceable in tests. */
export interface CorsIO {
  log: (line?: string) => void;
  /** Asks a yes/no question; `undefined` when there is no one to ask. */
  confirm: (message: string) => Promise<boolean | undefined>;
}

const defaultIO: CorsIO = {
  log: (line = "") => console.log(line),
  confirm: async (message) => {
    if (!process.stdin.isTTY) return undefined;
    const { ok } = await inquirer.prompt<{ ok: boolean }>([
      { type: "confirm", name: "ok", message, default: false },
    ]);
    return ok;
  },
};

/**
 * The key preflights and the probe upload are addressed to. CORS is decided
 * per bucket, not per key, and nothing is ever written there.
 */
const PROBE_KEY = "pushduck-cors-check";

// ========================================
// check
// ========================================

/**
 * Reports, per origin, whether the browser can upload and download, and
 * whether it can read `ETag`.
 *
 * @returns The exit code: 1 when any origin would fail, or nothing could be
 *   checked
 */
export async function corsCheckCommand(
  options: CorsOptions,
  io: CorsIO = defaultIO
): Promise<number> {
  const origins = parseOrigins(options.origin, false, io);
  if (!origins) return 1;
  const bucket = await resolveBucket(options.provider, io);
  if (!bucket) return 1;

  const { target, name, cors } = bucket;
  const requirements = corsRequirements(target);
  io.log(chalk.cyan(`Checking CORS on ${name} bucket "${target.bucket}"\n`));

  let rules: readonly CorsRule[] | undefined;
  if (cors.api === "s3") {
    const read = await readRules(s3ClientFor(target), target.bucket);
    if ("rules" in read) {
      rules = read.rules;
    } else {
      io.log(chalk.yellow(`Could not read the bucket's CORS rules: ${read.error}`));
      if (cors.permissionHint) io.log(chalk.gray(cors.permissionHint));
      io.log(chalk.gray("Checking with preflight requests only.\n"));
    }
  } else {
    io.log(
      chalk.gray(
        `${name} does not expose bucket CORS through the S3 API; checking with preflight requests.\n`
      )
    );
  }

  const url = objectApiUrl(target, PROBE_KEY);
  let networkError: string | undefined;
  const send = (method: string, headers: Record<string, string>) =>
    sendHttp(method, url, headers).catch((error: Error) => {
      networkError ??= error.message;
      return undefined;
    });

  let failed = false;
  for (const origin of origins) {
    const preflights = await Promise.all(
      requirements.map((requirement) =>
        send("OPTIONS", preflightHeaders(origin, requirement))
      )
    );
    const actual = await send("PUT", probeUploadHeaders(origin, target));

    const lines = reportOrigin(origin, requirements, { rules, preflights, actual });
    failed ||= lines.some((line) => line.status === "fail");
    printOrigin(origin, lines, io);
  }

  if (networkError) {
    io.log(chalk.yellow(`Could not reach ${new URL(url).host}: ${networkError}`));
  }

  if (failed) {
    io.log(chalk.red("Browser uploads from some origins will fail."));
    io.log(
      `Fix: ${chalk.bold(`pushduck cors apply ${origins.map((o) => `--origin ${o}`).join(" ")}`)}`
    );
    return 1;
  }

  io.log(chalk.green("Browser uploads from every origin will pass CORS."));
  return 0;
}

/**
 * Headers for an upload `PUT` that cannot succeed: the signature is for a
 * credential that does not exist, so the provider refuses it and nothing is
 * written — but a provider that sends CORS headers on errors still shows
 * which response headers the page could read.
 */
function probeUploadHeaders(
  origin: string,
  target: Pick<StorageTarget, "region">
): Record<string, string> {
  return {
    Origin: origin,
    "Content-Type": "application/octet-stream",
    "Content-Length": "0",
    Authorization: `AWS4-HMAC-SHA256 Credential=PUSHDUCKCORSCHECK/20000101/${target.region}/s3/aws4_request, SignedHeaders=host, Signature=0`,
  };
}

function printOrigin(origin: string, lines: CheckLine[], io: CorsIO): void {
  io.log(chalk.bold(origin));
  const width = Math.max(...lines.map((line) => line.label.length));
  for (const line of lines) {
    const mark =
      line.status === "pass"
        ? chalk.green("✓")
        : line.status === "fail"
          ? chalk.red("✗")
          : chalk.yellow("?");
    io.log(`  ${mark} ${line.label.padEnd(width)}  ${chalk.gray(line.detail)}`);
  }
  io.log();
}

// ========================================
// apply
// ========================================

/**
 * Adds the origins to the bucket's CORS rules, keeping every other rule.
 *
 * Shows the change and asks first, unless `--yes`. Providers whose CORS is
 * not set through the S3 API get the exact steps instead.
 *
 * @returns The exit code: 1 when the rules could not be read or written, or
 *   confirmation was needed and could not be asked for
 */
export async function corsApplyCommand(
  options: CorsOptions,
  io: CorsIO = defaultIO
): Promise<number> {
  const origins = parseOrigins(options.origin, true, io);
  if (!origins) return 1;
  const bucket = await resolveBucket(options.provider, io);
  if (!bucket) return 1;

  const { target, name, cors } = bucket;

  if (cors.api === "external") {
    io.log(cors.instructions([corsRule(origins, target)], target.bucket));
    return 0;
  }

  const client = s3ClientFor(target);
  const read = await readRules(client, target.bucket);
  if (!("rules" in read)) {
    io.log(chalk.red(`Could not read the bucket's CORS rules: ${read.error}`));
    if (cors.permissionHint) io.log(chalk.gray(cors.permissionHint));
    return 1;
  }

  const { rules: next, added } = mergeOrigins(read.rules, origins, target);
  if (added.length === 0) {
    io.log(
      chalk.green(`${name} bucket "${target.bucket}" already allows browser uploads from ${origins.join(", ")}.`)
    );
    return 0;
  }

  io.log(chalk.cyan(`CORS rules for ${name} bucket "${target.bucket}":\n`));
  for (const line of diffRules(read.rules, next)) {
    io.log(
      line.startsWith("+")
        ? chalk.green(line)
        : line.startsWith("-")
          ? chalk.red(line)
          : chalk.gray(line)
    );
  }
  io.log();

  if (!options.yes) {
    const ok = await io.confirm("Apply these rules?");
    if (ok === undefined) {
      io.log(chalk.yellow("Not applied: no terminal to confirm in. Re-run with --yes."));
      return 1;
    }
    if (!ok) {
      io.log("Not applied.");
      return 0;
    }

    // PutBucketCors replaces the whole configuration and has no condition to
    // guard it, so a change made while the prompt was open would be lost.
    // Re-read and refuse rather than overwrite what was not shown.
    const again = await readRules(client, target.bucket);
    if (!("rules" in again) || JSON.stringify(again.rules) !== JSON.stringify(read.rules)) {
      io.log(chalk.red("The bucket's CORS rules changed while waiting. Nothing was applied; run the command again."));
      return 1;
    }
  }

  try {
    await client.send(putBucketCors(target.bucket, next));
  } catch (error) {
    io.log(chalk.red(`Could not update the bucket's CORS rules: ${errorMessage(error)}`));
    if (cors.permissionHint) io.log(chalk.gray(cors.permissionHint));
    return 1;
  }

  io.log(chalk.green(`✓ Allowed ${added.join(", ")}`));
  const concrete = added.filter((origin) => !origin.includes("*"));
  if (concrete.length > 0) {
    io.log(
      chalk.gray(
        `Verify (changes can take a few seconds to apply): pushduck cors check ${concrete.map((o) => `--origin ${o}`).join(" ")}`
      )
    );
  }
  return 0;
}

// ========================================
// Shared
// ========================================

function parseOrigins(
  inputs: readonly string[] | undefined,
  allowPattern: boolean,
  io: CorsIO
): string[] | undefined {
  try {
    const origins = (inputs ?? []).map((input) =>
      normalizeOrigin(input, { allowPattern })
    );
    if (origins.length === 0) throw new Error("Pass at least one --origin");
    return [...new Set(origins)];
  } catch (error) {
    io.log(chalk.red(errorMessage(error)));
    return undefined;
  }
}

/**
 * The bucket the app is configured for: the same credential lookup as
 * `pushduck test`, resolved through the library like the server does.
 */
async function resolveBucket(provider: ProviderType | undefined, io: CorsIO) {
  const found = await findConfiguredProvider(provider);
  if (!found) {
    io.log(
      chalk.red(
        provider
          ? `No ${provider} credentials found in the environment, .env.local or .env.`
          : "No storage credentials found in the environment, .env.local or .env."
      )
    );
    io.log(chalk.gray("Run: npx @pushduck/cli@latest init"));
    return undefined;
  }

  try {
    const target = resolveTarget(found.credentials, found.provider);
    return { target, ...definitionOf(found.provider) };
  } catch (error) {
    io.log(chalk.red(errorMessage(error)));
    return undefined;
  }
}

/** The bucket's rules; none configured reads as an empty list. */
async function readRules(
  client: S3Client,
  bucket: string
): Promise<{ rules: CorsRule[] } | { error: string }> {
  try {
    const result = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    return { rules: (result.CORSRules ?? []).map(fromS3Rule) };
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchCORSConfiguration") {
      return { rules: [] };
    }
    return { error: errorMessage(error) };
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { name?: string }).name;
    return code && code !== "Error" && !error.message.includes(code)
      ? `${code}: ${error.message}`
      : error.message;
  }
  return String(error);
}

/**
 * One HTTP request through `node:http`, so the headers a browser would send —
 * `Origin` included, which fetch implementations may refuse to set — go out
 * exactly as written, on every Node version the CLI supports.
 */
function sendHttp(
  method: string,
  url: string,
  headers: Record<string, string>
): Promise<HttpAnswer> {
  const send = url.startsWith("https:") ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = send(url, { method, headers, timeout: 10_000 }, (res) => {
      res.resume();
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: Object.fromEntries(
            Object.entries(res.headers).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(", ") : value,
            ])
          ),
        })
      );
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    req.end();
  });
}
