/**
 * The server-side storage API that replaces a second S3 client: reading
 * objects, signed downloads with a chosen filename, copy/move, and an
 * `exists` that does not mistake "access denied" for "missing".
 *
 * Signing is real aws4fetch (no mock) so assertions are about the actual
 * SigV4 request. Only the network is stubbed: `globalThis.fetch` is replaced
 * with a responder that records each signed `Request`. The same operations run
 * against a real server in `minio-integration.test.ts`.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { UploadError } from "../core/errors";
import { contentDisposition } from "../core/storage/content-disposition";
import { resetS3Client } from "../core/storage/client";

const provider = {
  bucket: "test-bucket",
  region: "us-east-1",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

function makeStorage(extra: Record<string, unknown> = {}) {
  return createUploadConfig()
    .provider("aws", { ...provider, ...extra })
    .build().storage;
}

/** Records every request and answers with the next queued response. */
function stubNetwork(...responses: Array<() => Response>) {
  const requests: Request[] = [];
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      const next = responses.shift();
      if (!next) throw new Error("unexpected request");
      return next();
    });
  return { requests, spy };
}

const objectHeaders = {
  "content-type": "application/pdf",
  "content-length": "5",
  etag: '"abc123"',
  "last-modified": "Wed, 01 Jan 2025 00:00:00 GMT",
};

const object = () => new Response("hello", { status: 200, headers: objectHeaders });
const status = (code: number, body: string | null = null) => () =>
  new Response(body, { status: code });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("contentDisposition (RFC 6266 / RFC 5987)", () => {
  it("emits an ASCII fallback and a UTF-8 filename*", () => {
    expect(contentDisposition("attachment", "résumé.pdf")).toBe(
      `attachment; filename="r_sum_.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`
    );
  });

  it("strips quotes, backslashes and line breaks so the header cannot be split", () => {
    const header = contentDisposition("inline", 'a"b\\c\r\nSet-Cookie: x.txt');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toBe(
      `inline; filename="abcSet-Cookie: x.txt"; filename*=UTF-8''abcSet-Cookie%3A%20x.txt`
    );
  });

  it("percent-encodes the RFC 5987 attr-char exclusions", () => {
    expect(contentDisposition("attachment", "it's (1)*.txt")).toBe(
      `attachment; filename="it's (1)*.txt"; filename*=UTF-8''it%27s%20%281%29%2A.txt`
    );
  });

  it("is just the disposition type when there is no filename", () => {
    expect(contentDisposition("inline")).toBe("inline");
    expect(contentDisposition("attachment", "\r\n")).toBe("attachment");
  });
});

describe("download.presignedUrl options", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  beforeEach(() => resetS3Client());

  it("keeps the number form: expiry only, no response overrides", async () => {
    const url = new URL(await makeStorage().download.presignedUrl("a.pdf", 900));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.has("response-content-disposition")).toBe(false);
    expect(url.searchParams.has("response-content-type")).toBe(false);
  });

  it("signs response-content-disposition and response-content-type", async () => {
    const url = new URL(
      await makeStorage().download.presignedUrl("a.pdf", {
        expiresIn: 600,
        disposition: "attachment",
        filename: 'Q3 "final" résumé.pdf',
        contentType: "application/pdf",
      })
    );

    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("response-content-disposition")).toBe(
      `attachment; filename="Q3 final r_sum_.pdf"; filename*=UTF-8''Q3%20final%20r%C3%A9sum%C3%A9.pdf`
    );
    expect(url.searchParams.get("response-content-type")).toBe("application/pdf");
  });

  it("includes the overrides in the signature", async () => {
    const storage = makeStorage();
    const plain = new URL(await storage.download.presignedUrl("a.pdf", { expiresIn: 600 }));
    const named = new URL(
      await storage.download.presignedUrl("a.pdf", {
        expiresIn: 600,
        filename: "a.pdf",
      })
    );
    expect(named.searchParams.get("X-Amz-Signature")).not.toBe(
      plain.searchParams.get("X-Amz-Signature")
    );
  });

  it("defaults to attachment when only a filename is given", async () => {
    const url = new URL(
      await makeStorage().download.presignedUrl("a.pdf", { filename: "a.pdf" })
    );
    expect(url.searchParams.get("response-content-disposition")).toMatch(/^attachment;/);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
  });

  it("encodes spaces as %20, the encoding the signature was computed over", async () => {
    // URLSearchParams would serialise a space as "+", which S3-compatible
    // servers are not uniformly willing to decode as a space.
    const raw = await makeStorage().download.presignedUrl("a.pdf", {
      filename: "a b.pdf",
    });
    expect(raw).not.toContain("+");
    expect(raw).toContain("%20");
  });

  it("still signs the API host when a custom domain is configured", async () => {
    const url = new URL(
      await makeStorage({ customDomain: "https://cdn.example.com" }).download.presignedUrl(
        "a.pdf",
        { filename: "a.pdf" }
      )
    );
    expect(url.host).toBe("test-bucket.s3.us-east-1.amazonaws.com");
  });
});

