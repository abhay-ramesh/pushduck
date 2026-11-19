/**
 * @fileoverview Runs the conformance fixtures against a server.
 *
 * Deliberately small and dependency-free. An implementation in another
 * language should be able to reimplement this in an afternoon from the
 * fixtures and `match.ts` alone — the fixtures are the specification, this is
 * merely one way to execute them.
 *
 * The transport is `fetch` against a base URL, so it makes no assumption about
 * how the server under test is hosted: an in-process handler wrapped in a
 * fetcher, a `go run` process, or a deployed URL are all the same to it.
 */

import { match, type Mismatch } from "./match";
import { storageRequest, type StorageTarget } from "./storage";
import { sealReceipt, tamperToken } from "./tokens";

/** One HTTP request to the server under test. */
export interface FixtureRequest {
  method?: "GET" | "POST";
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  /** Send the body exactly as given, rather than as JSON. */
  rawBody?: string;
}

export interface FixtureExpectation {
  status?: number;
  /** Matched case-insensitively, as HTTP headers are. */
  headers?: Record<string, string>;
  body?: unknown;
}

/**
 * One step of a multi-request case. Exactly one of `request`, `upload`,
 * `store` or `head` is set.
 */
export interface FixtureStep {
  /** A request to the server under test. */
  request?: FixtureRequest;
  /** A PUT of `size` bytes to a URL the server issued, as a browser sends it. */
  upload?: { url: string; headers?: Record<string, string>; size: number };
  /**
   * An object written straight to the bucket, bypassing the server: what is
   * stored when a client sends something other than what it declared.
   * Needs `--storage`.
   */
  store?: { key: string; size: number; type: string };
  /** Asks the bucket whether an object exists. Needs `--storage`. */
  head?: { key: string };
  expect?: FixtureExpectation;
  /**
   * Values to keep from the response body for later steps, by dotted path:
   * `{ "key": "results.0.key" }`. A later step refers to one as `"${key}"`.
   */
  save?: Record<string, string>;
}

/** A single conformance case, as stored in `fixtures/*.json`. */
export interface Fixture {
  name: string;
  /** Section of `protocol.mdx` this case comes from. */
  spec?: string;
  /** Why the rule exists, for a reader who fails this case. */
  why?: string;
  /**
   * Optional protocol feature this case depends on.
   *
   * A server that does not advertise it in introspection is *conforming* by
   * omitting the feature, so the case is skipped rather than failed —
   * otherwise every implementation would be penalised for the parts of the
   * protocol it deliberately does not implement.
   */
  feature?: string;
  /**
   * What the run must provide. `"storage"`: the server under test is backed
   * by a real bucket and the runner was given it with `--storage`. Skipped
   * otherwise, because a server presigning against fake credentials cannot
   * show what it does with a stored object.
   */
  needs?: Array<"storage">;
  /** A single-request case. */
  request?: FixtureRequest;
  expect?: FixtureExpectation;
  /** A multi-request case, run in order; the first failing step ends it. */
  steps?: FixtureStep[];
}

export interface CaseResult {
  fixture: Fixture;
  passed: boolean;
  mismatches: Mismatch[];
  /** Present when the request could not be made at all. */
  error?: string;
  /** Set when the case was not run, with the reason. */
  skipped?: boolean;
  skipReason?: string;
}

export interface RunOptions {
  url: string;
  fetchImpl?: typeof fetch;
  /** Sent on every request; the suite's auth cases override it. */
  headers?: Record<string, string>;
  /** The bucket the server writes to, for cases that need `storage`. */
  storage?: StorageTarget;
  /**
   * The server's secret access key, for `$seal`. Defaults to the storage
   * secret when `storage` is given, else `conformance-secret` — what the
   * conformance servers use without storage.
   */
  receiptSecret?: string;
}
/**
 * Asks a server which optional features it implements.
 *
 * Absence is treated as "none", so a server predating the `features` field
 * simply runs the core suite. That is the safe direction: a missing feature
 * skips cases rather than inventing failures.
 */
