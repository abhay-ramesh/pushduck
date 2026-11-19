"""Signed requests to the provider, and the single-object operations.

Made with ``urllib.request`` and parsed with ``xml.etree``, both stdlib, so
this package still installs nothing. Pulling in boto3 for a handful of requests
would be larger than everything else here combined.
"""

from __future__ import annotations

import urllib.error
import urllib.request
import xml.etree.ElementTree as ElementTree
from dataclasses import dataclass
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Mapping, Optional, Tuple

from .config import UploadConfig
from .errors import UploadError
from .sign import presign

#: S3 namespaces every element in these responses.
NS = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}


def text(element: Optional[ElementTree.Element], path: str) -> str:
    if element is None:
        return ""
    # Try namespaced first, then bare: MinIO and AWS agree, but some
    # S3-compatible providers omit the namespace entirely.
    found = element.find(f"s3:{path}", NS)
    if found is None:
        found = element.find(path)
    return (found.text or "").strip() if found is not None else ""


def provider_error(operation: str, code: str, message: str) -> UploadError:
    """Map a provider code onto a protocol code.

    The provider's own code stays in the message because that is what a
    developer searches for; the protocol code is what a client branches on.
    """
    if code in ("AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch"):
        return UploadError(
            "STORAGE_ACCESS_DENIED", f"{operation} denied by storage ({code}): {message}"
        )
    if code == "NoSuchUpload":
        return UploadError(
            "NOT_FOUND", f"{operation} failed: the multipart session no longer exists"
        )
    if code in ("EntityTooSmall", "InvalidPart", "InvalidPartOrder"):
        return UploadError("BAD_REQUEST", f"{operation} rejected ({code}): {message}")
    return UploadError("STORAGE_UNAVAILABLE", f"{operation} failed ({code}): {message}")


def _send(
    config: UploadConfig,
    method: str,
    key: str,
    *,
    query: Optional[Mapping[str, str]] = None,
    body: bytes = b"",
    headers: Optional[Mapping[str, str]] = None,
) -> Tuple[int, Mapping[str, str], bytes]:
    """Sign and send one request. Returns ``(status, headers, body)`` whatever the status."""
    scheme, host, path = config.object_address(key)

    url = presign(
        access_key_id=config.access_key_id,
        secret_access_key=config.secret_access_key,
        session_token=config.session_token,
        method=method,
        scheme=scheme,
        host=host,
        path=path,
        region=config.region,
        query=query,
        headers=headers,
        expires_in=900,
        now=config.now(),
    )

    request = urllib.request.Request(url, data=body or None, method=method)
    for name, value in (headers or {}).items():
        request.add_header(name, value)

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()
    except OSError as error:  # DNS, refused connection, TLS
        raise UploadError("STORAGE_UNAVAILABLE", "Could not reach storage") from error


def signed_request(
    config: UploadConfig,
    method: str,
    key: str,
    *,
    query: Optional[Mapping[str, str]] = None,
    body: bytes = b"",
    headers: Optional[Mapping[str, str]] = None,
    operation: str = "storage request",
) -> bytes:
    """Sign, send, and return the body — converting any failure into an UploadError."""
    status, _, payload = _send(config, method, key, query=query, body=body, headers=headers)

    # An error document can arrive with a 200, so the body is inspected
    # regardless of status.
    if b"<Error" in payload:
        try:
            root = ElementTree.fromstring(payload)
            code = text(root, "Code")
            if code:
                raise provider_error(operation, code, text(root, "Message"))
        except ElementTree.ParseError:
            pass

    if status >= 400:
        raise provider_error(operation, f"HTTP{status}", payload.decode("utf-8", "replace")[:200])

    return payload


# ─── single objects ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ObjectInfo:
    """A stored object, as the provider reports it.

    Everything a client says about a file is a claim; this is the observation.
    Use ``size`` for billing and quotas, never a declared size.
    """

    size: int
    content_type: str
    #: Without its surrounding quotes.
    etag: str
    last_modified: Optional[datetime]


def head_object(config: UploadConfig, key: str) -> Optional[ObjectInfo]:
    """Report the object at ``key``, or ``None`` when there is none.

    A 403 is not read as "missing". S3 and R2 answer 403 for a missing object
    when the credential lacks ListBucket, and treating that as absence would
    refuse every upload for a reason nobody could see.
    """
    status, headers, _ = _send(config, "HEAD", key)

    if status == 404:
        return None
    if status == 403:
        raise UploadError(
            "STORAGE_ACCESS_DENIED",
            "HeadObject denied by storage: the credential cannot read uploaded objects",
        )
    if status >= 300:
        raise UploadError("STORAGE_UNAVAILABLE", f"HeadObject failed with HTTP {status}")

    try:
        size = int(headers.get("Content-Length", ""))
    except ValueError:
        raise UploadError("STORAGE_UNAVAILABLE", "HeadObject returned no Content-Length") from None

    try:
        modified: Optional[datetime] = parsedate_to_datetime(headers.get("Last-Modified", ""))
    except (TypeError, ValueError):
        modified = None

    return ObjectInfo(
        size=size,
        content_type=headers.get("Content-Type", ""),
        etag=headers.get("ETag", "").strip('"'),
        last_modified=modified,
    )


def delete_object(config: UploadConfig, key: str) -> None:
    """Remove the object at ``key``. Already gone is success."""
    status, _, payload = _send(config, "DELETE", key)
    if status == 404 or status < 300:
        return
    raise provider_error("DeleteObject", f"HTTP{status}", payload.decode("utf-8", "replace")[:200])
