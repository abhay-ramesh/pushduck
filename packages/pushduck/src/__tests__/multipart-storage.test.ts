/**
 * @fileoverview S3 multipart operations at the storage layer.
 *
 * The XML here is hand-rolled to avoid a parser dependency, which makes it
 * exactly the kind of code that needs tests: a missed entity or a greedy regex
 * corrupts an ETag, and a corrupt ETag fails `CompleteMultipartUpload` after
 * every byte has already been transferred.
 *
 * Provider error shapes are tested too, because the useful signal is the
 * provider's own `<Code>` — `EntityTooSmall` and `InvalidPart` mean different
 * things and lead to different fixes, while a bare 400 means nothing.
 */

import { describe, expect, it, vi } from "vitest";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  listUploadedParts,
  __xml,
} from "../core/storage/multipart";
import { createUploadConfig } from "../core/config/upload-config";
import { UploadError } from "../core/errors";
import { resetS3Client } from "../core/storage/client";

function config() {
  return createUploadConfig()
    .provider("minio", {
      endpoint: "http://127.0.0.1:9010",
      bucket: "test-uploads",
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
      region: "us-east-1",
      useSSL: false,
    })
    .build().config;
}

/** Replaces global fetch with a scripted provider, returning the calls made. */
function stubProvider(
  responses: Array<{ status?: number; body: string }> | ((url: string) => {
    status?: number;
    body: string;
  })
) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  let index = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      // aws4fetch signs by constructing a `Request` and passing it to fetch,
      // so the URL, method and body live on the Request rather than in `init`.
      const isRequest = typeof Request !== "undefined" && input instanceof Request;
      const url = isRequest ? input.url : String(input);
      const method = isRequest ? input.method : (init?.method ?? "GET");
      const body = isRequest
        ? await input.clone().text()
        : init?.body
          ? String(init.body)
          : undefined;

      calls.push({ url, method, body: body || undefined });

      const next =
        typeof responses === "function"
          ? responses(url)
          : (responses[index++] ?? { body: "" });

      const status = next.status ?? 200;
      // 204/205/304 are null-body statuses; constructing a Response with any
      // body throws. S3's AbortMultipartUpload really does answer 204.
      const nullBody = status === 204 || status === 205 || status === 304;

      return new Response(nullBody ? null : next.body, {
        status,
        headers: { "Content-Type": "application/xml" },
      });
    })
  );

  resetS3Client();
  return calls;
}

describe("XML helpers", () => {
  it("round-trips the five predefined entities", () => {
    const raw = `a & b < c > d " e ' f`;
    expect(__xml.decodeXmlText(__xml.encodeXmlText(raw))).toBe(raw);
  });

  it("encodes ampersand first, so escapes are not double-encoded", () => {
    // Encoding `<` before `&` would turn `<` into `&lt;` and then into
    // `&amp;lt;`, which decodes to the literal text `&lt;`.
    expect(__xml.encodeXmlText("<")).toBe("&lt;");
    expect(__xml.decodeXmlText("&amp;lt;")).toBe("&lt;");
  });

  it("extracts an element's text", () => {
    expect(__xml.extractTag("<UploadId>abc-123</UploadId>", "UploadId")).toBe(
      "abc-123"
    );
  });

  it("extracts the first match only, not across siblings", () => {
    // A greedy regex would swallow everything between the first open tag and
    // the last close tag, merging every part into one.
    const xml = "<Part><PartNumber>1</PartNumber></Part><Part><PartNumber>2</PartNumber></Part>";
    expect(__xml.extractTag(xml, "PartNumber")).toBe("1");
  });

  it("handles an element with attributes", () => {
    expect(
      __xml.extractTag('<ETag xmlns="x">"abc"</ETag>', "ETag")
    ).toBe('"abc"');
  });

  it("returns undefined for a missing element", () => {
    expect(__xml.extractTag("<Other>x</Other>", "UploadId")).toBeUndefined();
  });
});

