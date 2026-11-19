# pushduck (Python)

A pushduck **server** for Python. Speaks wire protocol version 1, so the
existing JavaScript client talks to it unchanged.

**Zero runtime dependencies.** Signing is HMAC-SHA256 from `hashlib`, and the
protocol is JSON over HTTP. Pulling in boto3 for one signature would be larger
than this entire package and would drag a dependency tree into every
application that installs it.

```python
from pushduck import Router, UploadConfig, image

config = UploadConfig(
    bucket=os.environ["AWS_S3_BUCKET"],
    region=os.environ["AWS_REGION"],
    access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    session_token=os.environ.get("AWS_SESSION_TOKEN"),  # ECS, EKS IRSA, OIDC
)

router = Router(config)

@router.route("imageUpload", image(max_size="5MB"))
async def image_upload(request):
    user = await authenticate(request)
    return {"user_id": user.id}     # becomes the upload's metadata
```

Your React, Vue, Svelte or Solid frontend needs no changes:

```ts
const upload = createUploadClient({ endpoint: "/api/upload" });
```

## Completion: what `on_complete` can trust

Presign hands the client a **receipt**, an HMAC-sealed record of what it
authorised: route, key, the file as declared, the client's metadata and what
the `metadata` channel returned. Completion reads the upload back from the
receipt, so nothing in the completion request can redirect it to another key
or change the metadata. The format is shared with the TypeScript and Go
servers, so a receipt issued by one completes on another.

```python
def record_upload(ctx: Context[User], done: Completion) -> None:
    # ctx.metadata      — what `metadata` returned at presign, sealed
    # done.file         — name as declared; size and type as stored
    # done.object       — size, content type, ETag, last modified
    # done.upload_id    — stable across retries: use it as an idempotency key
    db.insert_file(done.upload_id, done.key, ctx.metadata["owner_id"], done.object.size)
```

Completion first `HEAD`s the object. No object is a per-file `NOT_FOUND`. An
object that breaks the route's schema is deleted and reported as
`VALIDATION_FAILED`, so `max_size` holds for what was stored. Single-PUT URLs
also sign the declared size, so storage refuses a body of any other length.

`authorize` and `user` run on every request of an upload: presign, each
multipart call, and completion. A caller who has lost access since presign is
therefore refused. `metadata` runs only at presign. Every later request sees
the same `ctx.client_metadata`, and `ctx.phase` (`"presign"`, `"upload"` or
`"complete"`) says which request it is. Receipts are signed, not encrypted,
so never return a secret from `metadata`.

## Mounting

| Framework | |
| --- | --- |
| FastAPI / Starlette | `app.mount("/api/upload", router.asgi())` |
| Litestar | `Mount("/api/upload", router.asgi())` |
| Django (async) | `path("api/upload", router.asgi())` via an ASGI adapter |
| Flask | `app.wsgi_app = DispatcherMiddleware(app.wsgi_app, {"/api/upload": router.wsgi()})` |
| Anything else | `await router.handle(Request(...))` — a plain function |

ASGI and WSGI are Python's equivalent of the Web `Request` the JavaScript
ecosystem converged on. Two interfaces rather than one is the cost of Python's
history; between them they cover the ecosystem, and the core underneath is
neither, so a framework nobody has written an adapter for can still be served.

## Why the API does not look like the TypeScript one

The TypeScript package uses a fluent builder —
`s3.image().maxFileSize("5MB").middleware(auth)` — because TypeScript's
inference carries types through each link and the result is genuinely type-safe.
Go uses structs with functional options. Python uses decorators and dataclasses.

Same protocol, native surface. A route's decorated function **is** its
middleware: a Python developer already expects a decorated handler to run on
every request, so there is no separate concept to learn. Raise to reject;
whatever you return becomes the upload's metadata.

Sync handlers work too — Django and Flask users write them, and forcing
`async def` on half the ecosystem would make this package feel foreign in it.

## Conformance

Behaviour that must match across implementations is pinned by the shared suite
in [`conformance/`](../../conformance), not by resemblance to any other source:

```bash
python3 cmd/conformance_server.py
pnpm conformance --url http://localhost:4322/api/upload
```

All 23 cases pass, including the multipart ones, which run because this server
advertises `multipart` in introspection.

`tests/test_interop.py` checks the two things the fixtures deliberately match
by shape and therefore cannot:

- **SigV4 signatures are byte-identical** to the TypeScript and Go
  implementations for the same credentials, key and instant. All three assert
  the same constant, so a client can presign against one server and complete
  against another.
- **Object keys are identical**, including the non-Latin cases. `文档.pdf`,
  `写真.pdf` and `Отчёт.pdf` once collapsed to `.pdf` and silently overwrote one
  another; that fix is ported rather than reinvented, with the same test cases.

```bash
pip install --group test   # pytest, plus the frameworks test_frameworks.py mounts into
python -m pytest
```

MinIO is optional: the storage round trips in `tests/test_multipart.py` skip
without it (`packages/pushduck/scripts/minio.sh start` starts one). CI provides it
and runs this suite on the oldest and newest supported Python.

## Status

Implemented: introspection with feature advertisement, presign, complete,
per-route handlers, RFC 9457 errors, upload receipts with stored-object
verification, per-file validation, signed upload length,
SigV4 with temporary credentials, S3-compatible endpoints with path-style
addressing, both ASGI and WSGI adapters, and **multipart uploads** — init,
sign, complete, abort and list, with the receipt as the session.

Multipart uses `urllib` and `xml.etree`, both stdlib, so the package still
installs nothing. It reproduces three provider behaviours the TypeScript
implementation learnt expensively rather than rediscovering them: S3 returning
an error document with HTTP 200, `ListParts` pagination that makes a truncated
listing look complete, and an abort of an already-absent upload returning 404
as the desired end state.

Not implemented: resumable uploads across process restarts. The client's resume
support works — it re-lists parts from `multipart-parts`, which this server
implements — but there is no server-side session store, so a session is only as
durable as the token the client holds. The same is true of the TypeScript and
Go servers.