export async function detectFeatures(options: {
  url: string;
  fetchImpl?: typeof fetch;
}): Promise<Set<string>> {
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(options.url, { method: "GET" });
    const body = (await response.json()) as { features?: unknown };
    return new Set(
      Array.isArray(body.features) ? body.features.map(String) : []
    );
  } catch {
    return new Set();
  }
}

/** Why a case cannot run with these options, or `undefined` when it can. */
function unmet(fixture: Fixture, options: RunOptions, features?: Set<string>) {
  if (fixture.feature && features && !features.has(fixture.feature)) {
    return `${fixture.feature} not implemented`;
  }
  if (fixture.needs?.includes("storage") && !options.storage) {
    return "needs --storage";
  }
  return undefined;
}

/** The steps of a case: its own, or its single request as one step. */
function stepsOf(fixture: Fixture): FixtureStep[] {
  return fixture.steps ?? [{ request: fixture.request, expect: fixture.expect }];
}

/**
 * Replaces `"${name}"` with a saved value, then evaluates `$seal` and
 * `$tamper`. A string that is exactly one reference takes the saved value's
 * type, so a saved object can stand in for a whole field.
 */
function resolve(value: unknown, saved: Map<string, unknown>, secret: string): unknown {
  if (typeof value === "string") {
    const whole = /^\$\{(\w+)\}$/.exec(value);
    if (whole) {
      if (!saved.has(whole[1])) throw new Error(`nothing saved as ${whole[1]}`);
      return saved.get(whole[1]);
    }
    return value.replace(/\$\{(\w+)\}/g, (_, name: string) => String(saved.get(name)));
  }

  if (Array.isArray(value)) return value.map((item) => resolve(item, saved, secret));

  if (typeof value === "object" && value !== null) {
    const resolved = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolve(item, saved, secret)])
    );
    if ("$seal" in resolved) return sealReceipt(secret, resolved.$seal);
    if ("$tamper" in resolved) {
      const { token, set } = resolved.$tamper as { token: string; set: Record<string, unknown> };
      return tamperToken(token, set);
    }
    return resolved;
  }

  return value;
}

function pick(body: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      body
    );
}

