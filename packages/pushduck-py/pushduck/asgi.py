"""ASGI adapter.

Covers FastAPI, Starlette, Litestar and async Django from one object, because
they all speak ASGI. That is Python's equivalent of the Web `Request` the
JavaScript ecosystem converged on — and the reason this package needs two
adapters rather than one per framework.

    app.mount("/api/upload", router.asgi())        # Starlette / FastAPI
    path("api/upload", router.asgi_django())       # Django, via an adapter
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict, MutableMapping

from .router import Request, Router, parse_query

Scope = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[MutableMapping[str, Any]]]
Send = Callable[[MutableMapping[str, Any]], Awaitable[None]]


def asgi_app(router: Router) -> Callable[[Scope, Receive, Send], Awaitable[None]]:
    """Wrap a router as an ASGI application."""

    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            # Websocket and lifespan scopes are not ours to answer; letting
            # them fall through is better than failing the whole application.
            return

        # The body may arrive in several messages, and a partial read produces
        # a JSON parse error that looks like a client bug.
        body = b""
        more = True
        while more:
            message = await receive()
            body += message.get("body", b"")
            more = message.get("more_body", False)

        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }

        query_string = scope.get("query_string", b"").decode("latin-1")
        path = scope.get("path", "")
        if query_string:
            path = f"{path}?{query_string}"

        response = await router.handle(
            Request(
                method=scope.get("method", "GET"),
                path=path,
                query=parse_query(query_string),
                headers=headers,
                body=body,
            )
        )

        await send(
            {
                "type": "http.response.start",
                "status": response.status,
                "headers": [
                    (key.encode("latin-1"), value.encode("latin-1"))
                    for key, value in response.headers.items()
                ],
            }
        )
        await send({"type": "http.response.body", "body": response.body})

    return app
