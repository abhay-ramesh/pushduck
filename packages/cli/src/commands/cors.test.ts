/**
 * @fileoverview `pushduck cors check|apply` against a local fake bucket.
 *
 * The fake answers the S3 API the way R2 and S3 do — `GET|PUT ?cors` and
 * preflight `OPTIONS` evaluated against the stored rules — and records every
 * request, so these tests pin what the commands send as well as what they
 * conclude.
 */

import { createHash } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const found = vi.hoisted(() => ({
  value: undefined as
    | { provider: string; credentials: Record<string, string> }
    | undefined,
}));

vi.mock("../utils/provider-setup", async (importActual) => ({
  ...(await importActual<typeof import("../utils/provider-setup")>()),
  // The bucket under test, instead of the developer's environment.
  findConfiguredProvider: async () => found.value,
}));

const { corsApplyCommand, corsCheckCommand } = await import("./cors");

interface Seen {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

const UNRELATED = `<CORSRule><AllowedOrigin>https://other.example.com</AllowedOrigin><AllowedMethod>GET</AllowedMethod></CORSRule>`;
const DEV_ONLY = `<CORSRule><AllowedOrigin>http://localhost:3000</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader></CORSRule>`;

/** A bucket named `b` whose CORS is `rules` (S3 XML), or none. */
function fakeBucket(state: { rules?: string; denyPut?: boolean }) {
  const seen: Seen[] = [];

  const ruleBlocks = () => state.rules?.match(/<CORSRule>.*?<\/CORSRule>/gs) ?? [];
  const values = (block: string, tag: string) =>
    [...block.matchAll(new RegExp(`<${tag}>(.*?)</${tag}>`, "g"))].map((m) => m[1]);
  const serving = (origin: string, method: string) =>
    ruleBlocks().find(
      (block) =>
        values(block, "AllowedOrigin").some((o) => o === "*" || o === origin) &&
        values(block, "AllowedMethod").includes(method)
    );

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      seen.push({ method: req.method!, url: req.url!, headers: req.headers, body });
      const origin = req.headers.origin ?? "";
      // The SDK addresses the bucket subresource as /b/?cors=
      const isCors = req.url === "/b/?cors=";

      if (isCors && req.method === "GET") {
        if (!state.rules) {
          res.writeHead(404, { "content-type": "application/xml" }).end(
            "<Error><Code>NoSuchCORSConfiguration</Code><Message>The CORS configuration does not exist</Message></Error>"
          );
          return;
        }
        res.writeHead(200, { "content-type": "application/xml" }).end(
          `<CORSConfiguration>${state.rules}</CORSConfiguration>`
        );
        return;
      }

      if (isCors && req.method === "PUT") {
        if (state.denyPut) {
          res.writeHead(403, { "content-type": "application/xml" }).end(
            "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>"
          );
          return;
        }
        state.rules = body.replace(/^.*?<CORSConfiguration[^>]*>|<\/CORSConfiguration>.*$/gs, "");
        res.writeHead(200).end();
        return;
      }

      if (req.method === "OPTIONS") {
        const rule = serving(origin, String(req.headers["access-control-request-method"]));
        if (!rule) {
          res.writeHead(403).end();
          return;
        }
        res.writeHead(200, {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": values(rule, "AllowedMethod").join(", "),
          "access-control-allow-headers": values(rule, "AllowedHeader").includes("*")
            ? String(req.headers["access-control-request-headers"] ?? "")
            : values(rule, "AllowedHeader").join(", "),
        }).end();
        return;
      }

      // The probe upload: refused, with CORS headers like S3 sends on errors.
      const rule = serving(origin, req.method!);
      res.writeHead(403, rule ? {
        "access-control-allow-origin": origin,
        "access-control-expose-headers": values(rule, "ExposeHeader").join(", "),
      } : {}).end();
    });
  });

  return { server, seen, state };
}

