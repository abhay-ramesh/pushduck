"""The one construction behind every token the router issues.

Receipts, multipart sessions and v1 completion tokens are all
``base64url(JSON) "." base64url(HMAC-SHA256)``, keyed from the provider's secret
access key with a per-purpose prefix, so a token minted for one purpose never
verifies as another. The key derivation (``pushduck-multipart:<purpose><secret>``)
is shared with the TypeScript and Go servers; change it in all three or not at
all.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Any, Optional

#: Token purposes. The v1 multipart session predates purposes, so its prefix is
#: empty.
RECEIPT = "receipt:"
COMPLETION = "completion:"
SESSION = ""


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _signature(secret: str, purpose: str, payload: str) -> str:
    digest = hmac.new(
        f"pushduck-multipart:{purpose}{secret}".encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _b64encode(digest)


def seal(secret: str, purpose: str, claim: Any) -> str:
    """Encode a claim and sign it for one purpose."""
    encoded = json.dumps(claim, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload = _b64encode(encoded)
    return f"{payload}.{_signature(secret, purpose, payload)}"


def unseal(secret: str, purpose: str, token: Any) -> Optional[Any]:
    """Return the decoded claim of a token signed for this purpose, else ``None``.

    ``None`` covers a malformed token, another purpose's, and a forgery alike.
    The caller decides what a refusal means, so nothing here tells them apart.
    """
    if not isinstance(token, str):
        return None

    parts = token.split(".")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return None

    if not hmac.compare_digest(parts[1], _signature(secret, purpose, parts[0])):
        return None

    try:
        padded = parts[0] + "=" * (-len(parts[0]) % 4)
        return json.loads(base64.urlsafe_b64decode(padded))
    except (ValueError, UnicodeDecodeError):
        return None
