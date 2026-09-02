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

/** A single conformance case, as stored in `fixtures/*.json`. */
export interface Fixture {
  name: string;
  /** Section of `protocol.mdx` this case comes from. */
  spec?: string;
  /** Why the rule exists, for a reader who fails this case. */
  why?: string;
  request: {
    method?: "GET" | "POST";
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: unknown;
    /** Send the body exactly as given, rather than as JSON. */
    rawBody?: string;
  };
  expect: {
    status?: number;
    /** Matched case-insensitively, as HTTP headers are. */
    headers?: Record<string, string>;
    body?: unknown;
  };
}

export interface CaseResult {
  fixture: Fixture;
  passed: boolean;
  mismatches: Mismatch[];
  /** Present when the request could not be made at all. */
  error?: string;
}

/** Sends one fixture and reports how the response differed. */
export async function runFixture(
  fixture: Fixture,
  options: {
    url: string;
    fetchImpl?: typeof fetch;
    /** Sent on every request; the suite's auth cases override it. */
    headers?: Record<string, string>;
  }
): Promise<CaseResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const method = fixture.request.method ?? "POST";

  const url = new URL(options.url, "http://localhost");
  for (const [key, value] of Object.entries(fixture.request.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {
    ...options.headers,
    ...fixture.request.headers,
  };

  let body: string | undefined;
  if (method !== "GET") {
    body =
      fixture.request.rawBody ?? JSON.stringify(fixture.request.body ?? {});
    // Only defaulted, so a fixture can deliberately send the wrong type.
    headers["content-type"] ??= "application/json";
  }

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), { method, headers, body });
  } catch (error) {
    return {
      fixture,
      passed: false,
      mismatches: [],
      error: `request failed: ${(error as Error).message}`,
    };
  }

  const mismatches: Mismatch[] = [];

  if (
    fixture.expect.status !== undefined &&
    response.status !== fixture.expect.status
  ) {
    mismatches.push({
      path: "status",
      expected: String(fixture.expect.status),
      actual: String(response.status),
    });
  }

  for (const [key, value] of Object.entries(fixture.expect.headers ?? {})) {
    const actual = response.headers.get(key);
    // Expectations are patterns here too, so a fixture can assert a header is
    // present without pinning its value.
    const failures = match(value, actual ?? undefined, `headers.${key}`);
    mismatches.push(...failures);
  }

  if (fixture.expect.body !== undefined) {
    const text = await response.text();
    let parsed: unknown;

    try {
      parsed = text === "" ? undefined : JSON.parse(text);
    } catch {
      mismatches.push({
        path: "body",
        expected: "valid JSON",
        actual: text.slice(0, 120),
      });
      return { fixture, passed: false, mismatches };
    }

    mismatches.push(...match(fixture.expect.body, parsed));
  }

  return { fixture, passed: mismatches.length === 0, mismatches };
}

/** Runs every fixture in order and returns each result. */
export async function runAll(
  fixtures: Fixture[],
  options: Parameters<typeof runFixture>[1]
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  // Sequential on purpose: a failing implementation is easier to read when the
  // output order matches the fixture order, and the suite is small.
  for (const fixture of fixtures) {
    results.push(await runFixture(fixture, options));
  }
  return results;
}

/** Human-readable report; the same text the CLI prints. */
export function formatResults(results: CaseResult[]): string {
  const lines: string[] = [];

  for (const result of results) {
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
  lines.push("");
  lines.push(
    failed === 0
      ? `All ${results.length} conformance cases passed.`
      : `${failed} of ${results.length} conformance cases failed.`
  );

  return lines.join("\n");
}
