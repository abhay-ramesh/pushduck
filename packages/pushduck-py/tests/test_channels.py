"""The lifecycle channels, and the properties they exist to guarantee.

Every test here corresponds to a failure that has a CVE, an open issue, or a
verified bug in this repository's own history. The design is only worth its
churn if these hold, so they are asserted rather than described.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import replace

import pytest

from pushduck import (
    Completion,
    Context,
    FileMeta,
    Route,
    Router,
    UploadConfig,
    UploadError,
    image,
    file as file_schema,
)
from pushduck.router import Request


CONFIG = UploadConfig(
    bucket="test-bucket",
    region="us-east-1",
    access_key_id="test-key",
    secret_access_key="test-secret",
)


def presign_request(files, metadata=None, headers=None):
    body = {"files": files}
    if metadata is not None:
        body["metadata"] = metadata
    return Request(
        method="POST",
        path="/api/upload",
        query={"route": "avatar", "action": "presign"},
        headers=headers or {},
        body=json.dumps(body).encode(),
    )


def run(router, request):
    return asyncio.run(router.handle(request))


def body_of(response):
    return json.loads(response.body)


# ─── the channel names are resolved by Python, not by a string lookup ────────


def test_a_misspelled_channel_is_a_typeerror():
    """The whole reason for the dataclass.

    Under every rejected alternative — a subclass, a dict of hooks, a
    `hasattr` probe — `authorise` is a route with no authentication and no
    diagnostic. DRF ships this failure today: `permission_class` (singular)
    silently leaves an endpoint public.
    """
    with pytest.raises(TypeError, match="authorise"):
        Route(authorise=[lambda request: None])


def test_a_bare_schema_is_rejected_with_a_usable_message():
    router = Router(CONFIG)
    with pytest.raises(TypeError, match="Route"):
        router.add("avatar", image(max_size="5MB"))


# ─── authorize: once per request, and it vetoes the request ──────────────────


def test_authorize_runs_once_per_request_not_once_per_file():
    """A 50-file batch must not perform 50 session lookups.

    The previous design ran the handler inside the file loop, which made the
    endpoint an amplification primitive: one HTTP request, N authentication
    backend calls, with no batch-size limit anywhere.
    """
    calls = []

    router = Router(CONFIG)
    router.add(
        "avatar",
        Route(schema=image(max_size="5MB"), authorize=[lambda request: calls.append(1)]),
    )

    files = [{"name": f"{n}.png", "size": 10, "type": "image/png"} for n in range(5)]
    response = run(router, presign_request(files))

    assert response.status == 200
    assert len(body_of(response)["results"]) == 5
    assert len(calls) == 1, f"authorize ran {len(calls)} times for 5 files"


def test_authorize_failure_fails_the_whole_request():
    def require_session(request):
        raise UploadError("UNAUTHORIZED", "Sign in to upload")

    router = Router(CONFIG)
    router.add("avatar", Route(schema=image(), authorize=[require_session]))

    response = run(router, presign_request([{"name": "a.png", "size": 10, "type": "image/png"}]))

    assert response.status == 401
    assert "results" not in response.body.decode()


def test_authorize_return_value_is_ignored():
    """`authorize` cannot smuggle metadata.

    This is the channel split that closes the original bug: there is no longer
    any way to say "authenticate" that also means "and here is the metadata",
    so `return None` cannot be misread as consent to the client's claims.
    """
    router = Router(CONFIG)
    router.add(
        "avatar",
        Route(schema=image(), authorize=[lambda request: {"role": "admin"}]),
    )

    response = run(router, presign_request([{"name": "a.png", "size": 10, "type": "image/png"}]))

    assert body_of(response)["results"][0]["metadata"] == {}


# ─── user produces ctx.user ─────────────────────────────────────────────


def test_user_channel_becomes_ctx_user():
    class User:
        id = "u_42"
        tenant = "acme"

    router = Router(CONFIG)
    router.add(
        "avatar",
        Route(
            schema=image(),
            user=lambda request: User(),
            storage_path=lambda ctx, f: f"{ctx.user.tenant}/{f.name}",
            metadata=lambda ctx, f: {"owner_id": ctx.user.id},
        ),
    )

    result = body_of(run(router, presign_request(
        [{"name": "me.png", "size": 10, "type": "image/png"}]
    )))["results"][0]

    assert result["key"] == "acme/me.png"
    assert result["metadata"] == {"owner_id": "u_42"}


# ─── metadata: the client's is never authoritative ───────────────────────────


def test_client_metadata_is_not_promoted_when_no_metadata_channel():
    """A route that authenticates but publishes nothing gets `{}`, not the
    caller's claims. CVE-2026-33173 in Active Storage is this bug."""
    router = Router(CONFIG)
    router.add("avatar", Route(schema=image(), authorize=[lambda r: None]))

    result = body_of(run(router, presign_request(
        [{"name": "a.png", "size": 10, "type": "image/png"}],
        metadata={"role": "admin", "user_id": "victim"},
    )))["results"][0]

    assert result["metadata"] == {}