describe("createMultipartUpload", () => {
  it("starts a session and returns the uploadId", async () => {
    const calls = stubProvider([
      {
        body: `<?xml version="1.0"?><InitiateMultipartUploadResult>
          <Bucket>test-uploads</Bucket><Key>big.bin</Key>
          <UploadId>upload-abc-123</UploadId>
        </InitiateMultipartUploadResult>`,
      },
    ]);

    const result = await createMultipartUpload(config(), { key: "big.bin" });

    expect(result).toEqual({ uploadId: "upload-abc-123", key: "big.bin" });
    // `?uploads` with no value is what distinguishes this from a plain POST.
    expect(calls[0].url).toContain("uploads=");
    expect(calls[0].method).toBe("POST");
  });

  it("fails loudly when the provider returns no uploadId", async () => {
    // Continuing without one would presign parts against an empty session and
    // fail much later, with no indication of the real cause.
    stubProvider([{ body: "<InitiateMultipartUploadResult/>" }]);

    await expect(
      createMultipartUpload(config(), { key: "big.bin" })
    ).rejects.toThrow(/did not return an uploadId/);
  });

  it("surfaces the provider's own error code", async () => {
    stubProvider([
      {
        status: 403,
        body: `<Error><Code>AccessDenied</Code><Message>Not authorised</Message></Error>`,
      },
    ]);

    const error = await createMultipartUpload(config(), {
      key: "big.bin",
    }).catch((e: UploadError) => e);

    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).meta).toMatchObject({
      providerCode: "AccessDenied",
    });
  });
});

describe("completeMultipartUpload", () => {
  it("sends parts sorted ascending", async () => {
    // Providers reject an unordered part list, and a client racing parts will
    // naturally report them out of order.
    const calls = stubProvider([
      { body: "<CompleteMultipartUploadResult><ETag>\"final-etag-2\"</ETag></CompleteMultipartUploadResult>" },
    ]);

    await completeMultipartUpload(config(), {
      key: "big.bin",
      uploadId: "u1",
      parts: [
        { partNumber: 3, etag: '"c"' },
        { partNumber: 1, etag: '"a"' },
        { partNumber: 2, etag: '"b"' },
      ],
    });

    const body = calls[0].body!;
    expect(body.indexOf("<PartNumber>1<")).toBeLessThan(
      body.indexOf("<PartNumber>2<")
    );
    expect(body.indexOf("<PartNumber>2<")).toBeLessThan(
      body.indexOf("<PartNumber>3<")
    );
  });

  it("returns the composite ETag", async () => {
    stubProvider([
      {
        body: `<CompleteMultipartUploadResult>
          <ETag>"abc123-3"</ETag><Location>https://example/big.bin</Location>
        </CompleteMultipartUploadResult>`,
      },
    ]);

    const result = await completeMultipartUpload(config(), {
      key: "big.bin",
      uploadId: "u1",
      parts: [{ partNumber: 1, etag: '"a"' }],
    });

    // The `-N` suffix is the part count, and is how you tell a multipart
    // object from a single PUT after the fact.
    expect(result.etag).toBe('"abc123-3"');
    expect(result.location).toBe("https://example/big.bin");
  });

  it("detects an error document returned with a 200", async () => {
    // S3 holds the connection open while assembling, so it sends 200 before
    // knowing the outcome and reports failure in the body. Trusting the status
    // here loses the object silently.
    stubProvider([
      {
        status: 200,
        body: `<Error><Code>InternalError</Code><Message>try again</Message></Error>`,
      },
    ]);

    await expect(
      completeMultipartUpload(config(), {
        key: "big.bin",
        uploadId: "u1",
        parts: [{ partNumber: 1, etag: '"a"' }],
      })
    ).rejects.toThrow(/try again/);
  });

  it("refuses to complete with no parts", async () => {
    stubProvider([{ body: "" }]);

    await expect(
      completeMultipartUpload(config(), {
        key: "big.bin",
        uploadId: "u1",
        parts: [],
      })
    ).rejects.toThrow(/no parts/);
  });

  it("surfaces EntityTooSmall, the classic part-size mistake", async () => {
    stubProvider([
      {
        status: 400,
        body: `<Error><Code>EntityTooSmall</Code><Message>Your proposed upload is smaller than the minimum allowed size</Message></Error>`,
      },
    ]);

    const error = await completeMultipartUpload(config(), {
      key: "big.bin",
      uploadId: "u1",
      parts: [{ partNumber: 1, etag: '"a"' }],
    }).catch((e: UploadError) => e);

    expect((error as UploadError).meta).toMatchObject({
      providerCode: "EntityTooSmall",
    });
  });
});

