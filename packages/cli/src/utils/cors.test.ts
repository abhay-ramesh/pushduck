/**
 * @fileoverview Deciding whether bucket CORS lets the browser upload, and
 * merging origins into a bucket's rules.
 *
 * The cases come from real apps: a dev server on a port the bucket does not
 * list (Conductor worktrees, so apps pinned port 3000 or built proxy routes),
 * a production origin missing from the prod bucket, and rules that allow the
 * PUT but hide `ETag`, which breaks multipart uploads only.
 */

import { corsRequirements, type CorsRule } from "pushduck/providers";
import { describe, expect, it } from "vitest";
import {
  diffRules,
  evaluateRules,
  fromS3Rule,
  mergeOrigins,
  normalizeOrigin,
  readExposed,
  readPreflight,
  reportOrigin,
  rulesAllow,
  toS3Rule,
} from "./cors";

const R2 = { supportsAcl: false };
const AWS = { supportsAcl: true };
const [UPLOAD, DOWNLOAD] = corsRequirements(AWS);

function rule(partial: Partial<CorsRule>): CorsRule {
  return {
    allowedOrigins: ["http://localhost:3000"],
    allowedMethods: ["GET", "PUT", "HEAD"],
    allowedHeaders: ["*"],
    exposeHeaders: ["ETag"],
    maxAgeSeconds: 3600,
    ...partial,
  };
}

describe("normalizeOrigin", () => {
  it("lowercases and drops a trailing slash", () => {
    expect(normalizeOrigin("HTTPS://App.Example.com/", { allowPattern: false })).toBe(
      "https://app.example.com"
    );
  });

  it("rejects a URL with a path — no browser sends one as Origin", () => {
    expect(() =>
      normalizeOrigin("https://app.example.com/upload", { allowPattern: false })
    ).toThrow(/not an origin/);
  });

  it("accepts a pattern only where a rule is written", () => {
    expect(normalizeOrigin("https://*.example.com", { allowPattern: true })).toBe(
      "https://*.example.com"
    );
    expect(normalizeOrigin("*", { allowPattern: true })).toBe("*");
    expect(() =>
      normalizeOrigin("https://*.example.com", { allowPattern: false })
    ).toThrow(/pattern/);
    expect(() =>
      normalizeOrigin("https://*.*.example.com", { allowPattern: true })
    ).toThrow(/more than one/);
  });
});

describe("evaluateRules", () => {
  it("passes an origin a rule lists, with its headers allowed and ETag exposed", () => {
    expect(rulesAllow([rule({})], "http://localhost:3000", AWS)).toBe(true);
  });

  it("fails a dev server on another port and says why", () => {
    const [upload] = evaluateRules([rule({})], "http://localhost:51234", [UPLOAD]);
    expect(upload).toMatchObject({ ruleIndex: -1, reason: "no rule allows this origin" });
  });

  it("matches one * in an origin pattern", () => {
    const rules = [rule({ allowedOrigins: ["https://*.vercel.app"] })];
    expect(rulesAllow(rules, "https://pr-12.vercel.app", AWS)).toBe(true);
    expect(rulesAllow(rules, "https://vercel.app.evil.com", AWS)).toBe(false);
  });

  it("names a header the rule does not allow", () => {
    const rules = [rule({ allowedHeaders: ["content-type"] })];
    // x-amz-acl is sent where ACLs are signed in (AWS), not on R2
    expect(evaluateRules(rules, "http://localhost:3000", [UPLOAD])[0].reason).toBe(
      "no rule for this origin allows the x-amz-acl header"
    );
    expect(rulesAllow(rules, "http://localhost:3000", R2)).toBe(true);
  });

  it("compares header names case-insensitively and honours header wildcards", () => {
    const rules = [rule({ allowedHeaders: ["Content-Type", "x-amz-*"] })];
    expect(rulesAllow(rules, "http://localhost:3000", AWS)).toBe(true);
  });

  it("uses the first matching rule: a later rule exposing ETag does not help", () => {
    const rules = [
      rule({ exposeHeaders: [] }),
      rule({ exposeHeaders: ["ETag"] }),
    ];
    const [upload] = evaluateRules(rules, "http://localhost:3000", [UPLOAD]);
    expect(upload).toMatchObject({ ruleIndex: 0, hidden: ["etag"] });
  });

  it("reports a method no rule for the origin allows", () => {
    const rules = [rule({ allowedMethods: ["GET"] })];
    expect(evaluateRules(rules, "http://localhost:3000", [UPLOAD])[0].reason).toBe(
      "no rule for this origin allows PUT"
    );
  });
});

