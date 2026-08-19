"""Multipart uploads: provider operations and session tokens.

The four S3 calls are made with ``urllib.request`` and parsed with
``xml.etree``, both stdlib, so this package still installs nothing. Pulling in
boto3 for four requests would be larger than everything else here combined.

Three provider behaviours below are not obvious from the API documentation. They
were learnt expensively in the TypeScript implementation and reproduced here
rather than rediscovered, which is the whole point of having a shared protocol:

* S3 can return an error document with HTTP 200. ``CompleteMultipartUpload``
  streams its response, so it commits to a status before it knows whether the
  operation succeeded. Checking only the status treats a failure as success.
* ``ListParts`` is paginated, and a truncated listing looks exactly like a
  complete one — which makes a resuming client re-upload parts the provider
  already holds.
* Aborting an upload that is already gone returns 404, which is the desired end
  state rather than an error.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request
import xml.etree.ElementTree as ElementTree
from typing import Any, Dict, List, Mapping, Optional, Tuple

from .config import UploadConfig
from .errors import UploadError
from .sign import presign

#: S3 namespaces every element in these responses.
_NS = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}


def _text(element: Optional[ElementTree.Element], path: str) -> str:
    if element is None:
        return ""
    # Try namespaced first, then bare: MinIO and AWS agree, but some
    # S3-compatible providers omit the namespace entirely.
    found = element.find(f"s3:{path}", _NS)
    if found is None:
        found = element.find(path)
    return (found.text or "").strip() if found is not None else ""


def _provider_error(operation: str, code: str, message: str) -> UploadError:
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


def _signed_request(
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
            payload = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        payload = error.read()
        status = error.code
    except OSError as error:  # DNS, refused connection, TLS
        raise UploadError("STORAGE_UNAVAILABLE", "Could not reach storage") from error

    # An error document can arrive with a 200, so the body is inspected
    # regardless of status.
    if b"<Error" in payload:
        try:
            root = ElementTree.fromstring(payload)
            code = _text(root, "Code")
            if code:
                raise _provider_error(operation, code, _text(root, "Message"))
        except ElementTree.ParseError:
            pass

    if status >= 400:
        raise _provider_error(operation, f"HTTP{status}", payload.decode("utf-8", "replace")[:200])

    return payload


def create_multipart_upload(config: UploadConfig, key: str, content_type: str) -> str:
    """Start a session and return the provider's upload id."""
    headers = {"x-amz-acl": "private"}
    if content_type:
        headers["content-type"] = content_type

    payload = _signed_request(
        config,
        "POST",
        key,
        query={"uploads": ""},
        headers=headers,
        operation="CreateMultipartUpload",
    )

    upload_id = _text(ElementTree.fromstring(payload), "UploadId")
    if not upload_id:
        raise UploadError("STORAGE_UNAVAILABLE", "CreateMultipartUpload returned no upload id")

    return upload_id


def presign_upload_part(
    config: UploadConfig, key: str, upload_id: str, part_number: int
) -> str:
    """Return a URL the browser can PUT one part to.

    ``partNumber`` and ``uploadId`` go into the canonical request *before*
    signing. Appending them afterwards signs a different URL than the one used.
    """
    scheme, host, path = config.object_address(key)

    return presign(
        access_key_id=config.access_key_id,
        secret_access_key=config.secret_access_key,
        session_token=config.session_token,
        method="PUT",
        scheme=scheme,
        host=host,
        path=path,
        region=config.region,
        query={"partNumber": str(part_number), "uploadId": upload_id},
        expires_in=config.upload_expiry,
        now=config.now(),
    )


def complete_multipart_upload(
    config: UploadConfig, key: str, upload_id: str, parts: List[Dict[str, Any]]
) -> None:
    """Stitch the parts into an object."""
    # Providers reject an unordered list, and the client is not required to send
    # them in order.
    ordered = sorted(parts, key=lambda part: int(part.get("partNumber", 0)))

    document = ["<CompleteMultipartUpload>"]
    for part in ordered:
        # The ETag is echoed exactly as the provider gave it, quotes included.
        # Stripping them produces `InvalidPart` after every byte has already
        # been transferred.
        etag = str(part.get("etag", "")).replace("&", "&amp;").replace("<", "&lt;")
        document.append(
            f"<Part><PartNumber>{int(part.get('partNumber', 0))}</PartNumber>"
            f"<ETag>{etag}</ETag></Part>"
        )
    document.append("</CompleteMultipartUpload>")

    _signed_request(
        config,
        "POST",
        key,
        query={"uploadId": upload_id},
        body="".join(document).encode("utf-8"),
        headers={"content-type": "application/xml"},
        operation="CompleteMultipartUpload",
    )


