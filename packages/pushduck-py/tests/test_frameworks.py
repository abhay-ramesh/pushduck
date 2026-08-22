"""Mounts the router in every framework the docs claim support for.

The JavaScript package learnt this lesson expensively: its documentation
advertised components that did not exist, and five guides showed a call that
threw. Both survived a long time because nothing checked the docs against the
package.

So every mounting snippet in the README and the integration guides is executed
here, through the framework's own test client, with a real request driven
through it. A snippet nobody runs is a claim, not documentation.

Skips when a framework is not installed, so the core suite still runs with no
dependencies:

    .venv/bin/pip install flask fastapi django
"""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pushduck import Request, Route, Router, UploadConfig, UploadError, image  # noqa: E402


def installed(module: str) -> bool:
    return importlib.util.find_spec(module) is not None


PRESIGN_BODY = {"files": [{"name": "photo.jpg", "size": 1000, "type": "image/jpeg"}]}


def build_router() -> Router:
    router = Router(
        UploadConfig(
            bucket="test-bucket",
            region="us-east-1",
            access_key_id="test-key",
            secret_access_key="test-secret",
        )
    )

    def require_token(request: Request) -> None:
        if request.header("authorization") != "Bearer token":
            raise UploadError("UNAUTHORIZED", "Sign in to upload")

    router.add(
        "imageUpload",
        Route(
            schema=image(max_size="5MB"),
            authorize=[require_token],
            metadata=lambda ctx, f: {"userId": "u1"},
        ),
    )

    return router


class MountingAssertions(unittest.TestCase):
    """Shared expectations, so every framework is held to the same bar."""

    def assert_presigned(self, status: int, body: dict) -> None:
        self.assertEqual(status, 200, body)
        result = body["results"][0]
        self.assertTrue(result["success"], result)
        self.assertIn("X-Amz-Signature", result["presignedUrl"])
        # The handler ran and its output is authoritative.
        self.assertEqual(result["metadata"]["userId"], "u1")

    def assert_rejected(self, status: int, body: dict) -> None:
        # A rejection is a whole-request failure carrying the handler's own
        # status, not a per-file result — and it must survive the framework.
        self.assertEqual(status, 401, body)
        self.assertEqual(body["code"], "UNAUTHORIZED")


@unittest.skipUnless(installed("fastapi"), "fastapi not installed")
class FastAPI(MountingAssertions):
    def client(self):
        from fastapi import FastAPI as App
        from fastapi.testclient import TestClient

        app = App()
        # The documented mounting: one line, no adapter.
        app.mount("/api/upload", build_router().asgi())
        return TestClient(app)

    def test_presigns(self) -> None:
        response = self.client().post(
            "/api/upload?route=imageUpload",
            json=PRESIGN_BODY,
            headers={"authorization": "Bearer token"},
        )
        self.assert_presigned(response.status_code, response.json())

    def test_rejects_without_credentials(self) -> None:
        response = self.client().post("/api/upload?route=imageUpload", json=PRESIGN_BODY)
        self.assert_rejected(response.status_code, response.json())

    def test_serves_introspection(self) -> None:
        response = self.client().get("/api/upload")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["protocolVersion"], 1)

    def test_carries_the_protocol_header(self) -> None:
        response = self.client().get("/api/upload")
        self.assertEqual(response.headers["x-pushduck-protocol"], "1")


@unittest.skipUnless(installed("starlette"), "starlette not installed")
class Starlette(MountingAssertions):
    def client(self):
        from starlette.applications import Starlette as App
        from starlette.routing import Mount
        from starlette.testclient import TestClient

        app = App(routes=[Mount("/api/upload", build_router().asgi())])
        return TestClient(app)

    def test_presigns(self) -> None:
        response = self.client().post(
            "/api/upload?route=imageUpload",
            json=PRESIGN_BODY,
            headers={"authorization": "Bearer token"},
        )
        self.assert_presigned(response.status_code, response.json())

    def test_rejects_without_credentials(self) -> None:
        response = self.client().post("/api/upload?route=imageUpload", json=PRESIGN_BODY)
        self.assert_rejected(response.status_code, response.json())