describe("download.get / bytes / text / response", () => {
  beforeEach(() => resetS3Client());

  it("GETs the object from the API endpoint with a signed request", async () => {
    const { requests } = stubNetwork(object);
    const result = await makeStorage({
      customDomain: "https://cdn.example.com",
    }).download.get("docs/a.pdf");

    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe(
      "https://test-bucket.s3.us-east-1.amazonaws.com/docs/a.pdf"
    );
    expect(requests[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);

    expect(result.size).toBe(5);
    expect(result.contentType).toBe("application/pdf");
    expect(result.etag).toBe("abc123");
    expect(result.lastModified).toEqual(new Date("2025-01-01T00:00:00Z"));
    expect(result.body).toBeInstanceOf(ReadableStream);
    expect(await new Response(result.body).text()).toBe("hello");
  });

  it("returns bytes and text", async () => {
    stubNetwork(object, object);
    const storage = makeStorage();
    expect(await storage.download.bytes("a")).toEqual(new TextEncoder().encode("hello"));
    expect(await storage.download.text("a")).toBe("hello");
  });

  it("throws NOT_FOUND for a missing object", async () => {
    stubNetwork(status(404, "<Error><Code>NoSuchKey</Code></Error>"));
    const error = await makeStorage()
      .download.get("missing")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).code).toBe("NOT_FOUND");
    expect((error as UploadError).status).toBe(404);
  });

  it("throws STORAGE_ACCESS_DENIED on 403", async () => {
    stubNetwork(status(403, "<Error><Code>AccessDenied</Code></Error>"));
    const error = await makeStorage()
      .download.text("x")
      .catch((e: unknown) => e);
    expect((error as UploadError).code).toBe("STORAGE_ACCESS_DENIED");
  });

  it("builds a Response a route handler can return as-is", async () => {
    stubNetwork(object);
    const response = await makeStorage().download.response("docs/a.pdf", {
      filename: "Report.pdf",
      cacheControl: "private, max-age=60",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-length")).toBe("5");
    expect(response.headers.get("etag")).toBe('"abc123"');
    expect(response.headers.get("last-modified")).toBe(objectHeaders["last-modified"]);
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="Report.pdf"; filename*=UTF-8''Report.pdf`
    );
    expect(await response.text()).toBe("hello");
  });

  it("omits Content-Disposition and Cache-Control unless asked", async () => {
    stubNetwork(object);
    const response = await makeStorage().download.response("a.pdf");
    expect(response.headers.has("content-disposition")).toBe(false);
    expect(response.headers.has("cache-control")).toBe(false);
  });
});

describe("copy.file / move.file", () => {
  beforeEach(() => resetS3Client());

  it("PUTs to the destination with a URL-encoded copy source", async () => {
    const { requests } = stubNetwork(status(200, "<CopyObjectResult/>"));
    await makeStorage().copy.file("in/a b+c é.txt", "out/copy.txt");

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe(
      "https://test-bucket.s3.us-east-1.amazonaws.com/out/copy.txt"
    );
    expect(requests[0].headers.get("x-amz-copy-source")).toBe(
      "/test-bucket/in/a%20b%2Bc%20%C3%A9.txt"
    );
    expect(requests[0].headers.has("x-amz-metadata-directive")).toBe(false);
  });

  it("replaces metadata and keeps the source content type", async () => {
    const { requests } = stubNetwork(object, status(200, "<CopyObjectResult/>"));
    await makeStorage().copy.file("a.pdf", "b.pdf", { metadata: { owner: "u1" } });

    // REPLACE resets every header S3 stores with the object, Content-Type
    // included, so the source's type is read first and carried over.
    expect(requests[0].method).toBe("HEAD");
    const put = requests[1];
    expect(put.headers.get("x-amz-metadata-directive")).toBe("REPLACE");
    expect(put.headers.get("x-amz-meta-owner")).toBe("u1");
    expect(put.headers.get("content-type")).toBe("application/pdf");
  });

  it("throws when S3 embeds an error in a 200 copy response", async () => {
    stubNetwork(
      status(200, "<Error><Code>InternalError</Code><Message>boom</Message></Error>")
    );
    const error = await makeStorage()
      .copy.file("a", "b")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).code).toBe("STORAGE_UNAVAILABLE");
  });

  it("throws NOT_FOUND when the source is missing", async () => {
    stubNetwork(status(404, "<Error><Code>NoSuchKey</Code></Error>"));
    const error = await makeStorage()
      .copy.file("missing", "b")
      .catch((e: unknown) => e);
    expect((error as UploadError).code).toBe("NOT_FOUND");
  });

  it("move copies then deletes the source", async () => {
    const { requests } = stubNetwork(status(200, "<CopyObjectResult/>"), status(204));
    await makeStorage().move.file("a.txt", "b.txt");
    expect(requests.map((r) => [r.method, new URL(r.url).pathname])).toEqual([
      ["PUT", "/b.txt"],
      ["DELETE", "/a.txt"],
    ]);
  });

  it("move leaves the source alone when the copy fails", async () => {
    const { requests } = stubNetwork(status(403));
    await expect(makeStorage().move.file("a.txt", "b.txt")).rejects.toThrow();
    expect(requests).toHaveLength(1);
  });
});

describe("validation.exists", () => {
  beforeEach(() => resetS3Client());

  it("is true for 200 and false for 404", async () => {
    stubNetwork(object, status(404));
    const storage = makeStorage();
    expect(await storage.validation.exists("a")).toBe(true);
    expect(await storage.validation.exists("b")).toBe(false);
  });

  it("throws on 403 instead of reporting the object missing", async () => {
    stubNetwork(status(403));
    const error = await makeStorage()
      .validation.exists("a")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).code).toBe("STORAGE_ACCESS_DENIED");
    expect((error as UploadError).message).toContain("ListBucket");
  });

  it("existsWithInfo: null for 404, throws on 403", async () => {
    stubNetwork(status(404), status(403));
    const storage = makeStorage();
    expect(await storage.validation.existsWithInfo("a")).toBeNull();
    await expect(storage.validation.existsWithInfo("a")).rejects.toMatchObject({
      code: "STORAGE_ACCESS_DENIED",
    });
  });

  it("metadata.getInfo throws NOT_FOUND for a missing object", async () => {
    stubNetwork(status(404));
    await expect(makeStorage().metadata.getInfo("a")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("object keys in API URLs", () => {
  beforeEach(() => resetS3Client());

  it("percent-encodes '+' so the signature and the server agree on the key", async () => {
    // aws4fetch canonicalises a literal "+" in an S3 path as a space; S3 reads
    // it as "+". Encoded as %2B, both sides see "+".
    const { requests } = stubNetwork(object);
    await makeStorage().download.get("in/a+b c.txt");
    expect(new URL(requests[0].url).pathname).toBe("/in/a%2Bb%20c.txt");

    const url = new URL(await makeStorage().download.presignedUrl("in/a+b.txt", 60));
    expect(url.pathname).toBe("/in/a%2Bb.txt");
  });
});

describe("upload.file options", () => {
  beforeEach(() => resetS3Client());

  it("sends Content-Type, Cache-Control and metadata", async () => {
    const { requests } = stubNetwork(status(200));
    await makeStorage().upload.file(Buffer.from("hi"), "a.txt", {
      contentType: "text/plain",
      cacheControl: "public, max-age=31536000, immutable",
      metadata: { owner: "u1" },
    });

    const put = requests[0];
    expect(put.headers.get("content-type")).toBe("text/plain");
    expect(put.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(put.headers.get("x-amz-meta-owner")).toBe("u1");
  });

  it("rejects options it does not support", () => {
    const storage = makeStorage();
    // Compile-time only: the options were `any`, so typos went unnoticed.
    const typed = () =>
      // @ts-expect-error — `contenttype` is not an option
      storage.upload.file(Buffer.from(""), "k", { contenttype: "text/plain" });
    expect(typeof typed).toBe("function");
  });
});
