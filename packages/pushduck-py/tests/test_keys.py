"""The shared object-key case table.

``packages/pushduck/src/__tests__/fixtures/key-cases.json`` is read by the
TypeScript, Python and Go suites alike, so a rule changed in one language and
not the others fails CI instead of quietly giving one upload two keys.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pushduck import UploadError
from pushduck.keys import generate_key, resolve_key

CASES = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "pushduck/src/__tests__/fixtures/key-cases.json"
    ).read_text(encoding="utf-8")
)


def _label(text: str) -> str:
    return ascii(text[:40])


@pytest.mark.parametrize("case", CASES["accept"], ids=lambda c: _label(c["fragment"]))
def test_accepts(case):
    assert resolve_key(case["fragment"], "x") == case["key"]


@pytest.mark.parametrize("case", CASES["reject"], ids=lambda c: _label(c["fragment"]))
def test_rejects(case):
    with pytest.raises(UploadError) as raised:
        resolve_key(case["fragment"], "x")
    assert raised.value.code == "VALIDATION_FAILED"


@pytest.mark.parametrize("case", CASES["default"], ids=lambda c: _label(c["name"]))
def test_default_key(case):
    assert generate_key(case["name"]) == case["key"]


def test_a_lone_surrogate_is_refused_not_a_crash():
    """JSON can carry one; UTF-8 cannot encode it. Encoding used to raise
    ``UnicodeEncodeError`` deep inside signing."""
    with pytest.raises(UploadError) as raised:
        resolve_key("a\ud800b.png", "x")
    assert raised.value.code == "VALIDATION_FAILED"
    assert "well-formed" in raised.value.message