@unittest.skipUnless(installed("flask"), "flask not installed")
class Flask(MountingAssertions):
    """Flask is WSGI, so it takes the other adapter.

    Two mountings are documented and both are exercised: a plain view, which is
    what most people will write, and `DispatcherMiddleware`, which keeps the
    upload endpoint out of Flask's routing entirely.
    """

    def test_presigns_through_a_view(self) -> None:
        from flask import Flask as App, request as flask_request

        app = App(__name__)
        router = build_router()

        @app.route("/api/upload", methods=["GET", "POST"])
        def upload():
            import asyncio

            response = asyncio.run(
                router.handle(
                    Request(
                        method=flask_request.method,
                        path=flask_request.full_path,
                        query=flask_request.args.to_dict(),
                        headers={k.lower(): v for k, v in flask_request.headers.items()},
                        body=flask_request.get_data(),
                    )
                )
            )
            return response.body, response.status, list(response.headers.items())

        client = app.test_client()
        result = client.post(
            "/api/upload?route=imageUpload",
            json=PRESIGN_BODY,
            headers={"authorization": "Bearer token"},
        )
        self.assert_presigned(result.status_code, json.loads(result.data))

    def test_presigns_through_dispatcher_middleware(self) -> None:
        from flask import Flask as App
        from werkzeug.middleware.dispatcher import DispatcherMiddleware
        from werkzeug.test import Client

        app = App(__name__)
        app.wsgi_app = DispatcherMiddleware(
            app.wsgi_app, {"/api/upload": build_router().wsgi()}
        )

        client = Client(app.wsgi_app)
        result = client.post(
            "/api/upload?route=imageUpload",
            json=PRESIGN_BODY,
            headers={"authorization": "Bearer token"},
        )
        self.assert_presigned(result.status_code, json.loads(result.data))

    def test_rejects_without_credentials(self) -> None:
        from flask import Flask as App
        from werkzeug.middleware.dispatcher import DispatcherMiddleware
        from werkzeug.test import Client

        app = App(__name__)
        app.wsgi_app = DispatcherMiddleware(
            app.wsgi_app, {"/api/upload": build_router().wsgi()}
        )

        result = Client(app.wsgi_app).post("/api/upload?route=imageUpload", json=PRESIGN_BODY)
        self.assert_rejected(result.status_code, json.loads(result.data))


@unittest.skipUnless(installed("django"), "django not installed")
class Django(MountingAssertions):
    """Django's URLconf wants a *view*, not an ASGI app.

    This is worth being explicit about: the obvious guess —
    `path("api/upload", router.asgi())` — does not work, because Django calls a
    view with `(request, *args)` rather than speaking ASGI to it. The adapter is
    four lines and belongs in the documentation rather than being left as an
    exercise.
    """

    @staticmethod
    def as_view(router: Router):
        import asyncio

        from django.http import HttpResponse

        def view(request):
            response = asyncio.run(
                router.handle(
                    Request(
                        method=request.method,
                        path=request.get_full_path(),
                        query=request.GET.dict(),
                        headers={k.lower(): v for k, v in request.headers.items()},
                        body=request.body,
                    )
                )
            )

            django_response = HttpResponse(
                response.body, status=response.status,
                content_type=response.headers.get("Content-Type", "application/json"),
            )
            for key, value in response.headers.items():
                if key.lower() != "content-type":
                    django_response[key] = value
            return django_response

        return view

    def setUp(self) -> None:
        import django
        from django.conf import settings

        if not settings.configured:
            settings.configure(
                DEBUG=True,
                ALLOWED_HOSTS=["*"],
                ROOT_URLCONF=__name__,
                SECRET_KEY="test",
                DATABASES={},
            )
            django.setup()

    def test_presigns_through_a_view(self) -> None:
        from django.test import RequestFactory

        view = self.as_view(build_router())
        request = RequestFactory().post(
            "/api/upload?route=imageUpload",
            data=json.dumps(PRESIGN_BODY),
            content_type="application/json",
            headers={"authorization": "Bearer token"},
        )

        response = view(request)
        self.assert_presigned(response.status_code, json.loads(response.content))

    def test_rejects_without_credentials(self) -> None:
        from django.test import RequestFactory

        view = self.as_view(build_router())
        request = RequestFactory().post(
            "/api/upload?route=imageUpload",
            data=json.dumps(PRESIGN_BODY),
            content_type="application/json",
        )

        response = view(request)
        self.assert_rejected(response.status_code, json.loads(response.content))


if __name__ == "__main__":
    unittest.main()
