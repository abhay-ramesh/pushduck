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
python3 -m unittest discover -s tests
```

## Status

Implemented: introspection with feature advertisement, presign, complete,
per-route handlers, RFC 9457 errors, completion tokens, per-file validation,
SigV4 with temporary credentials, S3-compatible endpoints with path-style
addressing, both ASGI and WSGI adapters, and **multipart uploads** — init,
sign, complete, abort and list, with HMAC session tokens.

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