def abort_multipart_upload(config: UploadConfig, key: str, upload_id: str) -> None:
    """Discard a session and its parts.

    Abandoned parts are billed until removed and do not appear in a normal
    object listing, so this runs on any permanent failure.
    """
    try:
        _signed_request(
            config,
            "DELETE",
            key,
            query={"uploadId": upload_id},
            operation="AbortMultipartUpload",
        )
    except UploadError as error:
        # Already gone is the desired end state, not a failure.
        if error.code == "NOT_FOUND":
            return
        raise


def list_uploaded_parts(
    config: UploadConfig, key: str, upload_id: str
) -> List[Dict[str, Any]]:
    """Report which parts the provider actually holds.

    This is what makes resume possible: the client's own record is a hint, and
    the provider is the authority.
    """
    parts: List[Dict[str, Any]] = []
    marker = ""

    while True:
        query = {"uploadId": upload_id}
        if marker:
            query["part-number-marker"] = marker

        payload = _signed_request(
            config, "GET", key, query=query, operation="ListParts"
        )

        try:
            root = ElementTree.fromstring(payload)
        except ElementTree.ParseError as error:
            raise UploadError("STORAGE_UNAVAILABLE", "ListParts returned malformed XML") from error

        found = root.findall("s3:Part", _NS) or root.findall("Part")
        for element in found:
            etag = _text(element, "ETag")
            # A part with no ETag cannot be completed with, so including it
            # would produce `InvalidPart` much later.
            if not etag:
                continue
            parts.append({"partNumber": int(_text(element, "PartNumber") or 0), "etag": etag})

        # A truncated listing is indistinguishable from a complete one unless
        # this flag is honoured, and stopping early makes a resuming client
        # re-upload parts the provider already has.
        truncated = _text(root, "IsTruncated").lower() == "true"
        next_marker = _text(root, "NextPartNumberMarker")
        if not truncated or not next_marker:
            return parts
        marker = next_marker


# ─── session tokens ──────────────────────────────────────────────────────────


def _session_signature(secret: str, payload: str) -> str:
    signature = hmac.new(
        f"pushduck-multipart:{secret}".encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")


def sign_session(secret: str, session: Mapping[str, Any]) -> str:
    """Issue a token binding a key, upload id and route.

    Not a convenience. If a client sent ``{key, uploadId}`` directly, anyone who
    guessed or observed that pair could sign parts for — or abort — another
    user's upload. Middleware authenticates the caller; nothing would tie the
    caller to the object.
    """
    claim = json.dumps(dict(session), separators=(",", ":"), sort_keys=True)
    payload = base64.urlsafe_b64encode(claim.encode("utf-8")).rstrip(b"=").decode("ascii")
    return f"{payload}.{_session_signature(secret, payload)}"


def verify_session(secret: str, token: Any) -> Dict[str, Any]:
    """Verify a token and return the session it asserts.

    One message for every failure mode, so a probe learns nothing about which
    part was wrong.
    """
    rejection = UploadError("FORBIDDEN", "Invalid or expired multipart session")

    if not isinstance(token, str):
        raise rejection

    parts = token.split(".")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise rejection

    if not hmac.compare_digest(parts[1], _session_signature(secret, parts[0])):
        raise rejection

    try:
        padded = parts[0] + "=" * (-len(parts[0]) % 4)
        session = json.loads(base64.urlsafe_b64decode(padded))
    except (ValueError, UnicodeDecodeError) as error:
        raise rejection from error

    # A valid signature over a malformed payload must still not proceed.
    if (
        not isinstance(session, dict)
        or not session.get("key")
        or not session.get("uploadId")
        or int(session.get("partSize") or 0) <= 0
    ):
        raise rejection

    return session
