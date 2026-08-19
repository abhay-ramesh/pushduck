"""Runs the Python implementation against the shared conformance suite.

    python3 cmd/conformance_server.py
    pnpm conformance --url http://localhost:4322/api/upload

Uses `http.server` so the suite can be run with no dependencies at all —
including no ASGI server — which matters for a package whose selling point is
that it drags nothing into your application.
"""

from __future__ import annotations

import asyncio
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pushduck import Request, Router, UploadConfig, UploadError, file, image  # noqa: E402
from pushduck.router import parse_query  # noqa: E402

PORT = int(os.environ.get("PORT", "4322"))

config = UploadConfig(
    bucket="conformance-bucket",
    region="us-east-1",
    access_key_id="conformance-key",
    secret_access_key="conformance-secret",
)

router = Router(config)

# Exactly the route surface `conformance/README.md` requires, so a failure means
# the implementation disagrees with the protocol rather than that the servers
# were configured differently.
router.add_route("imageUpload", image(max_size="5MB"))
router.add_route("fileUpload", file(max_size="50MB"))


@router.route("privateUpload", file(max_size="5MB"))
def private_upload(request: Request) -> dict:
    if request.header("authorization") != "Bearer conformance-token":
        raise UploadError("UNAUTHORIZED", "Sign in to upload")
    return {"userId": "conformance-user"}


@router.route("strictUpload", file(max_size="5MB"))
def strict_upload(request: Request) -> None:
    """Authenticates and returns nothing.

    The shape that reveals whether an implementation treats "no metadata" as
    "keep whatever the client sent".
    """
    if request.header("authorization") != "Bearer conformance-token":
        raise UploadError("UNAUTHORIZED", "Sign in to upload")
    return None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _serve(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""

        path, _, query_string = self.path.partition("?")

        response = asyncio.run(
            router.handle(
                Request(
                    method=self.command,
                    path=self.path,
                    query=parse_query(query_string),
                    headers={k.lower(): v for k, v in self.headers.items()},
                    body=body,
                )
            )
        )

        self.send_response(response.status)
        for key, value in response.headers.items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(response.body)))
        self.end_headers()
        self.wfile.write(response.body)

    do_GET = _serve
    do_POST = _serve

    def log_message(self, *args: object) -> None:  # noqa: D102 - quiet by default
        pass


if __name__ == "__main__":
    print(f"Python conformance server on http://localhost:{PORT}/api/upload", flush=True)
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()
