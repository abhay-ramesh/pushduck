"""The router: dispatch, presign, complete, and completion tokens.

Framework-agnosticism in Python means ASGI, which covers FastAPI, Starlette,
Litestar and async Django — plus a WSGI shim for Flask and sync Django. But the
core here is neither: it is a plain function from a decoded request to a decoded
response, so the adapters in ``asgi.py`` and ``wsgi.py`` are a dozen lines each
and a framework nobody has written an adapter for can still be served.
"""

from __future__ import annotations

import contextlib
import json
from dataclasses import dataclass, field, replace as _replace
from typing import Any, Dict, List, Mapping, Optional, Tuple
from urllib.parse import parse_qs, quote

from . import tokens
from .config import FileMeta, Schema, UploadConfig, choose_part_size
from .errors import UploadError, as_upload_error, problem_document
from .keys import generate_key, resolve_key
from .receipt import (
    COMPLETION_GRACE_SECONDS,
    MULTIPART_RECEIPT_SECONDS,
    MultipartPlan,
    Receipt,
    new_upload_id,
    open_receipt,
    seal_receipt,
)
from .routes import Completion, Context, Phase, Route
from .multipart import (
    abort_multipart_upload,
    complete_multipart_upload,
    create_multipart_upload,
    list_uploaded_parts,
    presign_upload_part,
    verify_session,
)
from .sign import presign
from .storage import delete_object, head_object

#: The wire contract this implementation speaks.
PROTOCOL_VERSION = 1


@dataclass
class Request:
    """A decoded request, independent of any framework."""

    method: str
    path: str
    query: Mapping[str, str]
    headers: Mapping[str, str]
    body: bytes

    def header(self, name: str) -> str:
        return self.headers.get(name.lower(), "")

    def json(self) -> Dict[str, Any]:
        if not self.body:
            return {}
        try:
            decoded = json.loads(self.body)
        except (ValueError, UnicodeDecodeError):
            raise UploadError("BAD_REQUEST", "Request body must be JSON") from None
        if not isinstance(decoded, dict):
            raise UploadError("BAD_REQUEST", "Request body must be a JSON object")
        return decoded


@dataclass
class Response:
    """A decoded response, independent of any framework."""

    status: int
    headers: Dict[str, str]
    body: bytes


@dataclass(frozen=True)
class _Upload:
    """What a request after presign acts on: a receipt, or — for tokens issued
    before receipts existed — the same shape rebuilt the old way."""

    key: str
    file: FileMeta
    metadata: Dict[str, Any]
    #: The client metadata presign received.
    input: Dict[str, Any] = field(default_factory=dict)
    #: The receipt's upload id; ``None`` for a v1 token.
    id: Optional[str] = None
    multipart: Optional[MultipartPlan] = None

    @classmethod
    def of(cls, receipt: Receipt) -> "_Upload":
        return cls(
            key=receipt.key,
            file=receipt.file,
            metadata=dict(receipt.metadata),
            input=dict(receipt.input),
            id=receipt.id,
            multipart=receipt.multipart,
        )

    def plan(self) -> MultipartPlan:
        if self.multipart is None:
            raise UploadError("BAD_REQUEST", "This upload is not a multipart upload")
        return self.multipart


async def _invoke(channel: Any, *args: Any) -> Any:
    """Call a channel.

    ``Route.__post_init__`` has already normalised every channel to a coroutine
    function, so this is always awaitable — but the *declared* field types
    describe what a user may pass in, which is either shape. This helper is
    where those two views meet, rather than a ``cast`` at each of the eight call
    sites.
    """
    return await channel(*args)


#: Every action this server understands. Validated before the value is echoed
#: into a response header, because ASGI encodes headers as latin-1 and an
#: unvalidated `?action=☃` would raise inside the send path — outside any
#: handler's reach, and therefore an unauthenticated crash rather than a
#: problem document.
ACTIONS = frozenset(
    {
        "presign",
        "complete",
        "multipart-init",
        "multipart-sign",
        "multipart-complete",
        "multipart-abort",
        "multipart-parts",
    }
)


