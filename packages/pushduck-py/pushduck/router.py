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
import inspect
import json
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Mapping, Optional, Tuple, Union
from urllib.parse import parse_qs, quote

from .config import FileMeta, Route, UploadConfig, choose_part_size, file as file_route
from .errors import UploadError, as_upload_error, problem_document
from .keys import generate_key
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


Handler = Callable[..., Union[Optional[Dict[str, Any]], Awaitable[Optional[Dict[str, Any]]]]]


class Router:
    """Serves one endpoint for a set of named routes.

    Routes are declared with the decorator, because a Python developer already
    expects a decorated handler to run on every request — so there is no
    separate middleware concept to learn:

        router = Router(config)

        @router.route("imageUpload", image(max_size="5MB"))
        async def image_upload(request):
            user = await authenticate(request)
            return {"user_id": user.id}
    """

    def __init__(self, config: UploadConfig) -> None:
        self.config = config
        self.routes: Dict[str, Route] = {}

    def route(self, name: str, schema: Optional[Route] = None) -> Callable[[Handler], Handler]:
        """Register a route and its handler."""

        def decorate(handler: Handler) -> Handler:
            definition = schema or file_route()
            definition.handler = handler
            self.routes[name] = definition
            return handler

        return decorate

    def add_route(self, name: str, schema: Route) -> None:
        """Register a route with no handler, for the plainest possible case."""
        self.routes[name] = schema

    # ─── dispatch ────────────────────────────────────────────────────────────

    async def handle(self, request: Request) -> Response:
        route_name = request.query.get("route", "")
        # Omitting `action` means presign, or every client would have to send a
        # parameter with only one sensible value.
        action = request.query.get("action") or "presign"

        # Set on every response, including failures: a client reading the
        # header to negotiate behaviour needs it most on the responses an older
        # server is likeliest to produce.
        telemetry = {
            "X-Pushduck-Protocol": str(PROTOCOL_VERSION),
            "X-Pushduck-Action": action,
        }
        if route_name:
            telemetry["X-Pushduck-Route"] = route_name

        try:
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

        except BaseException as error:  # noqa: BLE001 - every failure becomes a document
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

    async def _run_handler(
        self, route: Route, request: Request, file: FileMeta, seed: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Invoke the route's handler, sync or async.

        Accepting both is not indulgence: Django and Flask users write sync
        handlers, and forcing `async def` on them would make this package feel
        foreign in half the ecosystem it targets.
        """
        if route.handler is None:
            return seed

        parameters = inspect.signature(route.handler).parameters
        arguments: List[Any] = [request]
        if len(parameters) > 1:
            arguments.append(file)

        produced = route.handler(*arguments)
        if inspect.isawaitable(produced):
            produced = await produced

        return produced if isinstance(produced, dict) else seed

    # ─── presign ─────────────────────────────────────────────────────────────

    async def _presign(
        self, request: Request, route_name: str, route: Route, telemetry: Dict[str, str]
    ) -> Response:
        payload = request.json()
        files = payload.get("files")
        if not isinstance(files, list):
            raise UploadError("BAD_REQUEST", "`files` must be an array of file descriptors")

        client_metadata = payload.get("metadata") or {}
        results: List[Dict[str, Any]] = []

        for raw in files:
            file = FileMeta.from_json(raw)

            # The handler authenticates the *request*, so a rejection fails all
            # of it. A constraint violation is per-file. That distinction is the
            # one the conformance suite exists to pin down.
            metadata = await self._run_handler(route, request, file, dict(client_metadata))

            message = route.validate(file)
            if message:
                results.append({"success": False, "file": file.to_json(), "error": message})
                continue

            key = generate_key(file.name)
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

        # Authorised in full before any hook runs, so a batch containing one
        # unauthorised entry cannot fire the handler for the others.
        authorised: List[Tuple[Dict[str, Any], FileMeta, str]] = []

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
            metadata = await self._run_handler(
                route, request, file, dict(entry.get("metadata") or {})
            )
            authorised.append((metadata, file, key))

        results = []
        for metadata, file, key in authorised:
            scheme, host, path = self.config.object_address(key)
            results.append(
                {
                    "success": True,
                    "key": key,
                    "url": f"{scheme}://{host}{path}",
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

        await self._run_handler(
            route, request, FileMeta(str(session["key"]), int(session.get("totalSize") or 0)), {}
        )

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

        # Handler and validation run here exactly as they do for a single PUT,
        # so a multipart upload cannot bypass a route's constraints.
        metadata = await self._run_handler(
            route, request, file, dict(payload.get("metadata") or {})
        )

        message = route.validate(file)
        if message:
            raise UploadError("VALIDATION_FAILED", message)

        key = generate_key(file.name)
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
