"""Single-object storage operations against a real S3-compatible server.

Requires MinIO (``pnpm minio``). Skips honestly when there is not one.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import unittest
import urllib.error
import urllib.request
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pushduck import Request, Route, Router, UploadConfig, UploadError, file  # noqa: E402
from pushduck.storage import delete_object, head_object  # noqa: E402

MINIO = os.environ.get("MINIO_ENDPOINT", "http://127.0.0.1:9010")


def minio_available() -> bool:
    try:
        with urllib.request.urlopen(f"{MINIO}/minio/health/live", timeout=2) as response:
            return response.status == 200
    except OSError:
        return False


def put(url: str, headers: dict, body: bytes) -> int:
    """Send a body to a presigned URL the way a browser would."""
    request = urllib.request.Request(url, data=body, method="PUT", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


@unittest.skipUnless(minio_available(), f"MinIO unreachable at {MINIO}")
class SingleObjects(unittest.TestCase):
    def setUp(self) -> None:
        self.config = UploadConfig(
            bucket="test-uploads",
            region="us-east-1",
            access_key_id="minioadmin",
            secret_access_key="minioadmin",
            endpoint=MINIO,
            force_path_style=True,
        )
        self.router = Router(self.config)
        self.router.add("docUpload", Route(schema=file(max_size="1MB")))

    def presign(self, size: int) -> dict:
        name = f"py-object-{time.time_ns()}.txt"
        response = asyncio.run(self.router.handle(Request(
            method="POST",
            path="/api/upload",
            query={"route": "docUpload", "action": "presign"},
            headers={},
            body=json.dumps({"files": [{"name": name, "size": size, "type": "text/plain"}]}).encode(),
        )))
        self.assertEqual(response.status, 200, response.body)
        return json.loads(response.body)["results"][0]

    def test_head_reports_what_was_stored_and_delete_removes_it(self) -> None:
        issued = self.presign(5)
        key = issued["key"]

        self.assertIsNone(head_object(self.config, key))

        self.assertEqual(put(issued["presignedUrl"], issued["requiredHeaders"], b"hello"), 200)

        info = head_object(self.config, key)
        assert info is not None
        self.assertEqual((info.size, info.content_type), (5, "text/plain"))
        self.assertTrue(info.etag and '"' not in info.etag, info.etag)
        self.assertIsNotNone(info.last_modified)

        delete_object(self.config, key)
        self.assertIsNone(head_object(self.config, key))
        # Already gone is the desired end state.
        delete_object(self.config, key)

    def test_a_presigned_put_refuses_any_length_but_the_declared_one(self) -> None:
        # max_size is checked against the declared size; signing that size is
        # what makes it hold for the bytes that arrive.
        issued = self.presign(5)
        url, headers = issued["presignedUrl"], issued["requiredHeaders"]

        self.assertIn("content-length", url)
        self.assertNotIn("content-length", {name.lower() for name in headers})

        self.assertEqual(put(url, headers, b"hello, and then some"), 403)
        self.assertEqual(put(url, headers, b"hi"), 403)
        self.assertEqual(put(url, headers, b"hello"), 200)

    def test_a_refused_credential_is_not_a_missing_object(self) -> None:
        # Read as "missing", completion would refuse every upload as never
        # having arrived, with the real cause invisible.
        refused = replace(self.config, secret_access_key="not-the-secret")

        with self.assertRaises(UploadError) as raised:
            head_object(refused, "anything.txt")
        self.assertEqual(raised.exception.code, "STORAGE_ACCESS_DENIED")