class Router:
    """Serves one endpoint for a set of named routes.

    A route is a value, so registering one is an ordinary function call::

        router = Router(config)

        router.add("avatar", Route(
            schema=image(max_size="5MB"),
            authorize=[require_session],
            user=load_user,
            storage_path=lambda ctx, f: f"{ctx.user.tenant}/{f.name}",
            metadata=lambda ctx, f: {"owner_id": ctx.user.id},
            on_complete=[record_upload],
        ))

    Defaults shared by every route are given once and *prepend* to each route's
    own channels rather than replacing them. DRF made the opposite choice —
    a view's ``permission_classes`` replaces the global default — and the result
    is that adding one route-specific rule silently drops the global one.
    """

    def __init__(self, config: UploadConfig, defaults: Optional[Route] = None) -> None:
        self.config = config
        self.defaults = defaults
        self.routes: Dict[str, Route] = {}

    def add(self, name: str, route: Route) -> Route:
        """Register a route. Returns it, so it can be reused or derived from."""
        if not isinstance(route, Route):
            raise TypeError(
                f'route "{name}" is {type(route).__name__}; pass a Route. '
                "A bare schema goes in Route(schema=...)."
            )
        self.routes[name] = self._apply_defaults(route)
        return route

    def _apply_defaults(self, route: Route) -> Route:
        """Prepend the router's shared channels to a route's own."""
        if self.defaults is None:
            return route

        merged: Dict[str, Any] = {}
        for name in ("authorize", "around", "validate", "on_complete", "on_error"):
            shared = getattr(self.defaults, name)
            if shared:
                merged[name] = tuple(shared) + tuple(getattr(route, name))

        # Single-slot channels are not merged — two functions cannot both be
        # the storage path — so a route's own always wins, and the default
        # fills in only where the route is silent.
        for name in ("user", "storage_path", "metadata", "schema"):
            if getattr(route, name) is None and getattr(self.defaults, name) is not None:
                merged[name] = getattr(self.defaults, name)

        return _replace(route, **merged) if merged else route

    def describe(self) -> str:
        """Which channels each route has, for printing at boot.

        A route that has silently lost its authentication is otherwise
        invisible until someone notices the uploads. tusd added a
        ``Capabilities()`` printout for the same reason.
        """
        if not self.routes:
            return "no routes registered"
        width = max(len(name) for name in self.routes)
        return "\n".join(
            f"  {name.ljust(width)}  {route.describe()}"
            for name, route in sorted(self.routes.items())
        )

    def asgi(self):
        """This router as an ASGI application.

        Mount it directly: FastAPI, Starlette, Litestar and async Django all
        speak ASGI, so no per-framework adapter is needed.

            app.mount("/api/upload", router.asgi())
        """
        from .asgi import asgi_app

        return asgi_app(self)

    def wsgi(self):
        """This router as a WSGI application, for Flask and sync Django.

            app.wsgi_app = DispatcherMiddleware(
                app.wsgi_app, {"/api/upload": router.wsgi()}
            )
        """
        from .wsgi import wsgi_app

        return wsgi_app(self)

    # ─── dispatch ────────────────────────────────────────────────────────────

    async def handle(self, request: Request) -> Response:
        route_name = request.query.get("route", "")
        # Omitting `action` means presign, or every client would have to send a
        # parameter with only one sensible value.
        action = request.query.get("action") or "presign"
        known_action = action in ACTIONS

        # Set on every response, including failures: a client reading the header
        # to negotiate behaviour needs it most on the responses an older server
        # is likeliest to produce.
        #
        # Only values this server recognises are echoed. ASGI encodes header
        # values as latin-1, so reflecting an arbitrary query parameter raises
        # inside the send path — outside every handler, and therefore an
        # unauthenticated crash rather than a problem document. `?action=☃` was
        # enough.
        telemetry = {
            "X-Pushduck-Protocol": str(PROTOCOL_VERSION),
            "X-Pushduck-Action": action if known_action else "unknown",
        }
        if route_name in self.routes:
            telemetry["X-Pushduck-Route"] = route_name

        try:
            if not known_action:
                raise UploadError("BAD_REQUEST", f"Unknown action: {action!r}")

            if request.method == "GET" and not route_name:
                return self._json(200, telemetry, self._introspect())

            route = self.routes.get(route_name)
            if route is None:
                raise UploadError("NOT_FOUND", f'Route "{route_name}" not found')

            if action == "presign":
                return await self._presign(request, route_name, route, telemetry)
            if action == "complete":
                return await self._complete(request, route_name, route, telemetry)

            multipart = {
                "multipart-init": self._multipart_init,
                "multipart-sign": self._multipart_sign,
                "multipart-complete": self._multipart_complete,
                "multipart-abort": self._multipart_abort,
                "multipart-parts": self._multipart_parts,
            }.get(action)

            if multipart is not None:
                return await multipart(request, route_name, route, telemetry)

            raise UploadError("BAD_REQUEST", f"Unknown action: {action}")

        except Exception as error:  # noqa: BLE001 - every failure becomes a document
            # `Exception`, not `BaseException`. Catching the latter swallows
            # `asyncio.CancelledError`, so a disconnected client, a server-side
            # timeout and a graceful shutdown all turn into a 500 the framework
            # reads as a normal response — and the task refuses to cancel.
            typed = as_upload_error(error)
            document = problem_document(typed, request.path)
            body = json.dumps(document).encode("utf-8")
            headers = dict(telemetry)
            headers["Content-Type"] = "application/problem+json"
            return Response(typed.status, headers, body)

    def _introspect(self) -> Dict[str, Any]:
        return {
            "success": True,
            "protocolVersion": PROTOCOL_VERSION,
            "routes": [{"name": name, "type": "s3-upload"} for name in self.routes],
            # Optional parts of the protocol this server implements. Without it
            # a client can only discover multipart support by attempting
            # `multipart-init` and interpreting a 400, which is
            # indistinguishable from a malformed request.
            "features": ["multipart"],
        }

    # ─── lifecycle ───────────────────────────────────────────────────────────
    #
    #   authorize (list, per request, veto)
    #   user      (per request, produces ctx.user)
    #   around    (list, per request, wraps everything below)
    #     schema  (per file, produces a message)
    #     validate(list, per file, veto)
    #     storage_path (per file, produces a fragment; the library owns the result)
    #     metadata(per file, produces ctx.metadata)
    #
    # Each channel is named after what it produces, which is what makes
    # "authenticate but publish no metadata" expressible without overloading a
    # return value.

    async def _open(
        self,
        route: Route,
        request: Request,
        route_name: str,
        client_metadata: Mapping[str, Any],
        phase: Phase = "presign",
    ) -> Context[Any]:
        """Run the per-request channels and build the context.

        Once per request, not once per file. The previous design ran the
        handler inside the file loop, so a 50-file batch performed 50 session
        lookups — an amplification primitive reachable by anyone who could
        reach the endpoint.

        Runs on every request of an upload, so a caller who has lost access
        since presign is refused at the next one.
        """
        for check in route.authorize:
            await _invoke(check, request)

        user = await _invoke(route.user, request) if route.user is not None else None

        return Context(
            request=request,
            route=route_name,
            user=user,
            # Kept, but never merged into `metadata`. The name is the warning.
            client_metadata=dict(client_metadata),
            metadata={},
            phase=phase,
        )

    @contextlib.asynccontextmanager
    async def _around(self, route: Route, ctx: Context[Any]):
        """Enter every ``around`` generator, innermost last.

        The only channel that brackets rather than transforms. Django rewrote
        its entire middleware layer (DEP 0005) because the split
        ``process_request``/``process_response`` form could not guarantee that
        an entered hook would be exited — which is precisely what a transaction
        needs.
        """
        async with contextlib.AsyncExitStack() as stack:
            for wrap in route.around:
                await stack.enter_async_context(
                    contextlib.asynccontextmanager(wrap)(ctx)
                )
            yield

    async def _prepare(
        self, route: Route, ctx: Context[Any], file: FileMeta
    ) -> Tuple[str, Dict[str, Any]]:
        """Run the per-file channels. Returns ``(key, metadata)``.

        Raising ``UploadError`` from ``validate`` fails *this file* while the
        others continue, because the channel decides the scope — the same
        exception raised from ``authorize`` fails the whole request. Any other
        exception propagates: a ``TypeError`` from a bug is not a per-file
        outcome, and turning it into one would put an internal message in the
        response body.
        """
        if route.schema is not None:
            message = route.schema.validate(file)
            if message:
                raise UploadError("VALIDATION_FAILED", message)

        for check in route.validate:
            await _invoke(check, ctx, file)

        if route.storage_path is not None:
            # A fragment, not a whole path. `resolve_key` refuses traversal and
            # re-sanitises every segment, so a custom path cannot opt out of
            # the handling that keeps non-Latin filenames from colliding.
            key = resolve_key(await _invoke(route.storage_path, ctx, file), file.name)
        else:
            key = generate_key(file.name)

        # A per-file view, so one file's key and metadata cannot leak into the
        # next. The request-level context stays the shared, read-mostly part.
        scoped = _replace(ctx, storage_path=key, metadata={})

        metadata: Dict[str, Any] = {}
        if route.metadata is not None:
            produced = await _invoke(route.metadata, scoped, file)
            if not isinstance(produced, Mapping):
                raise TypeError(
                    f"the `metadata` channel returned {type(produced).__name__}; "
                    "return a mapping"
                )
            metadata = dict(produced)

        return key, metadata

    async def _report(
        self,
        route: Route,
        ctx: Optional[Context[Any]],
        file: Optional[FileMeta],
        error: BaseException,
    ) -> None:
        """Fire ``on_error``. Observational: a failure here changes nothing."""
        if ctx is None:
            return
        for observer in route.on_error:
            try:
                await _invoke(observer, ctx, file, error)
            except Exception:  # noqa: BLE001 - an observer cannot change the outcome
                pass

    # ─── presign ─────────────────────────────────────────────────────────────

    async def _presign(
        self, request: Request, route_name: str, route: Route, telemetry: Dict[str, str]
    ) -> Response:
        payload = request.json()
        files = payload.get("files")
        if not isinstance(files, list):
            raise UploadError("BAD_REQUEST", "`files` must be an array of file descriptors")

        ctx = await self._open(route, request, route_name, payload.get("metadata") or {})
        results: List[Dict[str, Any]] = []

        async with self._around(route, ctx):
            for raw in files:
                file = FileMeta.from_json(raw)

                try:
                    key, metadata = await self._prepare(route, ctx, file)
                except UploadError as error:
                    if error.status >= 500:
                        # The server is at fault — a misconfiguration. Failing
                        # one entry of a batch would report a bug in this
                        # deployment as a property of the user's file.
                        raise
                    await self._report(route, ctx, file, error)
                    results.append(
                        {
                            "success": False,
                            "file": file.to_json(),
                            "error": error.message,
                            "code": error.code,
                        }
                    )
                    continue

                scheme, host, path = self.config.object_address(key)

                # The declared size is signed, so storage refuses a body of any
                # other length and `max_size` holds for the bytes that arrive,
                # not only for the number the client sent. It is not handed back
                # in requiredHeaders: a browser sets Content-Length from the
                # body and will not let script set it.
                url = presign(
                    access_key_id=self.config.access_key_id,
                    secret_access_key=self.config.secret_access_key,
                    session_token=self.config.session_token,
                    method="PUT",
                    scheme=scheme,
                    host=host,
                    path=path,
                    region=self.config.region,
                    headers={"x-amz-acl": "private", "content-length": str(file.size)},
                    expires_in=self.config.upload_expiry,
                    now=self.config.now(),
                )

                required = {"x-amz-acl": "private"}
                if file.type:
                    required["Content-Type"] = file.type

                results.append(
                    {
                        "success": True,
                        "file": file.to_json(),
                        "presignedUrl": url,
                        "key": key,
                        "requiredHeaders": required,
                        "metadata": metadata,
                        # The upload's receipt: completion reads the key, the
                        # file and the metadata back from it instead of
                        # trusting the request, so a caller can neither finish
                        # someone else's upload nor rewrite what the channels
                        # decided here.
                        "completionToken": self._seal(
                            Receipt(
                                id=new_upload_id(),
                                route=route_name,
                                key=key,
                                file=file,
                                input=dict(ctx.client_metadata),
                                metadata=metadata,
                                exp=self._expiry(
                                    self.config.upload_expiry + COMPLETION_GRACE_SECONDS
                                ),
                            )
                        ),
                    }
                )

        return self._json(200, telemetry, {"success": True, "results": results})

    # ─── complete ────────────────────────────────────────────────────────────

    async def _complete(
        self, request: Request, route_name: str, route: Route, telemetry: Dict[str, str]
    ) -> Response:
        """Finish single-PUT uploads.

        Each completion presents the receipt its presign issued, and the receipt
        is the authority on what is being finished — which key, which file,
        which metadata. ``authorize`` and ``user`` still run, so a caller who
        has lost access since presign is refused; the ``metadata`` channel does
        not, because its answer was sealed at presign.
        """
        payload = request.json()
        completions = payload.get("completions")
        if not isinstance(completions, list):
            raise UploadError("BAD_REQUEST", "`completions` must be an array")

        receipts: List[Optional[Receipt]] = []
        refusal: Optional[UploadError] = None
        for entry in completions:
            if not isinstance(entry, dict):
                raise UploadError("BAD_REQUEST", "each completion must be an object")
            try:
                receipts.append(self._unseal(entry.get("completionToken")))
            except UploadError as error:
                receipts.append(None)
                refusal = refusal or error

        # The request-level context carries the client metadata its uploads
        # were presigned with — one presign request, one input, in practice.
        # Entries from different presigns share none; each `on_complete` still
        # sees its own upload's.
        inputs = [receipt.input for receipt in receipts if receipt is not None]
        shared = inputs[0] if inputs and all(i == inputs[0] for i in inputs) else {}

        # Caller first, then token: an anonymous caller gets the 401 that tells
        # them to sign in, not a 403 about a token they could not have.
        ctx = await self._open(route, request, route_name, shared, phase="complete")
        if refusal is not None:
            raise refusal

        mismatch = UploadError(
            "FORBIDDEN", "This completion does not match the upload it was issued for"
        )
        results: List[Dict[str, Any]] = []

        async with self._around(route, ctx):
            # Every entry is authorised before any `on_complete` fires, so a
            # batch containing one unauthorised entry cannot commit the others.
            authorised: List[_Upload] = []

            for entry, receipt in zip(completions, receipts):
                key = str(entry.get("key", ""))
                token = entry.get("completionToken")

                if receipt is not None:
                    if receipt.route != route_name or receipt.key != key or receipt.multipart:
                        raise mismatch
                    authorised.append(_Upload.of(receipt))
                    continue

                # ── no receipt: a v1 token or none (deprecated; remove in 0.9) ──
                # An upload presigned before receipts and completed after the
                # deploy keeps the behaviour it was issued under: the metadata
                # channel runs again at completion.
                if token:
                    claim = self._verify_completion(str(token))
                    if claim.get("key") != key or claim.get("route") != route_name:
                        raise mismatch
                elif route.require_completion_token:
                    raise UploadError(
                        "FORBIDDEN",
                        "This route requires the completion token issued at presign",
                    )

                file = FileMeta.from_json(entry.get("file") or {"name": key, "size": 0})
                scoped = _replace(ctx, storage_path=key, metadata={})
                metadata: Dict[str, Any] = {}
                if route.metadata is not None:
                    produced = await _invoke(route.metadata, scoped, file)
                    metadata = dict(produced) if isinstance(produced, Mapping) else {}

                authorised.append(_Upload(key=key, file=file, metadata=metadata))

            for upload in authorised:
                try:
                    results.append(await self._finalize(route, ctx, upload))
                except UploadError as error:
                    if error.status >= 500:
                        # Storage or configuration at fault: not a property of
                        # this file, as at presign.
                        raise
                    await self._report(route, ctx, upload.file, error)
                    results.append(
                        {
                            "success": False,
                            "key": upload.key,
                            "error": error.message,
                            "code": error.code,
                        }
                    )

        return self._json(200, telemetry, {"success": True, "results": results})

    async def _finalize(self, route: Route, ctx: Context[Any], upload: "_Upload") -> Dict[str, Any]:
        """The one place an upload is finished, single-PUT and multipart alike.

        Nothing about an upload's outcome depends on how large the file was:
        the same observers fire with the same record.

        1. **Observe the object.** Everything the client said about the file
           was a claim: the browser chooses the Content-Type, and signed
           lengths bind only the URLs this server issued, not every way an
           object can reach the key. So storage is asked what it holds.
           Nothing there means the upload never happened; an object that breaks
           the route's schema — too large, a type it does not accept — is
           deleted, so the schema holds for what is stored and not only for
           what was declared.
        2. **Run** ``on_complete`` with the upload's authoritative record: the
           metadata sealed at presign and the file as observed.
        """
        # A 403 here is STORAGE_ACCESS_DENIED: an upload that cannot be
        # verified is not accepted.
        stored_object = head_object(self.config, upload.key)
        if stored_object is None:
            raise UploadError(
                "NOT_FOUND", "No object was uploaded to this key — the upload did not finish"
            )

        stored = FileMeta(
            name=upload.file.name, size=stored_object.size, type=stored_object.content_type
        )
        message = route.schema.validate(stored) if route.schema is not None else None
        if message:
            delete_object(self.config, upload.key)
            raise UploadError(
                "VALIDATION_FAILED", f"The stored file was rejected and removed: {message}"
            )
        upload = _replace(upload, file=stored)

        scheme, host, path = self.config.object_address(upload.key)
        url = f"{scheme}://{host}{path}"

        scoped = _replace(
            ctx,
            storage_path=upload.key,
            client_metadata=dict(upload.input),
            metadata=dict(upload.metadata),
            phase="complete",
        )
        for observer in route.on_complete:
            await _invoke(
                observer,
                scoped,
                Completion(
                    key=upload.key,
                    file=upload.file,
                    url=url,
                    upload_id=upload.id,
                    object=stored_object,
                ),
            )

        return {
            "success": True,
            "key": upload.key,
            "url": url,
            "file": upload.file.to_json(),
            "metadata": upload.metadata,
        }

    # ─── multipart ───────────────────────────────────────────────────────────

    async def _open_upload(
        self, request: Request, route_name: str, route: Route, token: Any, phase: Phase
    ) -> Tuple[Context[Any], "_Upload"]:
        """Read a multipart upload back from its session and authorise the caller.

        ``authorize`` and ``user`` run on every call, over the client metadata
        presign received, so a revoked user cannot finish an upload they
        started. A session minted for one route never acts on another, even
        for a caller authorised on both.
        """
        receipt = self._unseal(token)

        if receipt is not None:
            ctx = await self._open(route, request, route_name, receipt.input, phase=phase)
            if receipt.route != route_name:
                raise UploadError("FORBIDDEN", "This upload does not belong to this route")
            if receipt.multipart is None:
                raise UploadError("BAD_REQUEST", "This upload is not a multipart upload")
            return ctx, _Upload.of(receipt)

        # ── v1 multipart session (deprecated; remove in 0.9) ──────────────────
        session = verify_session(self.config.secret_access_key, token)
        if session.get("route") != route_name:
            raise UploadError("FORBIDDEN", "Invalid or expired multipart session")
        ctx = await self._open(route, request, route_name, {}, phase=phase)

        key = str(session["key"])
        return ctx, _Upload(
            key=key,
            file=FileMeta(name=key, size=int(session["totalSize"])),
            metadata={},
            multipart=MultipartPlan(
                upload_id=str(session["uploadId"]), part_size=int(session["partSize"])
            ),
        )

    async def _multipart_init(
        self, request: "Request", route_name: str, route: Route, telemetry: Dict[str, str]
    ) -> "Response":
        payload = request.json()
        file = FileMeta.from_json(payload.get("file") or {})
        if file.size <= 0:
            raise UploadError(
                "BAD_REQUEST",
                "`file` with name, size and type is required to start a multipart upload",
            )

        # The same channels run here as for a single PUT, so a multipart upload
        # cannot bypass a route's constraints. Two of the three upload-library
        # CVEs found while designing this were a second entry point that skipped
        # stages the first one ran.
        ctx = await self._open(route, request, route_name, payload.get("metadata") or {})
        async with self._around(route, ctx):
            key, metadata = await self._prepare(route, ctx, file)
        upload_id = create_multipart_upload(self.config, key, file.type)
        part_size = choose_part_size(file.size, payload.get("partSize"))

        try:
            # The session *is* the upload's receipt, with the part plan
            # attached: every part request and the final assembly read it back.
            session = self._seal(
                Receipt(
                    id=new_upload_id(),
                    route=route_name,
                    key=key,
                    file=file,
                    input=dict(ctx.client_metadata),
                    metadata=metadata,
                    multipart=MultipartPlan(upload_id=upload_id, part_size=part_size),
                    exp=self._expiry(MULTIPART_RECEIPT_SECONDS),
                )
            )
        except Exception:
            # The session exists at the provider but cannot be handed out, so it
            # would be billed forever with nobody able to finish or abort it.
            abort_multipart_upload(self.config, key, upload_id)
            raise

        return self._json(
            200,
            telemetry,
            {
                "success": True,
                "session": session,
                "key": key,
                "partSize": part_size,
                "metadata": metadata,
            },
        )

    async def _multipart_sign(
        self, request: "Request", route_name: str, route: Route, telemetry: Dict[str, str]
    ) -> "Response":
        payload = request.json()
        part_numbers = payload.get("partNumbers")
        if not isinstance(part_numbers, list):
            raise UploadError("BAD_REQUEST", "`partNumbers` must be an array")

        ctx, upload = await self._open_upload(
            request, route_name, route, payload.get("session"), "upload"
        )
        plan = upload.plan()

        async with self._around(route, ctx):
            signed = self._sign_parts(upload, plan, part_numbers)

        return self._json(200, telemetry, signed)

    def _sign_parts(
        self, upload: "_Upload", plan: MultipartPlan, part_numbers: List[Any]
    ) -> List[Dict[str, Any]]:
        total = upload.file.size
        max_part = max(1, -(-total // plan.part_size))

        signed = []
        for raw in part_numbers:
            part_number = int(raw)
            # A part number outside the plan would sign a write past the end of
            # the object the session was created for.
            if part_number < 1 or part_number > max_part:
                raise UploadError("BAD_REQUEST", "Part number is outside this upload")

            start = (part_number - 1) * plan.part_size
            size = min(plan.part_size, total - start)
            signed.append(
                {
                    "partNumber": part_number,
                    "url": presign_upload_part(
                        self.config, upload.key, plan.upload_id, part_number, size
                    ),
                    "size": size,
                }
            )
        return signed

    async def _multipart_complete(
        self, request: "Request", route_name: str, route: Route, telemetry: Dict[str, str]
    ) -> "Response":
        """Stitch the parts, then finish exactly as a single-PUT completion does."""
        payload = request.json()
        parts = payload.get("parts")
        if not isinstance(parts, list):
            raise UploadError("BAD_REQUEST", "`parts` must be an array")

        ctx, upload = await self._open_upload(
            request, route_name, route, payload.get("session"), "complete"
        )

        # A v1 session never carried the file. It takes the name the client
        # gives, and still no metadata: this server never trusted the body's.
        if upload.id is None and isinstance(payload.get("file"), dict):
            upload = _replace(upload, file=FileMeta.from_json(payload["file"]))

        async with self._around(route, ctx):
            complete_multipart_upload(self.config, upload.key, upload.plan().upload_id, parts)
            result = await self._finalize(route, ctx, upload)

        return self._json(200, telemetry, result)

    async def _multipart_abort(
        self, request: "Request", route_name: str, route: Route, telemetry: Dict[str, str]
    ) -> "Response":
        ctx, upload = await self._open_upload(
            request, route_name, route, request.json().get("session"), "upload"
        )
        async with self._around(route, ctx):
            abort_multipart_upload(self.config, upload.key, upload.plan().upload_id)
        return self._json(200, telemetry, {"success": True})

    async def _multipart_parts(
        self, request: "Request", route_name: str, route: Route, telemetry: Dict[str, str]
    ) -> "Response":
        ctx, upload = await self._open_upload(
            request, route_name, route, request.json().get("session"), "upload"
        )
        async with self._around(route, ctx):
            parts = list_uploaded_parts(self.config, upload.key, upload.plan().upload_id)
        return self._json(200, telemetry, {"success": True, "parts": parts})

    # ─── receipts ────────────────────────────────────────────────────────────

    def _seal(self, receipt: Receipt) -> str:
        return seal_receipt(self.config.secret_access_key, receipt)

    def _unseal(self, token: Any) -> Optional[Receipt]:
        return open_receipt(self.config.secret_access_key, token, self.config.now())

    def _expiry(self, seconds: int) -> int:
        return int(self.config.now().timestamp()) + seconds

    # ─── completion tokens (v1, deprecated; remove in 0.9) ───────────────────
    #
    # Presign issues receipts now. These bound only a key to a route; they are
    # still accepted for uploads in flight across the deploy, and minted only by
    # tests.

    def _sign_completion(self, key: str, route: str) -> str:
        # Same construction as the TypeScript and Go servers, including the
        # purpose prefix, so the three remain interchangeable rather than
        # merely similar.
        return tokens.seal(
            self.config.secret_access_key, tokens.COMPLETION, {"key": key, "route": route}
        )

    def _verify_completion(self, token: str) -> Dict[str, Any]:
        claim = tokens.unseal(self.config.secret_access_key, tokens.COMPLETION, token)
        if not isinstance(claim, dict) or not claim.get("key"):
            # One message for every failure mode, so a probe learns nothing
            # about which part was wrong.
            raise UploadError("FORBIDDEN", "Invalid completion token")
        return claim

    # ─── helpers ─────────────────────────────────────────────────────────────

    @staticmethod
    def _json(status: int, telemetry: Mapping[str, str], body: Any) -> Response:
        headers = dict(telemetry)
        headers["Content-Type"] = "application/json"
        return Response(status, headers, json.dumps(body).encode("utf-8"))


def parse_query(query_string: str) -> Dict[str, str]:
    """Flatten a query string, keeping the first value of any repeat."""
    return {key: values[0] for key, values in parse_qs(query_string).items() if values}


__all__ = ["Router", "Request", "Response", "PROTOCOL_VERSION", "parse_query", "quote"]
