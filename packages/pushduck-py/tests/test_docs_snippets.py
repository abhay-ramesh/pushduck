"""Every Python snippet on the docs page, executed.

`docs/content/docs/integrations/python.mdx` states that its snippets are
tested. This is the test, and it asserts the *outputs* the page prints — the
sanitised key and the `describe()` listing — not merely that the code runs.

Three times in this project a documented API turned out not to exist. The page
is only trustworthy if something executes it.
"""
import os, asyncio


def test_every_documented_snippet_runs() -> None:
    _body()


def _body() -> None:
    from dataclasses import replace
    from pushduck import Router, Route, UploadConfig, image, file, UploadError

    os.environ.setdefault("AWS_S3_BUCKET","b"); os.environ.setdefault("AWS_REGION","us-east-1")
    os.environ.setdefault("AWS_ACCESS_KEY_ID","k"); os.environ.setdefault("AWS_SECRET_ACCESS_KEY","s")

    class User: id="u1"; tenant="acme"
    def require_session(request): pass
    def load_user(request): return User()
    def record_upload(ctx, done): pass
    def current_tenant(): return "t1"
    def tenant_key(ctx, f): return f"{ctx.user.tenant}/{f.name}"

    config = UploadConfig(
        bucket=os.environ["AWS_S3_BUCKET"], region=os.environ["AWS_REGION"],
        access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        session_token=os.environ.get("AWS_SESSION_TOKEN"),
    )
    router = Router(config)

    # --- snippet 1: defining routes
    router.add("imageUpload", Route(
        schema=image(max_size="5MB"),
        authorize=[require_session],
        principal=load_user,
        key=lambda ctx, f: f"{ctx.user.tenant}/{f.name}",
        metadata=lambda ctx, f: {"user_id": ctx.user.id},
        on_complete=[record_upload],
    ))
    router.add("documentUpload", Route(
        schema=file(max_size="50MB", allow_types=["application/pdf"]),
        metadata=lambda ctx, f: {"tenant": current_tenant()},
    ))
    assert "imageUpload" in router.routes and "documentUpload" in router.routes

    # --- snippet 2: forwarding client metadata explicitly
    r2 = Router(config)
    r2.add("public", Route(metadata=lambda ctx, f: dict(ctx.client_metadata)))
    assert "public" in r2.routes

    # --- snippet 3: the key claims, verified by running them
    import json
    from pushduck.router import Request
    def presign(rt, name):
        rr = Router(config); rr.add("x", rt)
        resp = asyncio.run(rr.handle(Request("POST","/u",{"route":"x"},{},
            json.dumps({"files":[{"name":name,"size":10,"type":"image/png"}]}).encode())))
        return resp.status, json.loads(resp.body)

    st, body = presign(Route(schema=image(), principal=load_user, key=tenant_key), "写真 photo.png")
    assert st == 200, body
    got = body["results"][0]["key"]
    assert got == "acme/写真_photo.png", f"docs claim acme/写真_photo.png, got {got!r}"


    st, body = presign(Route(schema=image(), key=lambda ctx,f: "../../etc/passwd"), "a.png")
    assert st == 500 and body["code"] == "CONFIG_INVALID", body


    # --- snippet 4: replace()
    tenant = Route(authorize=[require_session], principal=load_user, key=tenant_key)
    r3 = Router(config)
    r3.add("avatar",   replace(tenant, schema=image(max_size="5MB")))
    r3.add("document", replace(tenant, schema=file(max_size="50MB")))
    assert r3.routes["avatar"].schema is not None

    # --- snippet 5: router defaults
    r4 = Router(config, defaults=Route(authorize=[require_session]))
    assert r4.defaults is not None

    # --- snippet 6: describe(), and the exact output the docs print
    r5 = Router(config)
    r5.add("avatar", Route(schema=image(), authorize=[require_session], principal=load_user,
                           key=tenant_key, metadata=lambda c,f: {}, on_complete=[record_upload]))
    r5.add("public", Route(schema=file()))
    described = r5.describe()

    assert "authorize(1) principal key metadata on_complete(1)" in described, described
    assert "schema only" in described, described