describe("abortMultipartUpload", () => {
  it("issues a DELETE for the session", async () => {
    const calls = stubProvider([{ status: 204, body: "" }]);

    await abortMultipartUpload(config(), { key: "big.bin", uploadId: "u1" });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("uploadId=u1");
  });

  it("treats an already-gone session as success", async () => {
    // Abort is called on failure paths and may race a provider-side expiry.
    // Throwing here would mask the original failure with a second one.
    stubProvider([{ status: 404, body: "<Error><Code>NoSuchUpload</Code></Error>" }]);

    await expect(
      abortMultipartUpload(config(), { key: "big.bin", uploadId: "u1" })
    ).resolves.toBeUndefined();
  });
});

describe("listUploadedParts", () => {
  it("parses the parts a provider has stored", async () => {
    stubProvider([
      {
        body: `<ListPartsResult>
          <IsTruncated>false</IsTruncated>
          <Part><PartNumber>1</PartNumber><ETag>"a"</ETag><Size>5242880</Size></Part>
          <Part><PartNumber>2</PartNumber><ETag>"b"</ETag><Size>1024</Size></Part>
        </ListPartsResult>`,
      },
    ]);

    const parts = await listUploadedParts(config(), {
      key: "big.bin",
      uploadId: "u1",
    });

    expect(parts).toEqual([
      { partNumber: 1, etag: '"a"', size: 5242880 },
      { partNumber: 2, etag: '"b"', size: 1024 },
    ]);
  });

  it("pages through a truncated listing", async () => {
    // Providers cap a listing at 1,000 parts but an upload may have 10,000.
    // Not paging would silently drop parts 1,001+ and make a resume re-upload
    // them — or worse, complete without them.
    let call = 0;
    stubProvider(() => {
      call++;
      return call === 1
        ? {
            body: `<ListPartsResult>
              <IsTruncated>true</IsTruncated>
              <NextPartNumberMarker>1</NextPartNumberMarker>
              <Part><PartNumber>1</PartNumber><ETag>"a"</ETag></Part>
            </ListPartsResult>`,
          }
        : {
            body: `<ListPartsResult>
              <IsTruncated>false</IsTruncated>
              <Part><PartNumber>2</PartNumber><ETag>"b"</ETag></Part>
            </ListPartsResult>`,
          };
    });

    const parts = await listUploadedParts(config(), {
      key: "big.bin",
      uploadId: "u1",
    });

    expect(parts.map((p) => p.partNumber)).toEqual([1, 2]);
  });

  it("returns nothing for a session that no longer exists", async () => {
    stubProvider([{ status: 404, body: "<Error><Code>NoSuchUpload</Code></Error>" }]);

    await expect(
      listUploadedParts(config(), { key: "big.bin", uploadId: "gone" })
    ).resolves.toEqual([]);
  });

  it("skips malformed part entries rather than throwing", async () => {
    // Resume must degrade to re-uploading a part, never crash while trying to
    // recover from an earlier failure.
    stubProvider([
      {
        body: `<ListPartsResult><IsTruncated>false</IsTruncated>
          <Part><PartNumber>notanumber</PartNumber><ETag>"a"</ETag></Part>
          <Part><PartNumber>2</PartNumber></Part>
          <Part><PartNumber>3</PartNumber><ETag>"c"</ETag></Part>
        </ListPartsResult>`,
      },
    ]);

    const parts = await listUploadedParts(config(), {
      key: "big.bin",
      uploadId: "u1",
    });

    expect(parts.map((p) => p.partNumber)).toEqual([3]);
  });
});
