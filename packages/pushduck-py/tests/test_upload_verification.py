"""Completion accepts what was stored, not what was claimed.

The browser chooses the Content-Type it sends, and a multipart part's length is
not signed. So a route's schema, enforced at presign against the client's
declaration, is only a promise until completion checks the object itself. These
tests pin that check: completion HEADs the key, refuses an upload that never
arrived, deletes and refuses one that breaks the schema, and hands
``on_complete`` the observed size and type.
"""

from __future__ import annotations

import asyncio
import json
import re

import pytest

from pushduck import Route, Router, image
from pushduck.router import Request

DECLARED = {"name": "me.jpg", "size": 1000, "type": "image/jpeg"}


class Verification:
    def __init__(self, storage) -> None:
        self.storage = storage
        self.completed = []
        self.errors = []
        self.router = Router(storage.config())
        self.router.add("avatar", Route(
            schema=image(max_size="2KB"),
            metadata=lambda ctx, f: {"userId": "alice"},
            on_complete=[lambda ctx, done: self.completed.append(done)],
            on_error=[lambda ctx, f, error: self.errors.append(error)],
        ))

    def call(self, action, body):
        response = asyncio.run(self.router.handle(Request(
            method="POST",
            path="/api/upload",
            query={"route": "avatar", "action": action},
            headers={},
            body=json.dumps(body).encode(),
        )))
        return response.status, json.loads(response.body)

    def upload(self, stored_size=None, content_type="image/jpeg"):
        """Presign DECLARED, store ``stored_size`` bytes (or nothing), complete."""
        _, presigned = self.call("presign", {"files": [DECLARED]})
        issued = presigned["results"][0]
        if stored_size is not None:
            self.storage.put(issued["key"], stored_size, content_type)

        status, body = self.call("complete", {"completions": [{
            "key": issued["key"], "file": DECLARED,
            "completionToken": issued["completionToken"],
        }]})
        assert status == 200, body
        return body["results"][0], issued["key"]


@pytest.fixture
def verification(storage):
    return Verification(storage)


def test_on_complete_gets_the_size_and_type_that_were_stored(verification):
    result, _ = verification.upload(stored_size=1500)

    assert result["success"], result
    [done] = verification.completed
    assert done.file.to_json() == {"name": "me.jpg", "size": 1500, "type": "image/jpeg"}
    assert done.object.size == 1500 and done.object.content_type == "image/jpeg"
    assert re.fullmatch(r"[0-9a-f]+", done.object.etag)
    assert done.object.last_modified is not None
    # The client is told what was stored, too.
    assert result["file"] == done.file.to_json()


def test_a_completion_for_an_upload_that_never_arrived_fails(verification):
    result, _ = verification.upload(stored_size=None)

    assert result["success"] is False and result["code"] == "NOT_FOUND"
    assert re.search(r"no object", result["error"], re.IGNORECASE)
    assert verification.completed == []
    assert len(verification.errors) == 1


def test_an_object_larger_than_the_route_allows_is_deleted_and_refused(verification):
    # Declared within the 2KB limit, so presign agreed; then 5KB arrived.
    result, key = verification.upload(stored_size=5000)

    assert result["success"] is False and result["code"] == "VALIDATION_FAILED"
    assert verification.completed == []
    assert key not in verification.storage.objects


def test_an_object_of_a_type_the_route_refuses_is_deleted_and_refused(verification):
    result, key = verification.upload(stored_size=1000, content_type="text/html")

    assert result["success"] is False and result["code"] == "VALIDATION_FAILED"
    assert verification.completed == []
    assert key not in verification.storage.objects


def test_one_failed_file_does_not_fail_its_siblings(verification):
    files = [{**DECLARED, "name": "a.jpg"}, {**DECLARED, "name": "b.jpg"}]
    _, presigned = verification.call("presign", {"files": files})
    issued = presigned["results"]
    verification.storage.put(issued[1]["key"], 1000, "image/jpeg")  # a.jpg never arrives

    status, body = verification.call("complete", {"completions": [
        {"key": i["key"], "file": f, "completionToken": i["completionToken"]}
        for i, f in zip(issued, files)
    ]})

    assert status == 200
    assert [r["success"] for r in body["results"]] == [False, True]
    assert [done.key for done in verification.completed] == [issued[1]["key"]]


def test_multipart_assembly_is_verified_too(verification):
    _, started = verification.call("multipart-init", {"file": {**DECLARED, "name": "big.jpg"}})

    # A part's length is not signed, so the assembled object can exceed what
    # was declared. Stand in for that by storing the part directly.
    for _, parts in verification.storage.uploads.values():
        parts[1] = b"\0" * 5000

    status, body = verification.call("multipart-complete", {
        "session": started["session"], "parts": [{"partNumber": 1, "etag": '"x"'}],
    })

    assert status == 400 and body["code"] == "VALIDATION_FAILED"
    assert verification.completed == []
    assert started["key"] not in verification.storage.objects
