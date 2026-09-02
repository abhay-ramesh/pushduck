"""Configuration, routes and validation.

The TypeScript package uses a fluent builder because TypeScript's inference
carries types through each link of the chain. Go uses structs with functional
options because that is what a Go developer reads without explanation.

Python's equivalent is dataclasses and decorators. A route is declared with
``@router.route(...)`` and its middleware *is* the decorated function — there is
no separate middleware concept to learn, because a Python developer already
expects a decorated handler to run on every request.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional, Sequence

from .errors import UploadError


@dataclass
class UploadConfig:
    """Provider credentials and defaults."""

    bucket: str
    region: str = "us-east-1"
    access_key_id: str = ""
    secret_access_key: str = ""
    #: Set when credentials come from STS rather than a static key pair.
    session_token: Optional[str] = None
    #: Overrides the AWS host for S3-compatible providers (R2, MinIO, Spaces).
    endpoint: Optional[str] = None
    #: Puts the bucket in the path rather than the hostname. MinIO and R2
    #: require it.
    force_path_style: bool = False
    upload_expiry: int = 3600
    #: Injectable so signatures are reproducible in tests.
    now: Callable[[], datetime] = field(
        default=lambda: datetime.now(timezone.utc), repr=False
    )

    def object_address(self, key: str) -> "tuple[str, str, str]":
        """Return ``(scheme, host, path)`` for an object.

        Honours path-style addressing, which some providers require and which
        changes where the bucket name appears.
        """
        if self.endpoint:
            scheme = "http" if self.endpoint.startswith("http://") else "https"
            host = re.sub(r"^https?://", "", self.endpoint)
            if self.force_path_style:
                return scheme, host, f"/{self.bucket}/{key}"
            return scheme, f"{self.bucket}.{host}", f"/{key}"

        return (
            "https",
            f"{self.bucket}.s3.{self.region}.amazonaws.com",
            f"/{key}",
        )


@dataclass
class FileMeta:
    """What a client claims about a file before uploading it.

    Untrusted. The size and type are assertions, which is why the route
    validates them and the provider enforces its own limits independently.
    """

    name: str
    size: int
    type: str = ""

    @classmethod
    def from_json(cls, raw: object) -> "FileMeta":
        if not isinstance(raw, dict):
            raise UploadError("BAD_REQUEST", "`file` must be an object")
        return cls(
            name=str(raw.get("name", "")),
            size=int(raw.get("size", 0) or 0),
            type=str(raw.get("type", "") or ""),
        )

    def to_json(self) -> Dict[str, object]:
        return {"name": self.name, "size": self.size, "type": self.type}


_SIZE_UNITS = (("TB", 1 << 40), ("GB", 1 << 30), ("MB", 1 << 20), ("KB", 1 << 10), ("B", 1))


def parse_size(size: "str | int") -> int:
    """Accept ``"5MB"`` and ``"1.5GB"`` as well as a plain byte count."""
    if isinstance(size, int):
        return size

    text = size.strip().upper()
    for suffix, factor in _SIZE_UNITS:
        if text.endswith(suffix):
            return int(float(text[: -len(suffix)].strip()) * factor)

    raise ValueError(f"invalid size {size!r}: expected a unit (B, KB, MB, GB, TB)")


def format_size(size: int) -> str:
    """Match the TypeScript and Go wording exactly.

    A user sees this string, so it should not depend on which server answered.
    """
    if size >= 1 << 30:
        return f"{size / (1 << 30):.1f}GB"
    if size >= 1 << 20:
        return f"{size / (1 << 20):.1f}MB"
    if size >= 1 << 10:
        return f"{size / (1 << 10):.1f}KB"
    return f"{size}B"


@dataclass
class Route:
    """One named upload endpoint."""

    max_size: Optional[int] = None
    allow_types: Sequence[str] = ()
    #: The decorated function. Runs on every operation for this route and may
    #: raise to reject; whatever it returns becomes the upload's metadata.
    handler: Optional[Callable[..., object]] = None
    #: Whether the handler takes ``(request, file)`` rather than ``(request)``.
    #: Resolved once at registration, so an unsupported signature fails at
    #: import time rather than on a user's first upload.
    handler_wants_file: bool = False
    #: Reject a completion presenting no token. Off by default so clients older
    #: than the token keep working.
    require_completion_token: bool = False

    def validate(self, file: FileMeta) -> Optional[str]:
        """Return a message when the file violates this route's constraints.

        A message rather than an exception, because a constraint violation is a
        *per-file* outcome reported inside a 200 — not a request failure. It is
        the rule most easily implemented backwards, and the conformance suite
        exists to pin it down.
        """
        if self.max_size is not None and file.size > self.max_size:
            return (
                f"File size {format_size(file.size)} "
                f"exceeds maximum {format_size(self.max_size)}"
            )

        if not self.allow_types:
            return None

        for allowed in self.allow_types:
            if allowed.endswith("/*"):
                if file.type.startswith(allowed[:-1]):
                    return None
            elif file.type == allowed:
                return None

        return f"File type {file.type} is not allowed"


def image(max_size: "str | int | None" = None, **kwargs: object) -> Route:
    """A route restricted to images."""
    return file(max_size=max_size, allow_types=("image/*",), **kwargs)  # type: ignore[arg-type]


def file(  # noqa: A001 - reads naturally at the call site
    max_size: "str | int | None" = None,
    allow_types: Sequence[str] = (),
    require_completion_token: bool = False,
) -> Route:
    """A route with no type restriction unless ``allow_types`` is given."""
    return Route(
        max_size=parse_size(max_size) if max_size is not None else None,
        allow_types=tuple(allow_types),
        require_completion_token=require_completion_token,
    )


# ─── multipart limits ────────────────────────────────────────────────────────

MIB = 1 << 20
#: The intersection of every supported provider's limits.
MIN_PART_SIZE = 5 * MIB
MAX_PART_SIZE = 5 * 1024 * MIB
MAX_PARTS = 10_000


def choose_part_size(total_size: int, requested: Optional[int]) -> int:
    """Clamp a requested part size into the provider-safe range.

    Parts are uniform except the last. Stricter than S3 requires and
    deliberate: Cloudflare R2 rejects an upload whose non-final parts differ in
    size, so uniform parts are the only sizing that works everywhere.
    """
    size = requested or MIN_PART_SIZE
    size = max(MIN_PART_SIZE, min(size, MAX_PART_SIZE))

    # At the 5 MiB floor the 10,000-part cap is reached at roughly 48.8 GiB, so
    # beyond that the part size has to grow with the file.
    if total_size > size * MAX_PARTS:
        size = min(MAX_PART_SIZE, 1 << math.ceil(math.log2(total_size / MAX_PARTS)))

    return size
