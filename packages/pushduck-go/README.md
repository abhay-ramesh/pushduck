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

## Scoping object keys

By default a file's key is its sanitised name, so two users uploading
`photo.jpg` write the same object. `WithStoragePath` chooses the key instead —
the Go counterpart of TypeScript's `.paths()` and Python's `storage_path`:

```go
pushduck.Image(
    pushduck.WithStoragePath(func(r *http.Request, f pushduck.FileMeta) (string, error) {
        user, err := authenticate(r)
        if err != nil {
            return "", pushduck.NewError("UNAUTHORIZED", "Sign in to upload")
        }
        return "users/" + user.ID + "/" + f.Name, nil
    }),
)
```

The hook returns a fragment and pushduck owns the result: it refuses an empty
or absolute path, `?`, `#`, `%`, control and bidi characters, empty, `.` or
`..` segments, and anything over 1024 bytes, with `CONFIG_INVALID`; then it
sanitises every segment exactly as a default key, so non-Latin names survive.
Single-PUT and multipart uploads both use it, and the completion token binds the
scoped key.

## Completion: what `OnComplete` can trust

Presign hands the client a **receipt**, an HMAC-sealed record of what it
authorised: route, key, the file as declared, the client's metadata and what
your metadata hooks returned. Completion reads the upload back from the
receipt, so nothing in the completion request can redirect it to another key
or change the metadata. The receipt format is shared with the TypeScript and
Python servers, so a receipt issued by one completes on another.

```go
pushduck.OnComplete(func(r *http.Request, upload pushduck.Upload) error {
    // upload.Metadata  — what your hooks returned at presign, sealed
    // upload.File      — name as declared; size and type as stored
    // upload.Object    — size, content type, ETag, last modified
    // upload.ID        — stable across retries: use it as an idempotency key
    return db.InsertFile(upload.ID, upload.Key, upload.Metadata["userId"], upload.Object.Size)
})
```

Completion first `HEAD`s the object. No object is a per-file `NOT_FOUND`. An
object that breaks the route's `MaxSize` or `AllowTypes` is deleted and
reported as `VALIDATION_FAILED`, so the limits hold for what was stored.
Single-PUT URLs also sign the declared size, so storage refuses a body of any
other length.

Metadata hooks run on every request of an upload: presign, each multipart
call, and completion. Each run gets the same file and client metadata, with
the phase telling them which request this is:

```go
func requireUser(r *http.Request, f pushduck.FileMeta) (map[string]any, error) {
    user, err := authenticate(r)
    if err != nil {
        return nil, pushduck.NewError("UNAUTHORIZED", "Sign in to upload")
    }
    if pushduck.PhaseOf(r) == pushduck.PhasePresign {
        // Once per upload: later phases only re-check the caller.
        if err := quota.Reserve(user, f.Size); err != nil {
            return nil, err
        }
    }
    album, _ := pushduck.ClientMetadata(r)["albumId"].(string) // untrusted
    return map[string]any{"userId": user.ID, "albumId": album}, nil
}
```

Only the presign result is kept. Receipts are signed, not encrypted, so never
return a secret from a hook.

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

Implemented: introspection, presign, complete, metadata hooks, key scoping
(`WithStoragePath`), RFC 9457 errors,
upload receipts with stored-object verification, per-file validation, SigV4
with temporary credentials, signed upload length,
S3-compatible endpoints with path-style addressing, and **multipart uploads** —
init, sign, complete, abort and list, with the receipt as the session.

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
