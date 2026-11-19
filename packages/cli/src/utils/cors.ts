/**
 * @fileoverview Deciding whether a bucket's CORS lets the browser upload, and
 * changing its rules so it does — everything but sending the requests.
 *
 * What the browser needs comes from the library (`corsRequirements` in
 * `pushduck/providers`); this file evaluates rules and preflight answers
 * against it, and merges origins into existing rules. `commands/cors.ts`
 * does the I/O.
 *
 * Rule evaluation follows S3: a request is served by the **first** rule that
 * allows its origin, its method and every header it sends, and only that
 * rule's `ExposeHeaders` apply. A later rule that would expose `ETag` does
 * not help when an earlier one matches first.
 */

import {
  PutBucketCorsCommand,
  type CORSRule as S3CorsRule,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import {
  corsRequirements,
  corsRule,
  CORS_RULE_ID,
  type CorsRequirement,
  type CorsRule,
  type StorageTarget,
} from "pushduck/providers";

type AclSupport = Pick<StorageTarget, "supportsAcl">;

// ========================================
// Origins
// ========================================

/**
 * An origin as the browser sends it: `scheme://host[:port]`, lowercase, no
 * trailing slash. Patterns (`*`, `https://*.example.com`) are accepted only
 * where a rule is being written — a check needs a real origin to send.
 *
 * @throws {Error} For anything that is not an origin, most often a URL with
 *   a path, which no browser sends and no bucket rule would match
 */
export function normalizeOrigin(
  input: string,
  { allowPattern }: { allowPattern: boolean }
): string {
  const value = input.trim().replace(/\/+$/, "");

  if (value === "*" && allowPattern) return value;

  const match = /^(https?):\/\/([^/?#\s]+)$/i.exec(value);
  if (!match) {
    throw new Error(
      `"${input}" is not an origin — use scheme://host[:port] with no path, e.g. http://localhost:3000`
    );
  }

  const wildcards = value.split("*").length - 1;
  if (wildcards > 0 && !allowPattern) {
    throw new Error(
      `"${input}" is a pattern — check needs the exact origin a browser sends, e.g. https://app.example.com`
    );
  }
  if (wildcards > 1) {
    throw new Error(`"${input}" has more than one "*" — bucket rules allow one`);
  }

  return value.toLowerCase();
}

/** S3 origin matching: exact, or one `*` standing for any run of characters. */
function originMatches(pattern: string, origin: string): boolean {
  if (!pattern.includes("*")) return pattern === origin;
  const [before, after] = pattern.split("*");
  return (
    origin.length >= before.length + after.length &&
    origin.startsWith(before) &&
    origin.endsWith(after)
  );
}

/** Header names compare case-insensitively; `*` in an allowed name is a wildcard. */
function headerMatches(pattern: string, header: string): boolean {
  return originMatches(pattern.toLowerCase(), header.toLowerCase());
}

function exposes(exposed: readonly string[], name: string): boolean {
  return exposed.some((h) => h === "*" || h.toLowerCase() === name);
}

// ========================================
// Bucket rules
// ========================================

/** How a bucket's rules answer one requirement for one origin. */
export interface RuleVerdict {
  requirement: CorsRequirement;
  /** Index of the rule that serves the request, or -1 when none does. */
  ruleIndex: number;
  /** Why no rule serves it. Empty when one does. */
  reason: string;
  /** Required response headers the serving rule does not expose. */
  hidden: string[];
}

/**
 * Evaluates bucket rules for each requirement, as the provider would.
 */
export function evaluateRules(
  rules: readonly CorsRule[],
  origin: string,
  requirements: readonly CorsRequirement[]
): RuleVerdict[] {
  return requirements.map((requirement) => {
    const forOrigin = rules.filter((rule) =>
      rule.allowedOrigins.some((pattern) => originMatches(pattern, origin))
    );
    const withMethod = forOrigin.filter((rule) =>
      rule.allowedMethods.includes(requirement.method)
    );
    const serving = withMethod.find((rule) =>
      requirement.headers.every((header) =>
        rule.allowedHeaders.some((pattern) => headerMatches(pattern, header))
      )
    );

    if (!serving) {
      const blockedHeader = requirement.headers.find(
        (header) =>
          !withMethod.some((rule) =>
            rule.allowedHeaders.some((pattern) => headerMatches(pattern, header))
          )
      );
      const reason =
        forOrigin.length === 0
          ? "no rule allows this origin"
          : withMethod.length === 0
            ? `no rule for this origin allows ${requirement.method}`
            : `no rule for this origin allows the ${blockedHeader} header`;
      return { requirement, ruleIndex: -1, reason, hidden: requirement.exposes };
    }

    return {
      requirement,
      ruleIndex: rules.indexOf(serving),
      reason: "",
      hidden: requirement.exposes.filter(
        (name) => !exposes(serving.exposeHeaders, name)
      ),
    };
  });
}

/** Whether the rules give this origin everything the client needs. */
export function rulesAllow(
  rules: readonly CorsRule[],
  origin: string,
  target: AclSupport
): boolean {
  return evaluateRules(rules, origin, corsRequirements(target)).every(
    (verdict) => verdict.ruleIndex >= 0 && verdict.hidden.length === 0
  );
}

/**
 * Adds origins to the bucket's rules so each gets everything the client
 * needs, leaving every other rule as it was.
 *
 * Origins the rules already serve are left alone. The rest go into
 * pushduck's own rule (`ID: "pushduck"`) — extended if it exists, created
 * from `corsRule` if not — which is placed first. First matters: S3 uses the
 * first rule that matches, so an earlier rule that allows the origin but
 * hides `ETag` would otherwise keep winning. Putting it first changes nothing
 * for other origins, which it does not list, and a method it does not allow
 * still falls through to the rules after it.
 *
 * @returns The new rules, and the origins that were added (empty when the
 *   rules already allowed every origin, in which case `rules` is returned
 *   unchanged)
 */
export function mergeOrigins(
  rules: readonly CorsRule[],
  origins: readonly string[],
  target: AclSupport
): { rules: CorsRule[]; added: string[] } {
  const added = [...new Set(origins)].filter(
    (origin) => !rulesAllow(rules, origin, target)
  );
  if (added.length === 0) return { rules: [...rules], added };

  const required = corsRule(added, target);
  const index = rules.findIndex((rule) => rule.id === CORS_RULE_ID);
  const own = index >= 0 ? rules[index] : { ...required, allowedOrigins: [] };

  const merged: CorsRule = {
    ...own,
    allowedOrigins: union(own.allowedOrigins, added),
    allowedMethods: union(own.allowedMethods, required.allowedMethods),
    allowedHeaders: unionIgnoringCase(own.allowedHeaders, required.allowedHeaders),
    exposeHeaders: unionIgnoringCase(own.exposeHeaders, required.exposeHeaders),
    maxAgeSeconds: own.maxAgeSeconds ?? required.maxAgeSeconds,
  };

  return {
    rules: [merged, ...rules.filter((_, i) => i !== index)],
    added,
  };
}

function union(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

function unionIgnoringCase(a: readonly string[], b: readonly string[]): string[] {
  const seen = new Set(a.map((h) => h.toLowerCase()));
  return [...a, ...b.filter((h) => !seen.has(h.toLowerCase()))];
}

// ========================================
// S3 wire shape
// ========================================

/** From the S3 `CORSRule` shape `GetBucketCors` returns. */
export function fromS3Rule(rule: S3CorsRule): CorsRule {
  return {
    ...(rule.ID ? { id: rule.ID } : {}),
    allowedOrigins: rule.AllowedOrigins ?? [],
    allowedMethods: rule.AllowedMethods ?? [],
    allowedHeaders: rule.AllowedHeaders ?? [],
    exposeHeaders: rule.ExposeHeaders ?? [],
    ...(rule.MaxAgeSeconds !== undefined ? { maxAgeSeconds: rule.MaxAgeSeconds } : {}),
  };
}

/**
 * To the S3 `CORSRule` shape `PutBucketCors` takes. Empty lists are left out
 * rather than sent as empty elements.
 */
export function toS3Rule(rule: CorsRule): S3CorsRule {
  return {
    ...(rule.id ? { ID: rule.id } : {}),
    AllowedOrigins: rule.allowedOrigins,
    AllowedMethods: rule.allowedMethods,
    ...(rule.allowedHeaders.length ? { AllowedHeaders: rule.allowedHeaders } : {}),
    ...(rule.exposeHeaders.length ? { ExposeHeaders: rule.exposeHeaders } : {}),
    ...(rule.maxAgeSeconds !== undefined ? { MaxAgeSeconds: rule.maxAgeSeconds } : {}),
  };
}

/**
 * `PutBucketCors` for these rules, with a `Content-MD5` as well as the SDK's
 * CRC32: S3 long required the MD5 on this call, and S3-compatible services
 * that predate the SDK's newer checksums still reject the request without it.
 */
export function putBucketCors(
  bucket: string,
  rules: readonly CorsRule[]
): PutBucketCorsCommand {
  const command = new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: { CORSRules: rules.map(toS3Rule) },
  });
  command.middlewareStack.add(
    (next) => async (args) => {
      const request = args.request as {
        headers?: Record<string, string>;
        body?: unknown;
      };
      if (request.headers && typeof request.body === "string") {
        request.headers["content-md5"] = createHash("md5")
          .update(request.body)
          .digest("base64");
      }
      return next(args);
    },
    { step: "build", name: "pushduckContentMd5" }
  );
  return command;
}

/**
 * A line diff of two rule sets, in the S3 JSON people paste into consoles:
 * unchanged lines start with two spaces, removed with `- `, added with `+ `.
 */
export function diffRules(
  before: readonly CorsRule[],
  after: readonly CorsRule[]
): string[] {
  const render = (rules: readonly CorsRule[]) =>
    JSON.stringify({ CORSRules: rules.map(toS3Rule) }, null, 2).split("\n");
  const a = render(before);
  const b = render(after);

  // Longest common subsequence, then walk it. Rule sets are a few dozen lines.
  const lcs = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push(`  ${a[i++]}`);
      j++;
    } else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      lines.push(`+ ${b[j++]}`);
    } else {
      lines.push(`- ${a[i++]}`);
    }
  }
  return lines;
}

