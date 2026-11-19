/**
 * @fileoverview Direct access to the bucket a server under test writes to.
 *
 * Some rules are about what the server does with the object, not with the
 * request: completion must refuse an upload that never arrived, and must delete
 * an object that breaks the route's limits. Checking them means putting an
 * object where the server will look, and looking after the server has acted —
 * without going through the server, whose presigned URLs (rightly) refuse a
 * body other than the one declared.
 *
 * So the runner can be handed the same bucket, as a URL:
 *
 *     http://ACCESS_KEY:SECRET@127.0.0.1:9000/bucket
 *
 * Path-style, region `us-east-1`: what MinIO and every S3-compatible test
 * server speak. Requests are signed with a minimal SigV4 written out here, so
 * the runner stays dependency-free.
 */

import { createHash, createHmac } from "node:crypto";

export interface StorageTarget {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/** Parses `http://key:secret@host:port/bucket`. */
export function parseStorage(value: string): StorageTarget {
  const url = new URL(value);
  const bucket = url.pathname.replace(/^\/+|\/+$/g, "");

  if (!url.username || !url.password || !bucket) {
    throw new Error(
      `--storage must look like http://ACCESS_KEY:SECRET@host:port/bucket, got ${value}`
    );
  }

  return {
    endpoint: `${url.protocol}//${url.host}`,
    bucket,
    accessKeyId: decodeURIComponent(url.username),
    secretAccessKey: decodeURIComponent(url.password),
    region: "us-east-1",
  };
}

const hmac = (key: string | Buffer, data: string) =>
  createHmac("sha256", key).update(data).digest();
const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");

/** S3's URI encoding: RFC 3986 unreserved characters only. */
function encode(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/** Sends one header-signed request for an object in the target bucket. */
export async function storageRequest(
  target: StorageTarget,
  method: "PUT" | "HEAD",
  key: string,
  options: { body?: BodyInit; contentType?: string } = {}
): Promise<Response> {
  const path = `/${target.bucket}/${key.split("/").map(encode).join("/")}`;
  const url = new URL(path, target.endpoint);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${target.region}/s3/aws4_request`;

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    "x-amz-date": amzDate,
  };
  if (options.contentType) headers["content-type"] = options.contentType;

  const names = Object.keys(headers).sort();
  const canonical = [
    method,
    path,
    "",
    ...names.map((name) => `${name}:${headers[name]}`),
    "",
    names.join(";"),
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  let key_: Buffer = hmac(`AWS4${target.secretAccessKey}`, day);
  for (const part of [target.region, "s3", "aws4_request"]) key_ = hmac(key_, part);
  const signature = createHmac("sha256", key_).update(stringToSign).digest("hex");

  const { host: _host, ...sent } = headers;
  return fetch(url, {
    method,
    headers: {
      ...sent,
      authorization: `AWS4-HMAC-SHA256 Credential=${target.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
    },
    body: options.body,
  });
}
