"""pushduck — direct-to-S3 uploads for Python servers.

Speaks wire protocol version 1, so the JavaScript client talks to this server
unchanged. See https://pushduck.org/docs/protocol.
"""

from .asgi import asgi_app
from .config import (
    MAX_PART_SIZE,
    MAX_PARTS,
    MIN_PART_SIZE,
    FileMeta,
    Schema,
    UploadConfig,
    file,
    format_size,
    image,
    parse_size,
)
from .errors import UploadError
from .keys import generate_key, resolve_key
from .router import PROTOCOL_VERSION, Request, Response, Router
from .routes import Anonymous, Completion, Context, Route
from .wsgi import wsgi_app

__all__ = [
    "UploadConfig",
    "Router",
    "Route",
    "Schema",
    "Context",
    "Completion",
    "Anonymous",
    "Request",
    "Response",
    "FileMeta",
    "UploadError",
    "image",
    "file",
    "asgi_app",
    "wsgi_app",
    "generate_key",
    "resolve_key",
    "parse_size",
    "format_size",
    "PROTOCOL_VERSION",
    "MIN_PART_SIZE",
    "MAX_PART_SIZE",
    "MAX_PARTS",
]