/** Performs one step and returns the response. */
async function perform(
  step: FixtureStep,
  options: RunOptions,
  fetchImpl: typeof fetch
): Promise<Response> {
  if (step.upload) {
    // Straight to storage, like the browser: never through `fetchImpl`, which
    // may be an in-process server.
    return fetch(step.upload.url, {
      method: "PUT",
      headers: step.upload.headers,
      body: new Uint8Array(step.upload.size),
    });
  }

  if (step.store || step.head) {
    const storage = options.storage;
    if (!storage) throw new Error("this step needs --storage");
    return step.store
      ? storageRequest(storage, "PUT", step.store.key, {
          body: new Uint8Array(step.store.size),
          contentType: step.store.type,
        })
      : storageRequest(storage, "HEAD", step.head!.key);
  }

  const request = step.request ?? {};
  const method = request.method ?? "POST";

  const url = new URL(options.url, "http://localhost");
  for (const [key, value] of Object.entries(request.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { ...options.headers, ...request.headers };

  let body: string | undefined;
  if (method !== "GET") {
    body = request.rawBody ?? JSON.stringify(request.body ?? {});
    // Only defaulted, so a fixture can deliberately send the wrong type.
    headers["content-type"] ??= "application/json";
  }

  return fetchImpl(url.toString(), { method, headers, body });
}

/** Checks a response against an expectation; returns the parsed body too. */
async function check(
  response: Response,
  expect: FixtureExpectation,
  prefix: string
): Promise<{ mismatches: Mismatch[]; body: unknown }> {
  const mismatches: Mismatch[] = [];

  if (expect.status !== undefined && response.status !== expect.status) {
    mismatches.push({
      path: `${prefix}status`,
      expected: String(expect.status),
      actual: String(response.status),
    });
  }

  for (const [key, value] of Object.entries(expect.headers ?? {})) {
    const actual = response.headers.get(key);
    // Expectations are patterns here too, so a fixture can assert a header is
    // present without pinning its value.
    mismatches.push(...match(value, actual ?? undefined, `${prefix}headers.${key}`));
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text === "" ? undefined : JSON.parse(text);
  } catch {
    if (expect.body !== undefined) {
      mismatches.push({ path: `${prefix}body`, expected: "valid JSON", actual: text.slice(0, 120) });
    }
    return { mismatches, body: undefined };
  }

  if (expect.body !== undefined) {
    mismatches.push(
      ...match(expect.body, body).map((m) => ({ ...m, path: `${prefix}${m.path}` }))
    );
  }

  return { mismatches, body };
}

/** Runs one fixture against a server and reports how the responses differed. */
export async function runFixture(
  fixture: Fixture,
  options: RunOptions
): Promise<CaseResult> {
  const reason = unmet(fixture, options);
  if (reason) {
    return { fixture, passed: true, mismatches: [], skipped: true, skipReason: reason };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const secret =
    options.receiptSecret ?? options.storage?.secretAccessKey ?? "conformance-secret";
  const saved = new Map<string, unknown>();
  const steps = stepsOf(fixture);

  for (const [index, raw] of steps.entries()) {
    // Steps are numbered in failures only when there is more than one.
    const prefix = steps.length > 1 ? `step ${index + 1}: ` : "";

    let step: FixtureStep;
    let response: Response;
    try {
      step = resolve(raw, saved, secret) as FixtureStep;
      response = await perform(step, options, fetchImpl);
    } catch (error) {
      return {
        fixture,
        passed: false,
        mismatches: [],
        error: `${prefix}request failed: ${(error as Error).message}`,
      };
    }

    const { mismatches, body } = await check(response, step.expect ?? {}, prefix);
    if (mismatches.length > 0) return { fixture, passed: false, mismatches };

    for (const [name, path] of Object.entries(step.save ?? {})) {
      saved.set(name, pick(body, path));
    }
  }

  return { fixture, passed: true, mismatches: [] };
}

/** Runs every fixture in order and returns each result. */
export async function runAll(
  fixtures: Fixture[],
  options: RunOptions & { features?: Set<string> }
): Promise<CaseResult[]> {
  const features = options.features ?? (await detectFeatures(options));
  const results: CaseResult[] = [];

  // Sequential on purpose: a failing implementation is easier to read when the
  // output order matches the fixture order, and later steps of a case depend
  // on earlier ones.
  for (const fixture of fixtures) {
    const reason = unmet(fixture, options, features);
    if (reason) {
      results.push({ fixture, passed: true, mismatches: [], skipped: true, skipReason: reason });
      continue;
    }
    results.push(await runFixture(fixture, options));
  }

  return results;
}

/** Human-readable report; the same text the CLI prints. */
export function formatResults(results: CaseResult[]): string {
  const lines: string[] = [];

  for (const result of results) {
    if (result.skipped) {
      lines.push(`SKIP  ${result.fixture.name} (${result.skipReason})`);
      continue;
    }

    lines.push(`${result.passed ? "PASS" : "FAIL"}  ${result.fixture.name}`);

    if (result.passed) continue;

    if (result.fixture.spec) lines.push(`        spec: ${result.fixture.spec}`);
    if (result.fixture.why) lines.push(`        why:  ${result.fixture.why}`);
    if (result.error) lines.push(`        ${result.error}`);

    for (const mismatch of result.mismatches) {
      lines.push(
        `        ${mismatch.path}: expected ${mismatch.expected}, got ${mismatch.actual}`
      );
    }
  }

  const failed = results.filter((result) => !result.passed).length;
  const skipped = results.filter((result) => result.skipped).length;
  const ran = results.length - skipped;

  lines.push("");
  const suffix = skipped > 0 ? ` (${skipped} skipped)` : "";
  lines.push(
    failed === 0
      ? `All ${ran} conformance cases passed${suffix}.`
      : `${failed} of ${ran} conformance cases failed${suffix}.`
  );

  return lines.join("\n");
}
