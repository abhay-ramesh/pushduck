# pushduck-go

A pushduck **server** for Go. Speaks wire protocol version 1, so the existing
JavaScript client talks to it unchanged.

```go
import "github.com/abhay-ramesh/pushduck-go/pushduck"

config := pushduck.Config{
    Bucket:          os.Getenv("AWS_S3_BUCKET"),
    Region:          os.Getenv("AWS_REGION"),
    AccessKeyID:     os.Getenv("AWS_ACCESS_KEY_ID"),
    SecretAccessKey: os.Getenv("AWS_SECRET_ACCESS_KEY"),
    SessionToken:    os.Getenv("AWS_SESSION_TOKEN"), // ECS, EKS, OIDC
}

router := pushduck.NewRouter(config, pushduck.Routes{
    "imageUpload": pushduck.Image(
        pushduck.MaxSize("5MB"),
        pushduck.WithMetadata(requireUser),
        pushduck.OnComplete(saveToDatabase),
    ),
})

http.Handle("/api/upload", router)
```

Your React, Vue, Svelte or Solid frontend needs no changes:

```ts
const upload = createUploadClient({ endpoint: "/api/upload" });
```

## Why there is no adapter package

`http.Handler` is the interface net/http, chi and gorilla already speak, and
gin and echo wrap it in a line:

```go
r.Any("/api/upload", gin.WrapH(router))       // gin
e.Any("/api/upload", echo.WrapHandler(router)) // echo
```

The TypeScript package needs an adapter per framework because JavaScript's
server ecosystem never agreed on one. Go did, so the router *is* the
integration.

## Why this is not a translation of the TypeScript API

The TypeScript package uses a fluent builder —
`s3.image().maxFileSize("5MB").middleware(auth)` — because TypeScript's
inference carries types through each link and the result is genuinely
type-safe. Go has no equivalent, so the same shape would produce something that
looks like pushduck and reads like nothing else in a Go codebase.

Routes are therefore plain structs with functional options. The protocol is
identical; only the surface is native. The same reasoning will give Python
decorators and Java a builder.

## Conformance

The behaviour that must match across implementations is pinned by the shared
suite in [`conformance/`](../../conformance), not by resemblance to the
TypeScript source:

```bash
go run ./cmd/conformance-server          # terminal 1
pnpm conformance --url http://localhost:4320/api/upload
```

All 20 cases pass. Two further things are checked by `interop_test.go`, because
the conformance fixtures deliberately match them by shape and cannot:

- **SigV4 signatures are byte-identical** to the TypeScript implementation for
  the same credentials, key and instant. Both sides assert the same constant,
  so a client can presign against one server and complete against the other —
  which is what a blue-green deploy or a shared load balancer produces.
- **Object keys are identical**, including the non-Latin cases. `文档.pdf`,
  `写真.pdf` and `Отчёт.pdf` once collapsed to `.pdf` in the TypeScript
  implementation and silently overwrote one another; that fix is ported here
  rather than reinvented, and the test cases are the same ones.

## Status

Implemented: introspection, presign, complete, metadata hooks, RFC 9457 errors,
completion tokens, per-file validation, SigV4 with temporary credentials,
S3-compatible endpoints with path-style addressing, and **multipart uploads** —
init, sign, complete, abort and list, with HMAC session tokens.

Multipart is verified against a real MinIO, not a stub, because the two things
most likely to be silently wrong are only observable against a real server:
`UploadPart` signatures, which are self-consistently wrong if `partNumber` and
`uploadId` are not in the canonical request; and assembly, where parts that
overlap or arrive out of order still complete with a 200 and produce a corrupt
object.

The end-to-end claim is tested rather than asserted: `cross-language.test.ts`
in the TypeScript package drives the real JavaScript upload client against this
server, through the full multipart handshake, and reads the bytes back from
storage. A React frontend and a Go backend, sharing no code.

Not yet implemented: resumable uploads across process restarts. The client's
resume support works — it re-lists parts from `multipart-parts`, which this
server implements — but there is no server-side session store, so a session is
only as durable as the token the client holds.
