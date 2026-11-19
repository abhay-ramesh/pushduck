"""Upload receipts — the server's sealed record of what it authorised.

An upload spans several requests: presign, the transfer itself, completion, and
for multipart the part signing in between. Only presign runs with the full
picture — the caller's input, the ``metadata`` channel's decision, the key
derived from them. Every later request has to act on that decision, and the
only party carrying state between requests is the client.

So presign hands the client a receipt: the route, the key, the file as
declared, the client's metadata exactly as received, what the ``metadata``
channel returned, and an expiry, sealed with an HMAC the client cannot forge.
Later requests present the receipt instead of restating any of it, and the
server reads its own record back. That is what keeps a completion request from
rewriting the metadata ``on_complete`` sees, or pointing it at someone else's
object.

Receipts are signed, not encrypted. The presign response already returns the
metadata to the client, so sealing it exposes nothing new — but the
``metadata`` channel must never return a secret.

The format is shared with the TypeScript and Go servers, so a receipt issued by
one completes on another.
"""

from __future__ import annotations

import base64
import secrets
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Optional

from . import tokens
from .config import FileMeta
from .errors import UploadError

VERSION = 2

#: How long after a single-PUT URL expires its receipt can still complete it:
#: the PUT may start at the last moment and take a while.
COMPLETION_GRACE_SECONDS = 60 * 60

#: A large upload resumed after a network loss can span days. R2 aborts
#: abandoned multipart uploads after seven.
MULTIPART_RECEIPT_SECONDS = 7 * 24 * 60 * 60


@dataclass(frozen=True)
class MultipartPlan:
    """The provider's multipart upload, and the uniform part size agreed at init."""

    upload_id: str
    part_size: int


@dataclass(frozen=True)
class Receipt:
    """What presign authorised, as the client carries it."""

    #: Random and stable across every request of one upload, so ``on_complete``
    #: can use it as an idempotency key for a retried completion.
    id: str
    route: str
    key: str
    #: The file as the client declared it at presign.
    file: FileMeta
    #: Unix seconds; the receipt is refused from then on.
    exp: int
    #: The client's metadata exactly as presign received it.
    input: Dict[str, Any] = field(default_factory=dict)
    #: What the ``metadata`` channel returned: the authoritative record.
    metadata: Dict[str, Any] = field(default_factory=dict)
    multipart: Optional[MultipartPlan] = None

    def to_json(self) -> Dict[str, Any]:
        claim: Dict[str, Any] = {
            "v": VERSION,
            "id": self.id,
            "route": self.route,
            "key": self.key,
            "file": self.file.to_json(),
            "input": dict(self.input),
            "metadata": dict(self.metadata),
            "exp": self.exp,
        }
        if self.multipart is not None:
            claim["multipart"] = {
                "uploadId": self.multipart.upload_id,
                "partSize": self.multipart.part_size,
            }
        return claim


def new_upload_id() -> str:
    """128 random bits, base64url."""
    return base64.urlsafe_b64encode(secrets.token_bytes(16)).rstrip(b"=").decode("ascii")


def seal_receipt(secret: str, receipt: Receipt) -> str:
    """Issue the token handed to the client."""
    return tokens.seal(secret, tokens.RECEIPT, receipt.to_json())


def open_receipt(secret: str, token: Any, now: datetime) -> Optional[Receipt]:
    """Read a receipt back.

    Returns ``None`` for a token that is not a receipt at all — a v1 completion
    token, a v1 multipart session, a forgery — so the caller can try an older
    format. A genuine receipt that is expired or malformed raises ``FORBIDDEN``,
    one message for every reason, so probing a token reveals nothing about
    which part failed.
    """
    claim = tokens.unseal(secret, tokens.RECEIPT, token)
    if claim is None:
        return None

    # From here the token is genuinely ours: any further problem is a refusal,
    # not "some other format".
    refusal = UploadError("FORBIDDEN", "Invalid or expired upload receipt")

    try:
        receipt = _parse(claim)
    except (KeyError, TypeError, ValueError):
        raise refusal from None

    if receipt.exp <= now.timestamp():
        raise refusal

    return receipt


def _parse(claim: Any) -> Receipt:
    if not isinstance(claim, dict) or claim["v"] != VERSION:
        raise ValueError("not a v2 receipt")

    file, input_, metadata = claim["file"], claim["input"], claim["metadata"]
    strings = (claim["id"], claim["route"], claim["key"], file["name"], file["type"])
    if not all(isinstance(value, str) and value != "" for value in strings[:3]):
        raise ValueError("empty identity")
    if not all(isinstance(value, str) for value in strings[3:]):
        raise ValueError("malformed file")
    if not isinstance(input_, dict) or not isinstance(metadata, dict):
        raise ValueError("input and metadata must be objects")
    if not _is_number(file["size"]) or not _is_number(claim["exp"]):
        raise ValueError("size and exp must be numbers")

    multipart = None
    plan = claim.get("multipart")
    if plan is not None:
        if not isinstance(plan, dict) or not isinstance(plan["uploadId"], str):
            raise ValueError("malformed part plan")
        if not _is_number(plan["partSize"]) or plan["partSize"] <= 0:
            raise ValueError("malformed part plan")
        multipart = MultipartPlan(upload_id=plan["uploadId"], part_size=int(plan["partSize"]))

    return Receipt(
        id=claim["id"],
        route=claim["route"],
        key=claim["key"],
        file=FileMeta(name=file["name"], size=int(file["size"]), type=file["type"]),
        exp=int(claim["exp"]),
        input=input_,
        metadata=metadata,
        multipart=multipart,
    )


def _is_number(value: Any) -> bool:
    # `bool` is an `int` in Python and a different type everywhere else.
    return isinstance(value, (int, float)) and not isinstance(value, bool)