def test_client_metadata_is_reachable_but_separately_named():
    seen = {}

    def metadata(ctx, f):
        seen["client"] = dict(ctx.client_metadata)
        seen["server"] = dict(ctx.metadata)
        return {"trusted": True}

    router = Router(CONFIG)
    router.add("avatar", Route(schema=image(), metadata=metadata))

    result = body_of(run(router, presign_request(
        [{"name": "a.png", "size": 10, "type": "image/png"}],
        metadata={"role": "admin"},
    )))["results"][0]

    assert seen["client"] == {"role": "admin"}
    assert seen["server"] == {}, "ctx.metadata must start empty"
    assert result["metadata"] == {"trusted": True}


# ─── key: the library owns the result ────────────────────────────────────────


@pytest.mark.parametrize(
    "fragment",
    [
        "../../etc/passwd",
        "/absolute/key.png",
        "a/../../../b.png",
        "tenant//double.png",
        "with?query.png",
        "with#fragment.png",
    ],
)
def test_key_channel_cannot_escape(fragment):
    """Django moved this validation into `Storage.save()` after CVE-2024-39330
    precisely so that no override could bypass it."""
    router = Router(CONFIG)
    router.add("avatar", Route(schema=image(), storage_path=lambda ctx, f: fragment))

    response = run(router, presign_request([{"name": "a.png", "size": 10, "type": "image/png"}]))

    assert response.status == 500, f"{fragment!r} was accepted"
    document = body_of(response)
    assert document["code"] == "CONFIG_INVALID"
    # The message names the channel and says what to return instead: this is a
    # bug in the application, and the person reading it is the one who can fix
    # it.
    assert "`key` channel" in document["detail"]


def test_key_channel_output_is_re_sanitised():
    """Without this, the non-Latin filename handling protects only the default
    key and is bypassed by every application that supplies its own."""
    router = Router(CONFIG)
    router.add("avatar", Route(schema=image(), storage_path=lambda ctx, f: f"tenant/{f.name}"))

    result = body_of(run(router, presign_request(
        [{"name": "写真 photo.png", "size": 10, "type": "image/png"}]
    )))["results"][0]

    assert result["key"].startswith("tenant/")
    assert "写真" in result["key"], "non-Latin characters must survive"
    assert " " not in result["key"], "spaces must be sanitised"


# ─── validate: per-file, while the batch continues ───────────────────────────


def test_validate_fails_one_file_not_the_request():
    def reject_svg(ctx, f):
        if f.type == "image/svg+xml":
            raise UploadError("VALIDATION_FAILED", "SVG avatars are not allowed")

    router = Router(CONFIG)
    router.add("avatar", Route(schema=file_schema(max_size="5MB"), validate=[reject_svg]))

    response = run(router, presign_request([
        {"name": "ok.png", "size": 10, "type": "image/png"},
        {"name": "bad.svg", "size": 10, "type": "image/svg+xml"},
        {"name": "also-ok.png", "size": 10, "type": "image/png"},
    ]))

    assert response.status == 200
    results = body_of(response)["results"]
    assert [r["success"] for r in results] == [True, False, True]
    assert results[1]["error"] == "SVG avatars are not allowed"


def test_schema_violation_is_also_per_file():
    router = Router(CONFIG)
    router.add("avatar", Route(schema=image(max_size="1KB")))

    results = body_of(run(router, presign_request([
        {"name": "small.png", "size": 10, "type": "image/png"},
        {"name": "huge.png", "size": 999_999, "type": "image/png"},
    ])))["results"]

    assert [r["success"] for r in results] == [True, False]
    assert "exceeds maximum" in results[1]["error"]


# ─── around: the only channel that wraps ─────────────────────────────────────


def test_around_brackets_the_request():
    order = []

    async def outer(ctx):
        order.append("outer:enter")
        yield
        order.append("outer:exit")

    async def inner(ctx):
        order.append("inner:enter")
        yield
        order.append("inner:exit")

    router = Router(CONFIG)
    router.add(
        "avatar",
        Route(
            schema=image(),
            around=[outer, inner],
            storage_path=lambda ctx, f: order.append("body") or f.name,
        ),
    )

    run(router, presign_request([{"name": "a.png", "size": 10, "type": "image/png"}]))

    assert order == ["outer:enter", "inner:enter", "body", "inner:exit", "outer:exit"]


