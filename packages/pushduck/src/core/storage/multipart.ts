/**
 * @fileoverview S3 multipart operations against the provider.
 *
 * Four calls, plus a listing used for resume. Only `UploadPart` is presigned
 * and handed to the client; the rest are made by the server, because they are
 * cheap, infrequent, and involve no file bytes.
 *
 * ```
 *   create  ──► server → provider          returns uploadId
 *   sign    ──► server → presigned URL     one per part, client PUTs to it
 *   complete──► server → provider          stitches the object
 *   abort   ──► server → provider          discards parts (they are billed)
 *   list    ──► server → provider          which parts landed — resume
 * ```
 *
 * ## Why the XML is hand-rolled
 *
 * These five operations are the only XML in the library, and their payloads are
 * a handful of flat elements. Adding an XML parser to a package whose entire
 * runtime dependency list is `aws4fetch` would be a poor trade — so the
 * encoding and extraction here are deliberately narrow, and reject anything
 * they do not recognise rather than guessing.
 */

import type { UploadConfig } from "../config/upload-config";
import { UploadError } from "../errors";
import { logger } from "../utils/logger";

/**
 * An uploaded part, as the provider records it.
 *
 * `etag` is required to complete the upload and **must** be echoed back
 * exactly as received, quotes included.
 */
export interface UploadedPart {
  /** 1-based part number. */
  partNumber: number;
  /** Provider-assigned entity tag, including surrounding quotes. */
  etag: string;
  /** Size in bytes, present in listings. */
  size?: number;
}

/** Result of starting a multipart upload. */
export interface CreatedMultipartUpload {
  /** Opaque session identifier, required by every later call. */
  uploadId: string;
  /** Object key the parts will assemble into. */
  key: string;
}

/**
 * Signs an XML/S3 API request that the *server* makes.
 *
 * Distinct from `presignApiRequest`, which signs a URL for the *client*. Here
 * the request is executed immediately, so the signature lives in headers.
 *
 * @internal
 */
async function signedApiRequest(
  uploadConfig: UploadConfig,
  options: {
    key: string;
    method: "GET" | "POST" | "DELETE";
    query: Record<string, string>;
    body?: string;
  }
): Promise<Response> {
  // Imported lazily to avoid a module cycle: client.ts already imports from
  // this module's siblings, and the helpers below are internal to it.
  const { createS3Client, buildApiUrlFor } = await import("./client");

  const awsClient = createS3Client(uploadConfig);
  const url = new URL(buildApiUrlFor(options.key, uploadConfig));

  for (const [name, value] of Object.entries(options.query)) {
    url.searchParams.set(name, value);
  }

  return awsClient.fetch(url.toString(), {
    method: options.method,
    body: options.body,
    headers: options.body ? { "Content-Type": "application/xml" } : undefined,
  });
}

/** Reads a response body and raises a typed error when the provider refused. */
async function expectOk(
  response: Response,
  operation: string,
  key: string
): Promise<string> {
  const text = await response.text();

  if (response.ok) return text;

  // Provider errors arrive as XML with a <Code> element. Surfacing it beats a
  // bare status: `EntityTooSmall` and `InvalidPart` mean very different things.
  const providerCode = extractTag(text, "Code") ?? "unknown";
  const providerMessage = extractTag(text, "Message") ?? response.statusText;

  logger.error(`Multipart ${operation} failed`, {
    key,
    status: response.status,
    providerCode,
    providerMessage,
  });

  throw new UploadError(
    response.status === 404 ? "NOT_FOUND" : "STORAGE_UNAVAILABLE",
    `Multipart ${operation} failed: ${providerMessage}`,
    {
      status: response.status === 404 ? 404 : 502,
      meta: { key, operation, providerCode, providerMessage },
    }
  );
}

/**
 * Extracts the text content of the first occurrence of an XML element.
 *
 * Narrow by design: these payloads are flat, and a real parser would be a
 * dependency for five call sites.
 */
