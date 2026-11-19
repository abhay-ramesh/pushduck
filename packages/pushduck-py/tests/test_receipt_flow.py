"""Every request of an upload acts on the decision presign made.

Presign runs the channels over the caller's input and seals the outcome into a
receipt. Each later request — completion, and for multipart the part signing,
listing, abort and assembly — reads that receipt back. These tests pin the three
consequences:

1. ``on_complete`` sees the metadata the ``metadata`` channel produced at
   presign, whatever the completion request claims.
2. Every request runs ``authorize`` again and sees the same client metadata, with
   ``ctx.phase`` saying which request this is.
3. Single-PUT and multipart uploads finish through the same step, so the same
   observers fire with the same guarantees whatever the file's size.
"""

from __future__ import annotations

import asyncio
import json
import urllib.request

import pytest

from pushduck import Route, Router, UploadError, file as file_schema
from pushduck.router import Request

FILE = {"name": "photo.jpg", "size": 1000, "type": "image/jpeg"}
SEALED = {"userId": "alice", "recordId": "record-for-abc"}


class Flow:
    """A router whose ``metadata`` channel requires ``slug`` in the client's
    metadata and returns a shape without it — the channel that broke when
    completion re-ran it over its own output."""

    def __init__(self, storage) -> None:
        self.storage = storage
        self.seen = []  # (phase, client_metadata) per request
        self.completed = []  # (ctx.metadata, Completion)

        def authorize(request):
            if not request.header("x-user"):
                raise UploadError("UNAUTHORIZED", "Sign in")

        async def observe(ctx):
            self.seen.append((ctx.phase, dict(ctx.client_metadata)))
            yield

        def metadata(ctx, f):
            slug = ctx.client_metadata.get("slug")
            if not isinstance(slug, str):
                raise UploadError("BAD_REQUEST", "slug is required")
            return {"userId": ctx.request.header("x-user"), "recordId": f"record-for-{slug}"}

        def on_complete(ctx, done):
            self.completed.append((dict(ctx.metadata), done))

        shared = dict(
            schema=file_schema(max_size="50MB"),
            authorize=[authorize],
            around=[observe],
            metadata=metadata,
        )
        self.router = Router(storage.config())
        self.router.add("attachment", Route(**shared, on_complete=[on_complete]))
        self.router.add("other", Route(**shared))

    def call(self, route, action, body, user="alice"):
        response = asyncio.run(self.router.handle(Request(
            method="POST",
            path="/api/upload",
            query={"route": route, "action": action},
            headers={"x-user": user} if user else {},
            body=json.dumps(body).encode(),
        )))
        return response.status, json.loads(response.body)

    def presign(self, route="attachment"):
        status, body = self.call(route, "presign", {"files": [FILE], "metadata": {"slug": "abc"}})
        assert status == 200, body
        issued = body["results"][0]
        self.storage.put(issued["key"], FILE["size"], FILE["type"])
        return issued

    def complete(self, route, entry, user="alice"):
        return self.call(route, "complete", {"completions": [entry]}, user=user)


@pytest.fixture
def flow(storage):
    return Flow(storage)


def test_on_complete_sees_the_metadata_presign_decided_whatever_the_body_claims(flow):
    issued = flow.presign()

    status, body = flow.complete("attachment", {
        "key": issued["key"],
        "file": {**FILE, "size": 1},
        "metadata": {"userId": "victim", "recordId": "someone-elses-record"},
        "completionToken": issued["completionToken"],
    })

    assert status == 200, body
    [(metadata, done)] = flow.completed
    assert metadata == SEALED
    assert done.key == issued["key"] and done.upload_id


def test_every_request_sees_the_same_client_metadata_with_its_phase(flow):
    issued = flow.presign()

    status, body = flow.complete("attachment", {
        "key": issued["key"], "file": FILE, "metadata": {},
        "completionToken": issued["completionToken"],
    })

    assert status == 200, body
    assert flow.seen == [("presign", {"slug": "abc"}), ("complete", {"slug": "abc"})]


def test_completion_still_requires_an_authorised_caller(flow):
    issued = flow.presign()

    status, _ = flow.complete("attachment", {
        "key": issued["key"], "file": FILE, "completionToken": issued["completionToken"],
    }, user=None)

    assert status == 401
    assert flow.completed == []


def test_a_receipt_is_refused_on_another_route(flow):
    issued = flow.presign("other")

    status, _ = flow.complete("attachment", {
        "key": issued["key"], "file": FILE, "completionToken": issued["completionToken"],
    })

    assert status == 403


def test_a_receipt_is_refused_for_another_key(flow):
    issued = flow.presign()

    status, _ = flow.complete("attachment", {
        "key": "someone/else.jpg", "file": FILE, "completionToken": issued["completionToken"],
    })

    assert status == 403
    assert flow.completed == []


def test_a_v1_token_keeps_the_old_behaviour_until_removed(flow):
    # An upload presigned by the previous version, completed after the deploy:
    # the metadata channel runs again at completion.
    token = flow.router._sign_completion("photo.jpg", "attachment")
    flow.storage.put("photo.jpg", FILE["size"], FILE["type"])

    status, body = flow.complete("attachment", {
        "key": "photo.jpg", "file": FILE, "metadata": {"userId": "victim"},
        "completionToken": token,
    })

    assert status == 400, "the old behaviour: the channel reran over a request without slug"
    assert body["code"] == "BAD_REQUEST"


# ─── multipart ───────────────────────────────────────────────────────────────


def multipart_upload(flow, route="attachment", **extra):
    status, started = flow.call(route, "multipart-init", {"file": FILE, "metadata": {"slug": "abc"}})
    assert status == 200, started

    status, signed = flow.call(route, "multipart-sign", {
        "session": started["session"], "partNumbers": [1],
    })
    assert status == 200, signed

    request = urllib.request.Request(signed[0]["url"], data=b"x" * FILE["size"], method="PUT")
    with urllib.request.urlopen(request) as response:
        etag = response.headers["ETag"]

    return flow.call(route, "multipart-complete", {
        "session": started["session"],
        "parts": [{"partNumber": 1, "etag": etag}],
        "file": FILE,
        **extra,
    })


def test_multipart_fires_the_same_observers_with_sealed_metadata(flow):
    status, body = multipart_upload(flow, metadata={"userId": "victim"})

    assert status == 200, body
    [(metadata, done)] = flow.completed
    assert metadata == SEALED and done.upload_id


def test_multipart_runs_every_request_over_the_original_input(flow):
    status, body = multipart_upload(flow)

    assert status == 200, body
    assert flow.seen == [
        ("presign", {"slug": "abc"}),
        ("upload", {"slug": "abc"}),
        ("complete", {"slug": "abc"}),
    ]


def test_a_multipart_session_is_refused_on_another_route(flow):
    _, started = flow.call("other", "multipart-init", {"file": FILE, "metadata": {"slug": "abc"}})

    status, _ = flow.call("attachment", "multipart-sign", {
        "session": started["session"], "partNumbers": [1],
    })

    assert status == 403


def test_a_single_put_receipt_cannot_drive_multipart_or_the_reverse(flow):
    issued = flow.presign()
    status, _ = flow.call("attachment", "multipart-sign", {
        "session": issued["completionToken"], "partNumbers": [1],
    })
    assert status == 400

    _, started = flow.call("attachment", "multipart-init", {"file": FILE, "metadata": {"slug": "abc"}})
    status, _ = flow.complete("attachment", {
        "key": started["key"], "file": FILE, "completionToken": started["session"],
    })
    assert status == 403