function capture() {
  const lines: string[] = [];
  // Strip colours so assertions read the text.
  const log = (line = "") => lines.push(line.replace(/\x1b\[[0-9;]*m/g, ""));
  return { lines, text: () => lines.join("\n"), log };
}

let server: Server | undefined;

async function listen(fake: ReturnType<typeof fakeBucket>, provider: "cloudflare-r2" | "minio") {
  server = fake.server;
  await new Promise<void>((resolve) => fake.server.listen(0, "127.0.0.1", resolve));
  const { port } = fake.server.address() as { port: number };
  found.value = {
    provider,
    credentials: {
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "b",
      region: provider === "minio" ? "us-east-1" : "auto",
      accountId: "acct",
      endpoint: `http://127.0.0.1:${port}`,
    },
  };
}

beforeEach(() => {
  found.value = undefined;
});

afterEach(() => {
  server?.close();
  server = undefined;
});

describe("pushduck cors check", () => {
  it("passes the listed dev origin and fails a dev server on another port", async () => {
    const fake = fakeBucket({ rules: UNRELATED + DEV_ONLY });
    await listen(fake, "cloudflare-r2");
    const out = capture();

    const code = await corsCheckCommand(
      { origin: ["http://localhost:3000", "http://localhost:51234"] },
      { log: out.log, confirm: async () => false }
    );

    expect(code).toBe(1);
    expect(out.text()).toMatch(/http:\/\/localhost:3000\n {2}✓ upload \(PUT, content-type\)/);
    expect(out.text()).toMatch(/http:\/\/localhost:51234\n {2}✗ upload \(PUT, content-type\) +preflight rejected \(HTTP 403\) — no rule allows this origin/);
    expect(out.text()).toContain(
      "Fix: pushduck cors apply --origin http://localhost:3000 --origin http://localhost:51234"
    );

    // Reads the rules with a signed request to the R2 endpoint, path-style…
    const get = fake.seen.find((r) => r.url === "/b/?cors=");
    expect(get?.method).toBe("GET");
    expect(get?.headers.authorization).toContain("/auto/s3/aws4_request");

    // …and sends the preflight a browser would, for exactly what it uploads with.
    const preflight = fake.seen.find(
      (r) => r.method === "OPTIONS" && r.headers["access-control-request-method"] === "PUT"
    );
    expect(preflight).toMatchObject({
      url: "/b/pushduck-cors-check",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-headers": "content-type", // no x-amz-acl: R2 takes no ACLs
      },
    });

    // The probe upload cannot write: its credential does not exist and it has no body.
    const probe = fake.seen.find((r) => r.method === "PUT" && r.url === "/b/pushduck-cors-check");
    expect(probe?.headers.authorization).toContain("Credential=PUSHDUCKCORSCHECK/");
    expect(probe?.body).toBe("");
  });

  it("fails an origin whose rule hides ETag — multipart uploads would break", async () => {
    const fake = fakeBucket({ rules: DEV_ONLY.replace("<ExposeHeader>ETag</ExposeHeader>", "") });
    await listen(fake, "cloudflare-r2");
    const out = capture();

    const code = await corsCheckCommand(
      { origin: ["http://localhost:3000"] },
      { log: out.log, confirm: async () => false }
    );

    expect(code).toBe(1);
    expect(out.text()).toMatch(/✗ ETag readable after upload +not exposed — multipart uploads fail/);
  });

  it("refuses a URL with a path before touching the network", async () => {
    const fake = fakeBucket({});
    await listen(fake, "cloudflare-r2");
    const out = capture();

    expect(
      await corsCheckCommand({ origin: ["https://app.example.com/upload"] }, { log: out.log, confirm: async () => false })
    ).toBe(1);
    expect(out.text()).toMatch(/not an origin/);
    expect(fake.seen).toEqual([]);
  });

  it("MinIO: checks with preflights only — its GetBucketCors answer means nothing", async () => {
    const fake = fakeBucket({ rules: DEV_ONLY });
    await listen(fake, "minio");
    const out = capture();

    const code = await corsCheckCommand(
      { origin: ["http://localhost:3000"] },
      { log: out.log, confirm: async () => false }
    );

    expect(code).toBe(0);
    expect(fake.seen.some((r) => r.url === "/b/?cors=")).toBe(false);
    expect(out.text()).toContain("MinIO does not expose bucket CORS through the S3 API");
  });
});

