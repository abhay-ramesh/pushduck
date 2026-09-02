"""WSGI adapter, for Flask and synchronous Django.

ASGI covers the modern half of the ecosystem. This covers the other half, which
is large and not going anywhere — and omitting it would make "framework
agnostic" mean "agnostic among frameworks we like".
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable, Dict, Iterable, List, Tuple

from .router import Request, Router, parse_query


def wsgi_app(router: Router) -> Callable[[Dict[str, Any], Callable], Iterable[bytes]]:
    """Wrap a router as a WSGI application."""

    def app(environ: Dict[str, Any], start_response: Callable) -> Iterable[bytes]:
        try:
            length = int(environ.get("CONTENT_LENGTH") or 0)
        except ValueError:
            length = 0

        body = environ["wsgi.input"].read(length) if length else b""

        headers = {
            key[5:].replace("_", "-").lower(): value
            for key, value in environ.items()
            if key.startswith("HTTP_")
        }
        for key in ("CONTENT_TYPE", "CONTENT_LENGTH"):
            if environ.get(key):
                headers[key.replace("_", "-").lower()] = environ[key]

        query_string = environ.get("QUERY_STRING", "")
        path = environ.get("PATH_INFO", "")
        if query_string:
            path = f"{path}?{query_string}"

        request = Request(
            method=environ.get("REQUEST_METHOD", "GET"),
            path=path,
            query=parse_query(query_string),
            headers=headers,
            body=body,
        )

        # The router is async because ASGI handlers are; a WSGI server has no
        # loop of its own, so one is run here for the duration of the request.
        response = asyncio.run(router.handle(request))

        start_response(
            f"{response.status} ",
            [(key, value) for key, value in response.headers.items()],
        )
        return [response.body]

    return app
