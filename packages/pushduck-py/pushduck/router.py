"""The router: dispatch, presign, complete, and completion tokens.

Framework-agnosticism in Python means ASGI, which covers FastAPI, Starlette,
Litestar and async Django — plus a WSGI shim for Flask and sync Django. But the
core here is neither: it is a plain function from a decoded request to a decoded
response, so the adapters in ``asgi.py`` and ``wsgi.py`` are a dozen lines each
and a framework nobody has written an adapter for can still be served.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import contextlib
import json
from dataclasses import dataclass, replace as _replace
from typing import Any, Dict, List, Mapping, Optional, Tuple
from urllib.parse import parse_qs, quote

from .config import FileMeta, Schema, UploadConfig, choose_part_size
from .errors import UploadError, as_upload_error, problem_document
from .keys import generate_key, resolve_key
from .routes import Completion, Context, Route
from .multipart import (
    abort_multipart_upload,
    complete_multipart_upload,
    create_multipart_upload,
    list_uploaded_parts,
    presign_upload_part,
    sign_session,
    verify_session,
)
from .sign import presign

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
    ) -> Context[Any]:
        """Run the per-request channels and build the context.

        Once per request, not once per file. The previous design ran the
        handler inside the file loop, so a 50-file batch performed 50 session
        lookups — an amplification primitive reachable by anyone who could
        reach the endpoint.
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
                        # The server is at fault — a key channel returning `..`,
                        # a misconfiguration. Failing one entry of a batch would
                        # report a bug in this deployment as a property of the
                        # user's file.
                        raise
                    await self._report(route, ctx, file, error)
                    results.append(
                        {"success": False, "file": file.to_json(), "error": error.message}
                    )
                    continue

                scheme, host, path = self.config.object_address(key)

                url = presign(
                    access_key_id=self.config.access_key_id,
                    secret_access_key=self.config.secret_access_key,
                    session_token=self.config.session_token,
                    method="PUT",
                    scheme=scheme,
                    host=host,
                    path=path,
                    region=self.config.region,
                    headers={"x-amz-acl": "private"},
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
                        "completionToken": self._sign_completion(key, route_name),
                    }
                )

        return self._json(200, telemetry, {"success": True, "results": results})

    # ─── complete ────────────────────────────────────────────────────────────

    async def _complete(
        self, request: Request, route_name: str, route: Route, telemetry: Dict[str, str]
    ) -> Response:
        payload = request.json()
        completions = payload.get("completions")
        if not isinstance(completions, list):
            raise UploadError("BAD_REQUEST", "`completions` must be an array")

        ctx = await self._open(route, request, route_name, {})
        results = []

        async with self._around(route, ctx):
            # Every entry is authorised before any `on_complete` fires, so a
            # batch containing one unauthorised entry cannot commit the others.
            verified: List[Tuple[str, FileMeta, Dict[str, Any]]] = []

            for entry in completions:
                if not isinstance(entry, dict):
                    raise UploadError("BAD_REQUEST", "each completion must be an object")

                key = str(entry.get("key", ""))
                token = entry.get("completionToken")

                if token:
                    claim = self._verify_completion(str(token))
                    if claim.get("key") != key or claim.get("route") != route_name:
                        raise UploadError(
                            "FORBIDDEN",
                            "This completion does not match the upload it was issued for",
                        )
                elif route.require_completion_token:
                    raise UploadError(
                        "FORBIDDEN",
                        "This route requires the completion token issued at presign",
                    )

                file = FileMeta.from_json(entry.get("file") or {"name": key, "size": 0})

                # The metadata channel runs again rather than trusting what the
                # client echoed back. Its input is the server's context, so the
                # result cannot contain a claim the application never made.
                scoped = _replace(ctx, storage_path=key, metadata={})
                metadata: Dict[str, Any] = {}
                if route.metadata is not None:
                    produced = await _invoke(route.metadata, scoped, file)
                    metadata = dict(produced) if isinstance(produced, Mapping) else {}

                verified.append((key, file, metadata))

            for key, file, metadata in verified:
                scheme, host, path = self.config.object_address(key)
                url = f"{scheme}://{host}{path}"

                for observer in route.on_complete:
                    await _invoke(
                        observer,
                        _replace(ctx, storage_path=key, metadata=metadata),
                        Completion(key=key, file=file, url=url),
                    )

                results.append(
                    {
                        "success": True,
                        "key": key,
                        "url": url,
                        "file": file.to_json(),
                        "metadata": metadata,
                    }
                )

        return self._json(200, telemetry, {"success": True, "results": results})

    # ─── multipart ───────────────────────────────────────────────────────────

    async def _authorize_session(
        self, request: "Request", route_name: str, route: Route, token: Any
    ) -> Dict[str, Any]:
        """Verify the token *and* re-run the route's handler.

        Both are required. The token proves which object is being acted on; the
        handler proves the caller is still allowed to act. Checking only the
        token would let a revoked user finish an upload they started.
        """
        session = verify_session(self.config.secret_access_key, token)

        if session.get("route") != route_name:
            raise UploadError("FORBIDDEN", "Invalid or expired multipart session")

        # Re-runs `authorize` and `user`, so a revoked user cannot finish
        # an upload they were allowed to start.
        await self._open(route, request, route_name, {})

        return session

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
        key, metadata = await self._prepare(route, ctx, file)
        upload_id = create_multipart_upload(self.config, key, file.type)
        part_size = choose_part_size(file.size, payload.get("partSize"))

        try:
            token = sign_session(
                self.config.secret_access_key,
                {
                    "key": key,
                    "uploadId": upload_id,
                    "route": route_name,
                    "partSize": part_size,
                    "totalSize": file.size,
                },
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
                "session": token,
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

        session = await self._authorize_session(
            request, route_name, route, payload.get("session")
        )

        total = int(session["totalSize"])
        part_size = int(session["partSize"])
        max_part = max(1, -(-total // part_size))

        signed = []
        for raw in part_numbers:
            part_number = int(raw)
            # A part number outside the plan would sign a write past the end of
            # the object the session was created for.
            if part_number < 1 or part_number > max_part:
                raise UploadError("BAD_REQUEST", "Part number is outside this upload")

            start = (part_number - 1) * part_size
            signed.append(
                {
                    "partNumber": part_number,
                    "url": presign_upload_part(
                        self.config, str(session["key"]), str(session["uploadId"]), part_number
                    ),
                    "size": min(part_size, total - start),
                }
            )

        return self._json(200, telemetry, signed)

    async def _multipart_complete(
        self, request: "Request", route_name: str, route: Route, telemetry: Dict[str, str]
    ) -> "Response":
        payload = request.json()
        parts = payload.get("parts")
        if not isinstance(parts, list):
            raise UploadError("BAD_REQUEST", "`parts` must be an array")

        session = await self._authorize_session(
            request, route_name, route, payload.get("session")
        )

        complete_multipart_upload(
            self.config, str(session["key"]), str(session["uploadId"]), parts
        )

        scheme, host, path = self.config.object_address(str(session["key"]))
        return self._json(
            200,
            telemetry,
            {"success": True, "key": session["key"], "url": f"{scheme}://{host}{path}"},
        )

    async def _multipart_abort(
        self, request: "Request", route_name: str, route: Route, telemetry: Dict[str, str]
    ) -> "Response":
        session = await self._authorize_session(
            request, route_name, route, request.json().get("session")
        )
        abort_multipart_upload(self.config, str(session["key"]), str(session["uploadId"]))
        return self._json(200, telemetry, {"success": True})

    async def _multipart_parts(
        self, request: "Request", route_name: str, route: Route, telemetry: Dict[str, str]
    ) -> "Response":
        session = await self._authorize_session(
            request, route_name, route, request.json().get("session")
        )
        parts = list_uploaded_parts(self.config, str(session["key"]), str(session["uploadId"]))
        return self._json(200, telemetry, {"success": True, "parts": parts})

    # ─── completion tokens ───────────────────────────────────────────────────

    def _completion_signature(self, payload: str) -> str:
        # Same construction as the TypeScript and Go servers, including the
        # secret prefix, so the three remain interchangeable rather than merely
        # similar.
        signature = hmac.new(
            f"pushduck-multipart:completion:{self.config.secret_access_key}".encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")

    def _sign_completion(self, key: str, route: str) -> str:
        claim = json.dumps({"key": key, "route": route}, separators=(",", ":"))
        payload = base64.urlsafe_b64encode(claim.encode("utf-8")).rstrip(b"=").decode("ascii")
        return f"{payload}.{self._completion_signature(payload)}"

    def _verify_completion(self, token: str) -> Dict[str, Any]:
        # One message for every failure mode, so a probe learns nothing about
        # which part was wrong.
        rejection = UploadError("FORBIDDEN", "Invalid completion token")

        parts = token.split(".")
        if len(parts) != 2 or not parts[0] or not parts[1]:
            raise rejection

        if not hmac.compare_digest(parts[1], self._completion_signature(parts[0])):
            raise rejection

        try:
            padded = parts[0] + "=" * (-len(parts[0]) % 4)
            claim = json.loads(base64.urlsafe_b64decode(padded))
        except (ValueError, UnicodeDecodeError):
            raise rejection from None

        if not isinstance(claim, dict) or not claim.get("key"):
            raise rejection

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