describe("pushduck cors apply", () => {
  it("adds pushduck's rule first, keeps the others, and then the check passes", async () => {
    const fake = fakeBucket({ rules: UNRELATED + DEV_ONLY });
    await listen(fake, "cloudflare-r2");
    const out = capture();

    const code = await corsApplyCommand(
      { origin: ["https://app.example.com", "http://localhost:51234"], yes: true },
      { log: out.log, confirm: async () => { throw new Error("--yes must not ask"); } }
    );

    expect(code).toBe(0);
    expect(out.text()).toContain('+       "ID": "pushduck",');
    expect(out.text()).toContain("✓ Allowed https://app.example.com, http://localhost:51234");

    const put = fake.seen.find((r) => r.method === "PUT" && r.url === "/b/?cors=");
    expect(put?.headers.authorization).toContain("AWS4-HMAC-SHA256");
    // S3-compatible services that predate the SDK's CRC32 want Content-MD5.
    expect(put!.headers["content-md5"]).toBe(
      createHash("md5").update(put!.body).digest("base64")
    );
    expect(put!.headers.authorization).toContain("content-md5");
    const rules = put!.body.match(/<CORSRule>.*?<\/CORSRule>/gs)!;
    expect(rules).toHaveLength(3);
    expect(rules[0]).toBe(
      "<CORSRule>" +
        "<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod>" +
        "<AllowedOrigin>https://app.example.com</AllowedOrigin><AllowedOrigin>http://localhost:51234</AllowedOrigin>" +
        "<ID>pushduck</ID><AllowedHeader>content-type</AllowedHeader>" +
        "<ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule>"
    );
    expect(rules[1]).toContain("https://other.example.com");
    expect(rules[2]).toContain("http://localhost:3000");

    const check = capture();
    expect(
      await corsCheckCommand(
        { origin: ["https://app.example.com", "http://localhost:51234", "http://localhost:3000"] },
        { log: check.log, confirm: async () => false }
      )
    ).toBe(0);
  });

  it("changes nothing when the origins already pass", async () => {
    const fake = fakeBucket({ rules: DEV_ONLY });
    await listen(fake, "cloudflare-r2");
    const out = capture();

    expect(
      await corsApplyCommand({ origin: ["http://localhost:3000"], yes: true }, { log: out.log, confirm: async () => false })
    ).toBe(0);
    expect(out.text()).toContain("already allows browser uploads");
    expect(fake.seen.filter((r) => r.method === "PUT")).toEqual([]);
  });

  it("creates the configuration on a bucket that has none", async () => {
    const fake = fakeBucket({});
    await listen(fake, "cloudflare-r2");

    expect(
      await corsApplyCommand({ origin: ["https://*.example.com"], yes: true }, { log: capture().log, confirm: async () => false })
    ).toBe(0);
    expect(fake.state.rules).toContain("<AllowedOrigin>https://*.example.com</AllowedOrigin>");
  });

  it("without --yes and without a terminal, shows the change and writes nothing", async () => {
    const fake = fakeBucket({ rules: DEV_ONLY });
    await listen(fake, "cloudflare-r2");
    const out = capture();

    const code = await corsApplyCommand(
      { origin: ["https://app.example.com"] },
      { log: out.log, confirm: async () => undefined }
    );

    expect(code).toBe(1);
    expect(out.text()).toContain("Re-run with --yes");
    expect(fake.seen.filter((r) => r.method === "PUT")).toEqual([]);
  });

  it("refuses to overwrite rules that changed while the prompt was open", async () => {
    const fake = fakeBucket({ rules: DEV_ONLY });
    await listen(fake, "cloudflare-r2");
    const out = capture();

    const code = await corsApplyCommand(
      { origin: ["https://app.example.com"] },
      {
        log: out.log,
        confirm: async () => {
          fake.state.rules = DEV_ONLY + UNRELATED; // someone else's change
          return true;
        },
      }
    );

    expect(code).toBe(1);
    expect(out.text()).toContain("changed while waiting");
    expect(fake.seen.filter((r) => r.method === "PUT")).toEqual([]);
  });

  it("R2: explains which token may change bucket CORS when the write is denied", async () => {
    const fake = fakeBucket({ rules: DEV_ONLY, denyPut: true });
    await listen(fake, "cloudflare-r2");
    const out = capture();

    const code = await corsApplyCommand(
      { origin: ["https://app.example.com"], yes: true },
      { log: out.log, confirm: async () => false }
    );

    expect(code).toBe(1);
    expect(out.text()).toContain("AccessDenied");
    expect(out.text()).toContain('"Admin Read & Write"');
  });

  it("MinIO: prints the server-wide setting instead of calling PutBucketCors", async () => {
    const fake = fakeBucket({});
    await listen(fake, "minio");
    const out = capture();

    const code = await corsApplyCommand(
      { origin: ["http://localhost:3000", "https://app.example.com"], yes: true },
      { log: out.log, confirm: async () => false }
    );

    expect(code).toBe(0);
    expect(out.text()).toContain(
      'MINIO_API_CORS_ALLOW_ORIGIN="http://localhost:3000,https://app.example.com"'
    );
    expect(fake.seen).toEqual([]);
  });
});