// ========================================
// Preflight — what the bucket actually answers
// ========================================

/** An HTTP response, reduced to what CORS reads. Header names lowercase. */
export interface HttpAnswer {
  status: number;
  headers: Record<string, string | undefined>;
}

/** The headers a browser sends on the preflight for this request. */
export function preflightHeaders(
  origin: string,
  requirement: CorsRequirement
): Record<string, string> {
  return {
    Origin: origin,
    "Access-Control-Request-Method": requirement.method,
    ...(requirement.headers.length
      ? { "Access-Control-Request-Headers": requirement.headers.join(",") }
      : {}),
  };
}

function listHeader(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether a browser would accept this preflight answer and send the request.
 *
 * Mirrors the browser's own check: a 2xx status, the origin allowed, the
 * method listed, and every requested header listed. `*` counts: pushduck's
 * uploads are sent without credentials.
 */
export function readPreflight(
  answer: HttpAnswer,
  origin: string,
  requirement: CorsRequirement
): { allowed: boolean; detail: string } {
  const allowOrigin = answer.headers["access-control-allow-origin"];

  if (answer.status < 200 || answer.status >= 300) {
    return { allowed: false, detail: `preflight rejected (HTTP ${answer.status})` };
  }
  // MinIO refuses an origin it does not list this way: 204, no CORS headers.
  if (!allowOrigin) {
    return { allowed: false, detail: "preflight does not allow this origin" };
  }
  if (allowOrigin !== "*" && allowOrigin !== origin) {
    return { allowed: false, detail: `preflight allows ${allowOrigin}, not this origin` };
  }

  const methods = listHeader(answer.headers["access-control-allow-methods"]);
  if (!methods.includes("*") && !methods.includes(requirement.method.toLowerCase())) {
    return { allowed: false, detail: `preflight does not allow ${requirement.method}` };
  }

  const headers = listHeader(answer.headers["access-control-allow-headers"]);
  const blocked = requirement.headers.find(
    (header) => !headers.includes("*") && !headers.includes(header)
  );
  if (blocked) {
    return { allowed: false, detail: `preflight does not allow the ${blocked} header` };
  }

  return { allowed: true, detail: "preflight allowed" };
}

/**
 * Which of `names` an actual (non-preflight) response lets the page read, or
 * `undefined` when the response carries no CORS headers for this origin and
 * so says nothing either way. Exposed headers are only ever sent on actual
 * responses, never on a preflight.
 */
export function readExposed(
  answer: HttpAnswer,
  origin: string,
  names: readonly string[]
): string[] | undefined {
  const allowOrigin = answer.headers["access-control-allow-origin"];
  if (allowOrigin !== "*" && allowOrigin !== origin) return undefined;

  const exposed = listHeader(answer.headers["access-control-expose-headers"]);
  return names.filter((name) => !exposes(exposed, name));
}

// ========================================
// The report
// ========================================

export type CheckStatus = "pass" | "fail" | "unknown";

export interface CheckLine {
  label: string;
  status: CheckStatus;
  detail: string;
}

/** What was learned about one origin. Anything that could not be read is `undefined`. */
export interface OriginEvidence {
  /** The bucket's rules, when the provider lets them be read. */
  rules?: readonly CorsRule[];
  /** One preflight answer per requirement. */
  preflights: readonly (HttpAnswer | undefined)[];
  /**
   * The answer to an actual upload `PUT` from this origin — one that cannot
   * succeed, so nothing is written. Exposed headers appear only on actual
   * responses, and only the rule that serves `PUT` decides them.
   */
  actual?: HttpAnswer;
}

/**
 * One line per thing the browser needs, for one origin.
 *
 * The preflight is the ground truth for whether a request is allowed — it is
 * the bucket's own answer, and it is all there is where rules cannot be read
 * (MinIO's CORS is server-wide; GCS keeps its rules outside the S3 API).
 * Whether `ETag` is readable comes from an actual response when it carries
 * CORS headers, and from the rules otherwise.
 */
export function reportOrigin(
  origin: string,
  requirements: readonly CorsRequirement[],
  evidence: OriginEvidence
): CheckLine[] {
  const verdicts = evidence.rules
    ? evaluateRules(evidence.rules, origin, requirements)
    : undefined;
  const lines: CheckLine[] = [];

  requirements.forEach((requirement, index) => {
    const label = `${requirement.purpose} (${[requirement.method, ...requirement.headers].join(", ")})`;
    const answer = evidence.preflights[index];
    const verdict = verdicts?.[index];

    if (answer) {
      const { allowed, detail } = readPreflight(answer, origin, requirement);
      const note =
        verdict && allowed && verdict.ruleIndex < 0
          ? " — by a server-wide setting, not a bucket rule"
          : verdict && !allowed && verdict.ruleIndex < 0
            ? ` — ${verdict.reason}`
            : "";
      lines.push({ label, status: allowed ? "pass" : "fail", detail: detail + note });
    } else if (verdict) {
      lines.push({
        label,
        status: verdict.ruleIndex >= 0 ? "pass" : "fail",
        detail:
          verdict.ruleIndex >= 0
            ? `allowed by rule ${verdict.ruleIndex + 1} (preflight not sent)`
            : verdict.reason,
      });
    } else {
      lines.push({ label, status: "unknown", detail: "could not send a preflight or read the rules" });
    }

    for (const name of requirement.exposes) {
      const header = name === "etag" ? "ETag" : name;
      const exposeLabel = `${header} readable after ${requirement.purpose}`;
      const fromResponse = evidence.actual
        ? readExposed(evidence.actual, origin, [name])
        : undefined;
      const hiddenByRule =
        verdict && verdict.ruleIndex >= 0 ? verdict.hidden.includes(name) : undefined;

      if (fromResponse !== undefined) {
        lines.push(
          fromResponse.length === 0
            ? { label: exposeLabel, status: "pass", detail: "exposed by the bucket's response" }
            : {
                label: exposeLabel,
                status: "fail",
                detail: `not exposed — multipart uploads fail; add ${header} to ExposeHeaders`,
              }
        );
      } else if (hiddenByRule !== undefined) {
        lines.push(
          hiddenByRule
            ? {
                label: exposeLabel,
                status: "fail",
                detail: `rule ${verdict!.ruleIndex + 1} serves this origin but does not expose ${header} — multipart uploads fail`,
              }
            : { label: exposeLabel, status: "pass", detail: `exposed by rule ${verdict!.ruleIndex + 1}` }
        );
      } else {
        lines.push({
          label: exposeLabel,
          status: "unknown",
          detail: "could not tell — make sure the bucket's CORS exposes it",
        });
      }
    }
  });

  return lines;
}
