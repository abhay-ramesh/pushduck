"""Typed errors and RFC 9457 problem documents.

The code table is copied deliberately rather than reinvented. A client branches
on ``code`` — re-authenticating on ``UNAUTHORIZED``, retrying on
``RATE_LIMITED`` — so a Python server naming its codes differently would be a
different product wearing the same protocol.
"""

from __future__ import annotations

from typing import Any, Dict, NamedTuple, Optional


class _Definition(NamedTuple):
    status: int
    title: str
    retryable: bool


#: The same table as ``upload-error.ts``, grouped by who is at fault.
CODES: Dict[str, _Definition] = {
    "UNAUTHORIZED": _Definition(401, "Authentication required", False),
    "FORBIDDEN": _Definition(403, "Not allowed", False),
    "NOT_FOUND": _Definition(404, "Not found", False),
    "BAD_REQUEST": _Definition(400, "Malformed request", False),
    "VALIDATION_FAILED": _Definition(400, "File failed validation", False),
    "FILE_TOO_LARGE": _Definition(413, "File too large", False),
    "FILE_TYPE_NOT_ALLOWED": _Definition(415, "File type not allowed", False),
    "TOO_MANY_FILES": _Definition(400, "Too many files", False),
    "PAYLOAD_TOO_LARGE": _Definition(413, "Payload too large", False),
    "RATE_LIMITED": _Definition(429, "Rate limit exceeded", True),
    "QUOTA_EXCEEDED": _Definition(429, "Quota exceeded", True),
    "STORAGE_UNAVAILABLE": _Definition(502, "Storage unavailable", True),
    "STORAGE_ACCESS_DENIED": _Definition(502, "Storage rejected the request", False),
    "NETWORK_ERROR": _Definition(502, "Network error", True),
    "TIMEOUT": _Definition(504, "Operation timed out", True),
    "CONFIG_INVALID": _Definition(500, "Server misconfigured", False),
    "INTERNAL_ERROR": _Definition(500, "Internal error", False),
    "UPLOAD_CANCELLED": _Definition(499, "Upload cancelled", False),
}


class UploadError(Exception):
    """A failure with a protocol code, an HTTP status and a retry hint."""

    def __init__(self, code: str, message: str, *, internal: bool = False) -> None:
        super().__init__(message)
        definition = CODES.get(code) or CODES["INTERNAL_ERROR"]
        if code not in CODES:
            code = "INTERNAL_ERROR"

        self.code = code
        self.message = message
        self.status = definition.status
        self.title = definition.title
        self.retryable = definition.retryable
        #: Marks the detail as unsafe to disclose.
        self.internal = internal


def as_upload_error(error: BaseException) -> UploadError:
    """Classify any exception for the wire.

    A bare exception becomes ``INTERNAL_ERROR`` with its message withheld. That
    asymmetry is deliberate: an author who raises ``UploadError`` has decided
    the message is safe to show, whereas a database driver's exception —
    routinely carrying hostnames, credentials and query fragments — has been
    vetted by nobody.
    """
    if isinstance(error, UploadError):
        return error

    return UploadError("INTERNAL_ERROR", "An unexpected error occurred", internal=True)


def problem_document(error: UploadError, instance: str) -> Dict[str, Any]:
    """Build the RFC 9457 body."""
    # Withheld rather than blanked: the title still says what class of thing
    # happened, so the response stays useful without disclosing anything.
    detail = "" if error.internal else error.message
    slug = error.code.lower().replace("_", "-")

    document: Dict[str, Any] = {
        "type": f"https://pushduck.org/errors/{slug}",
        "title": error.title,
        "status": error.status,
        "code": error.code,
        "retryable": error.retryable,
    }

    if detail:
        document["detail"] = detail
        # Legacy mirror: clients before 0.7 render this field and would show an
        # empty failure without it.
        document["error"] = detail
    if instance:
        document["instance"] = instance

    return document