function extractTag(xml: string, tag: string): string | undefined {
  const match = xml.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`)
  );
  return match ? decodeXmlText(match[1]) : undefined;
}

/** Reverses the five XML predefined entities. */
function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // `&amp;` last: decoding it first would corrupt `&amp;lt;`.
    .replace(/&amp;/g, "&");
}

/** Escapes text for inclusion in an XML element. */
function encodeXmlText(value: string): string {
  return value
    // `&` first, for the mirror-image reason.
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Starts a multipart upload.
 *
 * The returned `uploadId` identifies a session that **holds storage until it is
 * completed or aborted**, and is billed meanwhile. AWS never expires these on
 * its own; R2 aborts after 7 days and DigitalOcean after 30. Always pair a
 * create with an eventual complete or abort.
 */
export async function createMultipartUpload(
  uploadConfig: UploadConfig,
  options: { key: string; contentType?: string }
): Promise<CreatedMultipartUpload> {
  const response = await signedApiRequest(uploadConfig, {
    key: options.key,
    method: "POST",
    // `?uploads` with no value is how S3 distinguishes this from a plain POST.
    query: { uploads: "" },
  });

  const xml = await expectOk(response, "create", options.key);
  const uploadId = extractTag(xml, "UploadId");

  if (!uploadId) {
    throw new UploadError(
      "STORAGE_UNAVAILABLE",
      "Provider did not return an uploadId when starting a multipart upload",
      { meta: { key: options.key } }
    );
  }

  return { uploadId, key: options.key };
}

/**
 * Presigns a single `UploadPart` request for the client.
 *
 * This is the hot path: a 5 GiB file at the 5 MiB floor is over a thousand of
 * these, against one create and one complete.
 */
export async function presignUploadPart(
  uploadConfig: UploadConfig,
  options: {
    key: string;
    uploadId: string;
    partNumber: number;
    expiresIn?: number;
  }
): Promise<string> {
  const { presignApiRequestWithQuery } = await import("./client");

  return presignApiRequestWithQuery(uploadConfig, {
    key: options.key,
    method: "PUT",
    expiresIn: options.expiresIn ?? 3600,
    query: {
      partNumber: String(options.partNumber),
      uploadId: options.uploadId,
    },
  });
}

/**
 * Completes a multipart upload, stitching the parts into one object.
 *
 * Parts **must** be sorted ascending by number; providers reject an unordered
 * list. Each `etag` must be exactly what the part's `PUT` returned.
 *
 * A `400 EntityTooSmall` here means a non-final part was below 5 MiB. On
 * Cloudflare R2, `All non-trailing parts must have the same length` means the
 * parts were not uniform — R2 requires that where AWS does not, which is why
 * the planner always emits uniform parts.
 */
export async function completeMultipartUpload(
  uploadConfig: UploadConfig,
  options: { key: string; uploadId: string; parts: UploadedPart[] }
): Promise<{ etag?: string; location?: string }> {
  if (options.parts.length === 0) {
    throw new UploadError(
      "BAD_REQUEST",
      "Cannot complete a multipart upload with no parts",
      { meta: { key: options.key, uploadId: options.uploadId } }
    );
  }

  const ordered = [...options.parts].sort(
    (a, b) => a.partNumber - b.partNumber
  );

  const body =
    `<CompleteMultipartUpload>` +
    ordered
      .map(
        (part) =>
          `<Part><PartNumber>${part.partNumber}</PartNumber>` +
          `<ETag>${encodeXmlText(part.etag)}</ETag></Part>`
      )
      .join("") +
    `</CompleteMultipartUpload>`;

  const response = await signedApiRequest(uploadConfig, {
    key: options.key,
    method: "POST",
    query: { uploadId: options.uploadId },
    body,
  });

  const xml = await expectOk(response, "complete", options.key);

  // S3 can return 200 with an error document — the connection is held open
  // while the object is assembled, so the status is sent before the outcome is
  // known. Treating that as success loses the object silently.
  const errorCode = extractTag(xml, "Code");
  if (errorCode) {
    throw new UploadError(
      "STORAGE_UNAVAILABLE",
      `Multipart complete failed: ${extractTag(xml, "Message") ?? errorCode}`,
      { status: 502, meta: { key: options.key, providerCode: errorCode } }
    );
  }

  return {
    etag: extractTag(xml, "ETag"),
    location: extractTag(xml, "Location"),
  };
}

/**
 * Discards a multipart upload and its parts.
 *
 * Not optional on failure paths: abandoned parts consume storage and are
 * billed until removed, and AWS has no automatic expiry.
 */
export async function abortMultipartUpload(
  uploadConfig: UploadConfig,
  options: { key: string; uploadId: string }
): Promise<void> {
  const response = await signedApiRequest(uploadConfig, {
    key: options.key,
    method: "DELETE",
    query: { uploadId: options.uploadId },
  });

  // 404 means the session is already gone, which is the desired end state.
  if (response.status === 404) return;

  await expectOk(response, "abort", options.key);
}

/**
 * Lists the parts the provider has actually stored.
 *
 * The authority for resume. Local state can be stale, can have been written
 * before a part's request actually failed, or can belong to a different file —
 * so a resuming client reconciles against this rather than trusting itself.
 */
export async function listUploadedParts(
  uploadConfig: UploadConfig,
  options: { key: string; uploadId: string }
): Promise<UploadedPart[]> {
  const parts: UploadedPart[] = [];
  let partNumberMarker: string | undefined;

  // Providers return at most 1,000 parts per call, and an upload may have
  // 10,000 — so this must page or a resume silently loses parts 1,001+.
  do {
    const response = await signedApiRequest(uploadConfig, {
      key: options.key,
      method: "GET",
      query: {
        uploadId: options.uploadId,
        ...(partNumberMarker ? { "part-number-marker": partNumberMarker } : {}),
      },
    });

    if (response.status === 404) return parts;

    const xml = await expectOk(response, "list parts", options.key);

    for (const block of xml.match(/<Part>[\s\S]*?<\/Part>/g) ?? []) {
      const partNumber = Number(extractTag(block, "PartNumber"));
      const etag = extractTag(block, "ETag");
      if (!Number.isFinite(partNumber) || !etag) continue;

      const size = Number(extractTag(block, "Size"));
      parts.push({
        partNumber,
        etag,
        size: Number.isFinite(size) ? size : undefined,
      });
    }

    partNumberMarker =
      extractTag(xml, "IsTruncated") === "true"
        ? extractTag(xml, "NextPartNumberMarker")
        : undefined;
  } while (partNumberMarker);

  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

/** @internal — exported for tests only. */
export const __xml = { extractTag, encodeXmlText, decodeXmlText };