describe("mergeOrigins", () => {
  const unrelated = rule({
    allowedOrigins: ["https://other.example.com"],
    allowedMethods: ["GET"],
    allowedHeaders: [],
    exposeHeaders: [],
  });

  it("changes nothing when every origin already passes", () => {
    const rules = [rule({ allowedOrigins: ["*"] })];
    expect(mergeOrigins(rules, ["http://localhost:4000"], AWS)).toEqual({
      rules,
      added: [],
    });
  });

  it("adds pushduck's rule first and keeps unrelated rules as they were", () => {
    const { rules, added } = mergeOrigins([unrelated], ["https://app.example.com"], R2);

    expect(added).toEqual(["https://app.example.com"]);
    expect(rules).toEqual([
      {
        id: "pushduck",
        allowedOrigins: ["https://app.example.com"],
        allowedMethods: ["PUT", "GET"],
        allowedHeaders: ["content-type"],
        exposeHeaders: ["ETag"],
        maxAgeSeconds: 3600,
      },
      unrelated,
    ]);
  });

  it("extends pushduck's existing rule instead of adding another, moving it first", () => {
    const own = { ...rule({ allowedOrigins: ["http://localhost:3000"] }), id: "pushduck" };
    const { rules } = mergeOrigins([unrelated, own], ["https://app.example.com"], AWS);

    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({
      id: "pushduck",
      allowedOrigins: ["http://localhost:3000", "https://app.example.com"],
      allowedMethods: ["GET", "PUT", "HEAD"],
      allowedHeaders: ["*", "content-type", "x-amz-acl"],
    });
    expect(rules[1]).toBe(unrelated);
  });

  it("fixes an origin an earlier rule serves without ETag — by going before it", () => {
    const hidesEtag = rule({ exposeHeaders: [] });
    const { rules, added } = mergeOrigins([hidesEtag], ["http://localhost:3000"], R2);

    expect(added).toEqual(["http://localhost:3000"]);
    expect(rulesAllow(rules, "http://localhost:3000", R2)).toBe(true);
    expect(rules[1]).toBe(hidesEtag);
  });

  it("leaves every given origin passing", () => {
    const origins = ["http://localhost:3000", "http://localhost:51234", "https://app.example.com"];
    const { rules } = mergeOrigins([unrelated, rule({ exposeHeaders: [] })], origins, AWS);
    for (const origin of origins) expect(rulesAllow(rules, origin, AWS)).toBe(true);
    expect(rulesAllow(rules, "https://other.example.com", AWS)).toBe(false);
  });
});

describe("S3 shape", () => {
  it("round-trips a rule and leaves out empty lists", () => {
    const original = { ID: "x", AllowedOrigins: ["*"], AllowedMethods: ["GET"], MaxAgeSeconds: 10 };
    expect(toS3Rule(fromS3Rule(original))).toEqual(original);
  });
});

describe("diffRules", () => {
  it("marks added and removed lines, keeping the rest as context", () => {
    const before = [rule({ allowedOrigins: ["http://localhost:3000"] })];
    const after = [rule({ allowedOrigins: ["http://localhost:3000", "https://app.example.com"] })];
    const lines = diffRules(before, after);

    expect(lines.filter((l) => l.startsWith("+ "))).toEqual([
      '+         "http://localhost:3000",',
      '+         "https://app.example.com"',
    ]);
    expect(lines.filter((l) => l.startsWith("- "))).toEqual([
      '-         "http://localhost:3000"',
    ]);
    expect(lines.filter((l) => l.startsWith("  ")).length).toBeGreaterThan(5);
  });
});