def test_around_exits_on_failure():
    """The property Django rewrote its middleware layer to guarantee: an
    entered wrapper is always exited, so a transaction cannot leak."""
    events = []

    async def transaction(ctx):
        events.append("begin")
        try:
            yield
        except Exception:
            events.append("rollback")
            raise
        else:
            events.append("commit")

    def explode(ctx, f):
        raise RuntimeError("handler blew up")

    router = Router(CONFIG)
    router.add("avatar", Route(schema=image(), around=[transaction], storage_path=explode))

    response = run(router, presign_request([{"name": "a.png", "size": 10, "type": "image/png"}]))

    assert response.status == 500
    assert events == ["begin", "rollback"]


def test_around_rejects_a_plain_function_at_registration():
    with pytest.raises(TypeError, match="async generators"):
        Route(around=[lambda ctx: None])


# ─── on_complete ─────────────────────────────────────────────────────────────


def test_on_complete_receives_server_metadata():
    seen = []

    router = Router(CONFIG)
    router.add(
        "avatar",
        Route(
            schema=image(),
            metadata=lambda ctx, f: {"owner": "u_42"},
            on_complete=[lambda ctx, done: seen.append((done.key, dict(ctx.metadata)))],
        ),
    )

    request = Request(
        method="POST",
        path="/api/upload",
        query={"route": "avatar", "action": "complete"},
        headers={},
        body=json.dumps({
            "completions": [{
                "key": "avatars/me.png",
                "file": {"name": "me.png", "size": 10, "type": "image/png"},
                "metadata": {"owner": "attacker"},
            }]
        }).encode(),
    )

    response = run(router, request)

    assert response.status == 200
    assert seen == [("avatars/me.png", {"owner": "u_42"})], "client metadata must not win"


# ─── composition and introspection ───────────────────────────────────────────


def test_replace_derives_a_route():
    """Composition needs no API because a route is a value."""
    tenant = Route(authorize=[lambda r: None], storage_path=lambda ctx, f: f"t/{f.name}")
    avatar = replace(tenant, schema=image(max_size="5MB"))

    assert avatar.authorize == tenant.authorize
    assert avatar.schema is not None
    assert tenant.schema is None


def test_router_defaults_prepend_rather_than_replace():
    """DRF's `permission_classes` replaces the global default, so adding one
    route-specific rule silently drops the global one. This must not."""
    calls = []

    router = Router(CONFIG, defaults=Route(authorize=[lambda r: calls.append("global")]))
    router.add("avatar", Route(schema=image(), authorize=[lambda r: calls.append("route")]))

    run(router, presign_request([{"name": "a.png", "size": 10, "type": "image/png"}]))

    assert calls == ["global", "route"]


def test_describe_lists_channels():
    router = Router(CONFIG)
    router.add("avatar", Route(schema=image(), authorize=[lambda r: None], storage_path=lambda c, f: "k"))
    router.add("public", Route(schema=file_schema()))

    described = router.describe()

    assert "authorize(1)" in described
    assert "storage_path" in described
    assert "schema only" in described


# ─── the unauthenticated crash ───────────────────────────────────────────────


def test_a_non_latin1_action_is_a_problem_document_not_a_crash():
    """`?action=☃` reached an ASGI header encode outside every handler."""
    router = Router(CONFIG)
    router.add("avatar", Route(schema=image()))

    response = run(router, Request(
        method="GET", path="/api/upload",
        query={"route": "avatar", "action": "☃"}, headers={}, body=b"",
    ))

    assert response.status == 400
    for value in response.headers.values():
        value.encode("latin-1")  # must not raise


def test_an_unknown_route_name_is_not_reflected_into_a_header():
    router = Router(CONFIG)
    router.add("avatar", Route(schema=image()))

    response = run(router, Request(
        method="POST", path="/api/upload",
        query={"route": "☃", "action": "presign"}, headers={}, body=b"{}",
    ))

    assert response.status == 404
    for value in response.headers.values():
        value.encode("latin-1")


# ─── sync and async are both first-class ─────────────────────────────────────


def test_sync_and_async_channels_interoperate():
    """Flask users write `def`; FastAPI users write `async def`. Both, in one
    route, resolved once at registration."""
    async def resolve_user_async(request):
        return {"id": "u_1"}

    def sync_metadata(ctx, f):
        return {"owner": ctx.user["id"]}

    router = Router(CONFIG)
    router.add("avatar", Route(
        schema=image(), user=resolve_user_async, metadata=sync_metadata
    ))

    result = body_of(run(router, presign_request(
        [{"name": "a.png", "size": 10, "type": "image/png"}]
    )))["results"][0]

    assert result["metadata"] == {"owner": "u_1"}
