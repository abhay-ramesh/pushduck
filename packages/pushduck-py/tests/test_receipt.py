"""The receipt format, and agreement with the other servers on it."""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pushduck import FileMeta, UploadError  # noqa: E402
from pushduck import tokens  # noqa: E402
from pushduck.multipart import sign_session  # noqa: E402
from pushduck.receipt import (  # noqa: E402
    MultipartPlan,
    Receipt,
    new_upload_id,
    open_receipt,
    seal_receipt,
)

SECRET = "conformance-secret"
NOW = datetime(2026, 8, 11, 12, 0, tzinfo=timezone.utc)

# Sealed by the TypeScript server (`sealReceipt` in core/router/receipt.ts) with
# the secret above. The Go suite opens the same tokens. If any server changes
# the format, the key derivation or the encoding, a receipt issued by one stops
# completing on another — after a deploy, with uploads in flight.
TYPESCRIPT_RECEIPT = (
    "eyJ2IjoyLCJpZCI6IkFBRUNBd1FGQmdjSUNRb0xEQTBPRHciLCJyb3V0ZSI6ImltYWdlVXBsb2FkIiwia2V5IjoicGhvdG8uanBnIiwiZmlsZSI6eyJuYW1lIjoicGhvdG8uanBnIiwic2l6ZSI6MTAyNCwidHlwZSI6ImltYWdlL2pwZWcifSwiaW5wdXQiOnsiYWxidW1JZCI6InN1bW1lciJ9LCJtZXRhZGF0YSI6eyJ1c2VySWQiOiJ1XzEifSwiZXhwIjo0MTAyNDQ0ODAwfQ"
    ".d9mEArXz0KrWwcq9KgzX2wd65o7Qk3Fl6twVZ4ZGync"
)
TYPESCRIPT_MULTIPART_RECEIPT = (
    "eyJ2IjoyLCJpZCI6IkFBRUNBd1FGQmdjSUNRb0xEQTBPRHciLCJyb3V0ZSI6ImltYWdlVXBsb2FkIiwia2V5IjoicGhvdG8uanBnIiwiZmlsZSI6eyJuYW1lIjoicGhvdG8uanBnIiwic2l6ZSI6MTAyNCwidHlwZSI6ImltYWdlL2pwZWcifSwiaW5wdXQiOnsiYWxidW1JZCI6InN1bW1lciJ9LCJtZXRhZGF0YSI6eyJ1c2VySWQiOiJ1XzEifSwiZXhwIjo0MTAyNDQ0ODAwLCJtdWx0aXBhcnQiOnsidXBsb2FkSWQiOiJ1cGxvYWQtMSIsInBhcnRTaXplIjo1MjQyODgwfX0"
    ".Eg9vbImwxxW9CHf9Y8k0bAmg47WX0LYpydJu_f37ma4"
)
# The same receipt with exp: 1.
TYPESCRIPT_EXPIRED_RECEIPT = (
    "eyJ2IjoyLCJpZCI6IkFBRUNBd1FGQmdjSUNRb0xEQTBPRHciLCJyb3V0ZSI6ImltYWdlVXBsb2FkIiwia2V5IjoicGhvdG8uanBnIiwiZmlsZSI6eyJuYW1lIjoicGhvdG8uanBnIiwic2l6ZSI6MTAyNCwidHlwZSI6ImltYWdlL2pwZWcifSwiaW5wdXQiOnsiYWxidW1JZCI6InN1bW1lciJ9LCJtZXRhZGF0YSI6eyJ1c2VySWQiOiJ1XzEifSwiZXhwIjoxfQ"
    ".Gy-cemJ5eipYWt8rd8udszs_ezpxagmO8CgDd5LWIWA"
)


def test_opens_a_receipt_the_typescript_server_sealed():
    receipt = open_receipt(SECRET, TYPESCRIPT_RECEIPT, NOW)

    assert receipt == Receipt(
        id="AAECAwQFBgcICQoLDA0ODw",
        route="imageUpload",
        key="photo.jpg",
        file=FileMeta(name="photo.jpg", size=1024, type="image/jpeg"),
        exp=4102444800,
        input={"albumId": "summer"},
        metadata={"userId": "u_1"},
    )

    multipart = open_receipt(SECRET, TYPESCRIPT_MULTIPART_RECEIPT, NOW)
    assert multipart is not None
    assert multipart.multipart == MultipartPlan(upload_id="upload-1", part_size=5242880)


def test_seals_what_the_typescript_server_seals():
    # Python's JSON key order differs from TypeScript's, so the tokens differ
    # byte for byte; what must agree is the claim each side reads back.
    receipt = open_receipt(SECRET, TYPESCRIPT_MULTIPART_RECEIPT, NOW)
    assert receipt is not None
    resealed = seal_receipt(SECRET, receipt)
    assert tokens.unseal(SECRET, tokens.RECEIPT, resealed) == tokens.unseal(
        SECRET, tokens.RECEIPT, TYPESCRIPT_MULTIPART_RECEIPT
    )


def test_refuses_an_expired_receipt():
    with pytest.raises(UploadError) as raised:
        open_receipt(SECRET, TYPESCRIPT_EXPIRED_RECEIPT, NOW)
    assert raised.value.code == "FORBIDDEN"


def test_expires_at_exp_exactly():
    receipt = Receipt(
        id=new_upload_id(), route="r", key="k",
        file=FileMeta(name="a", size=1, type="text/plain"),
        exp=int((NOW + timedelta(minutes=1)).timestamp()),
    )
    token = seal_receipt(SECRET, receipt)

    assert open_receipt(SECRET, token, NOW) == receipt
    with pytest.raises(UploadError):
        open_receipt(SECRET, token, NOW + timedelta(minutes=1))


def test_a_malformed_receipt_under_a_valid_signature_is_refused():
    for claim in (
        {"v": 1},
        {"v": 2, "id": "", "route": "r", "key": "k"},
        {**open_receipt(SECRET, TYPESCRIPT_RECEIPT, NOW).to_json(), "input": None},  # type: ignore[union-attr]
        {**open_receipt(SECRET, TYPESCRIPT_RECEIPT, NOW).to_json(), "exp": True},  # type: ignore[union-attr]
    ):
        with pytest.raises(UploadError):
            open_receipt(SECRET, tokens.seal(SECRET, tokens.RECEIPT, claim), NOW)


@pytest.mark.parametrize(
    "token",
    [
        tokens.seal(SECRET, tokens.COMPLETION, {"key": "photo.jpg", "route": "imageUpload"}),
        sign_session(SECRET, {"key": "a", "uploadId": "u", "route": "r", "partSize": 1}),
        TYPESCRIPT_RECEIPT.split(".")[0] + ".d9mEArXz0KrWwcq9KgzX2wd65o7Qk3Fl6twVZ4ZGyn0",
        "hello",
        None,
    ],
    ids=["v1 completion token", "v1 session", "forged signature", "not a token", "absent"],
)
def test_anything_but_a_receipt_is_not_opened(token):
    # Not receipts, so not refusals either: the caller falls back to the v1
    # formats, which refuse them in their own terms.
    assert open_receipt(SECRET, token, NOW) is None


def test_upload_ids_are_unguessable():
    ids = {new_upload_id() for _ in range(100)}
    assert len(ids) == 100
    assert all(len(upload_id) == 22 for upload_id in ids)
