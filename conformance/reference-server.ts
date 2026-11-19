/**
 * @fileoverview The reference server the conformance suite is written against.
 *
 * Two uses. It lets this repository exercise the suite over real HTTP rather
 * than only in-process, which is how every other implementation will run it.
 * And it gives someone writing a Go, Python or Java server something to diff
 * their own responses against when a fixture fails and the prose is ambiguous.
 *
 *     pnpm conformance:serve
 *     pnpm conformance --url http://localhost:4319/api/upload
 *
 * By default the credentials are fake. Presigning is pure computation — a
 * signature is derived, not verified with the provider — so most of the suite
 * needs no bucket and no network. The cases about the stored object need one:
 *
 *     CONFORMANCE_STORAGE=http://minioadmin:minioadmin@127.0.0.1:9010/conformance \
 *       pnpm conformance:serve
 *     pnpm conformance --url http://localhost:4319/api/upload \
 *       --storage http://minioadmin:minioadmin@127.0.0.1:9010/conformance
 */

import { createServer } from "node:http";
import { createUploadConfig } from "../packages/pushduck/src/core/config/upload-config";
import { UploadError } from "../packages/pushduck/src/core/errors";

const PORT = Number(process.env.PORT ?? 4319);

/**
 * `CONFORMANCE_STORAGE=http://KEY:SECRET@host:port/bucket` backs the server
 * with a real bucket, for the cases that check what completion does with the
 * stored object (`--storage` on the runner, with the same URL).
 */
const storage = process.env.CONFORMANCE_STORAGE
  ? new URL(process.env.CONFORMANCE_STORAGE)
  : undefined;

const { s3 } = (
  storage
    ? createUploadConfig().provider("minio", {
        endpoint: `${storage.protocol}//${storage.host}`,
        bucket: storage.pathname.replace(/^\/+|\/+$/g, ""),
        accessKeyId: decodeURIComponent(storage.username),
        secretAccessKey: decodeURIComponent(storage.password),
        region: "us-east-1",
        useSSL: storage.protocol === "https:",
      })
    : createUploadConfig().provider("aws", {
        bucket: "conformance-bucket",
        region: "us-east-1",
        accessKeyId: "conformance-key",
        secretAccessKey: "conformance-secret",
      })
).build();

/** Exactly the route surface documented in `conformance/README.md`. */
const router = s3.createRouter({
  imageUpload: s3.image().maxFileSize("5MB"),
  fileUpload: s3.file().maxFileSize("50MB"),
  privateUpload: s3
    .file()
    .maxFileSize("5MB")
    .middleware(async ({ req }) => {
      if (req.headers.get("authorization") !== "Bearer conformance-token") {
        throw new UploadError("UNAUTHORIZED", "Sign in to upload");
      }
      return { userId: "conformance-user" };
    }),
  // Authenticates and returns nothing.
  strictUpload: s3
    .file()
    .maxFileSize("5MB")
    .middleware(async ({ req }) => {
      if (req.headers.get("authorization") !== "Bearer conformance-token") {
        throw new UploadError("UNAUTHORIZED", "Sign in to upload");
      }
      return undefined as never;
    }),
});

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);

  const request = new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  });

  const response = await router.handler(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(PORT, () => {
  console.log(`Conformance reference server on http://localhost:${PORT}/api/upload`);
});