describe("readPreflight", () => {
  const origin = "http://localhost:3000";
  const ok = {
    status: 200,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, PUT",
      "access-control-allow-headers": "content-type, x-amz-acl",
    },
  };

  it("accepts what a browser accepts", () => {
    expect(readPreflight(ok, origin, UPLOAD)).toEqual({ allowed: true, detail: "preflight allowed" });
  });

  it("rejects a 403, as R2 sends for an origin with no rule", () => {
    expect(readPreflight({ status: 403, headers: {} }, origin, UPLOAD).detail).toBe(
      "preflight rejected (HTTP 403)"
    );
  });

  it("rejects a success status without CORS headers, as MinIO answers an unlisted origin", () => {
    expect(readPreflight({ status: 204, headers: {} }, origin, UPLOAD).detail).toBe(
      "preflight does not allow this origin"
    );
  });

  it("rejects a missing method or header", () => {
    const noPut = { ...ok, headers: { ...ok.headers, "access-control-allow-methods": "GET" } };
    expect(readPreflight(noPut, origin, UPLOAD).detail).toBe("preflight does not allow PUT");
    const noAcl = { ...ok, headers: { ...ok.headers, "access-control-allow-headers": "content-type" } };
    expect(readPreflight(noAcl, origin, UPLOAD).detail).toBe(
      "preflight does not allow the x-amz-acl header"
    );
  });

  it("accepts wildcards: uploads carry no credentials", () => {
    const star = {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "*",
        "access-control-allow-headers": "*",
      },
    };
    expect(readPreflight(star, origin, UPLOAD).allowed).toBe(true);
  });
});

describe("readExposed", () => {
  it("says nothing about a response without CORS headers", () => {
    expect(readExposed({ status: 403, headers: {} }, "http://a.test", ["etag"])).toBeUndefined();
  });

  it("lists what is hidden — MinIO exposes Etag by default", () => {
    const minio = {
      status: 403,
      headers: {
        "access-control-allow-origin": "http://a.test",
        "access-control-expose-headers": "Date, Etag, Server",
      },
    };
    expect(readExposed(minio, "http://a.test", ["etag"])).toEqual([]);
  });
});

describe("reportOrigin", () => {
  const origin = "http://localhost:51234";
  const allowed = (method: string) => ({
    status: 200,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": method,
      "access-control-allow-headers": "content-type, x-amz-acl",
    },
  });

  it("trusts the preflight over the rules, and says when no rule is behind it", () => {
    const lines = reportOrigin(origin, [UPLOAD, DOWNLOAD], {
      rules: [],
      preflights: [allowed("PUT"), allowed("GET")],
      actual: {
        status: 403,
        headers: { "access-control-allow-origin": origin, "access-control-expose-headers": "ETag" },
      },
    });

    expect(lines.map((l) => l.status)).toEqual(["pass", "pass", "pass"]);
    expect(lines[0].detail).toContain("server-wide setting");
  });

  it("fails ETag from the rules when the response says nothing", () => {
    const lines = reportOrigin(origin, [UPLOAD], {
      rules: [rule({ allowedOrigins: [origin], exposeHeaders: [] })],
      preflights: [allowed("PUT")],
      actual: { status: 403, headers: {} },
    });

    expect(lines[1]).toMatchObject({ label: "ETag readable after upload", status: "fail" });
    expect(lines[1].detail).toMatch(/multipart uploads fail/);
  });

  it("is unknown, not passing, when nothing could be learned", () => {
    const lines = reportOrigin(origin, [UPLOAD], { preflights: [undefined] });
    expect(lines.map((l) => l.status)).toEqual(["unknown", "unknown"]);
  });

  it("falls back to the rules when the preflight could not be sent", () => {
    const lines = reportOrigin(origin, [UPLOAD], {
      rules: [rule({ allowedOrigins: ["http://localhost:3000"] })],
      preflights: [undefined],
    });
    expect(lines[0]).toMatchObject({ status: "fail", detail: "no rule allows this origin" });
  });
});
