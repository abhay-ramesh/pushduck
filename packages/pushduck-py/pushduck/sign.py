"""SigV4 query presigning.

The only cryptography in the request path, and the only place a Python
implementation can be self-consistently wrong: a signature derived from the
wrong canonical request is still a valid-looking URL, and only the provider
rejects it.

Written out rather than delegated to boto3. One signature does not justify
dragging botocore into every application that installs this package, and the
canonical-request rules are fixed by the SigV4 specification — there is nothing
to keep up with.
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timezone
from typing import Dict, Mapping, Optional

_ALGORITHM = "AWS4-HMAC-SHA256"
_UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD"

# Characters S3 leaves unescaped in a canonical request. Deliberately not
# `urllib.parse.quote`'s default set: that leaves `/` alone in query values and
# encodes a space as `%20` only sometimes, and either difference produces a
# signature mismatch on exactly the filenames users complain about.
_UNRESERVED = frozenset(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ" "abcdefghijklmnopqrstuvwxyz" "0123456789" "-_.~"
)


def uri_encode(value: str, encode_slash: bool = True) -> str:
    """Percent-encode per S3's rules."""
    out = []
    for byte in value.encode("utf-8"):
        char = chr(byte)
        if char in _UNRESERVED:
            out.append(char)
        elif char == "/":
            out.append("%2F" if encode_slash else "/")
        else:
            out.append(f"%{byte:02X}")
    return "".join(out)


def _hmac(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _signing_key(secret: str, date_stamp: str, region: str, service: str) -> bytes:
    date = _hmac(f"AWS4{secret}".encode("utf-8"), date_stamp)
    scoped_region = _hmac(date, region)
    scoped_service = _hmac(scoped_region, service)
    return _hmac(scoped_service, "aws4_request")


def presign(
    *,
    access_key_id: str,
    secret_access_key: str,
    session_token: Optional[str],
    method: str,
    scheme: str,
    host: str,
    path: str,
    region: str,
    query: Optional[Mapping[str, str]] = None,
    headers: Optional[Mapping[str, str]] = None,
    expires_in: int = 3600,
    now: Optional[datetime] = None,
) -> str:
    """Return a fully signed URL.

    Every signed header must also be sent by the client, which is why callers
    receive ``required_headers`` back rather than being expected to guess.
    """
    moment = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    amz_date = moment.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = moment.strftime("%Y%m%d")

    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"

    # Signed headers are lowercase and sorted; the canonical form is what gets
    # hashed, not what is sent.
    canonical_headers: Dict[str, str] = {"host": host}
    for name, value in (headers or {}).items():
        canonical_headers[name.lower()] = value.strip()
    signed_header_names = sorted(canonical_headers)

    parameters: Dict[str, str] = dict(query or {})
    parameters.update(
        {
            "X-Amz-Algorithm": _ALGORITHM,
            "X-Amz-Credential": f"{access_key_id}/{credential_scope}",
            "X-Amz-Date": amz_date,
            "X-Amz-Expires": str(expires_in),
            "X-Amz-SignedHeaders": ";".join(signed_header_names),
        }
    )

    # Temporary credentials carry a third part. Omitting it makes every
    # STS-issued credential — ECS task roles, EKS IRSA, OIDC AssumeRole — fail
    # with an error that names the signature rather than the missing token.
    if session_token:
        parameters["X-Amz-Security-Token"] = session_token

    canonical_query = "&".join(
        f"{uri_encode(key)}={uri_encode(parameters[key])}" for key in sorted(parameters)
    )

    canonical_request = "\n".join(
        [
            method,
            uri_encode(path, encode_slash=False),
            canonical_query,
            "".join(f"{name}:{canonical_headers[name]}\n" for name in signed_header_names),
            ";".join(signed_header_names),
            _UNSIGNED_PAYLOAD,
        ]
    )

    string_to_sign = "\n".join(
        [_ALGORITHM, amz_date, credential_scope, _sha256_hex(canonical_request)]
    )

    signature = hmac.new(
        _signing_key(secret_access_key, date_stamp, region, "s3"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return (
        f"{scheme}://{host}{uri_encode(path, encode_slash=False)}"
        f"?{canonical_query}&X-Amz-Signature={signature}"
    )
