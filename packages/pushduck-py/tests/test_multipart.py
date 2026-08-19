"""Multipart: session tokens, part planning, and the storage round trip.

Split deliberately. The session and planning cases need no storage at all, so
they run everywhere — including in CI without a bucket, and on a machine whose
MinIO container has died. Only the round trip needs a real S3-compatible
server, and it skips honestly when there is not one.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pushduck import Request, Router, UploadConfig, UploadError, file  # noqa: E402
from pushduck.config import MAX_PARTS, MIN_PART_SIZE, choose_part_size  # noqa: E402
from pushduck.multipart import sign_session, verify_session  # noqa: E402

MINIO = os.environ.get("MINIO_ENDPOINT", "http://127.0.0.1:9010")


def minio_available() -> bool:
    try:
        with urllib.request.urlopen(f"{MINIO}/minio/health/live", timeout=2) as response:
            return response.status == 200
    except OSError:
        return False


def call(router: Router, action: str, body: dict, route: str = "bigUpload") -> tuple:
    """Drive one action and return ``(status, decoded body)``."""
    path = f"/api/upload?route={route}&action={action}"
    response = asyncio.run(
        router.handle(
            Request(
                method="POST",
                path=path,
                query={"route": route, "action": action},
                headers={"content-type": "application/json"},
                body=json.dumps(body).encode("utf-8"),
            )
        )
    )
    return response.status, json.loads(response.body)


class SessionTokens(unittest.TestCase):
    """A session is the only thing tying a caller to an object.

    If a forged one were accepted, anyone who guessed or observed a key and
    upload id could sign parts for — or abort — another user's upload.
    """

    secret = "conformance-secret"

    def test_round_trips(self) -> None:
        token = sign_session(
            self.secret,
            {
                "key": "a.bin",
                "uploadId": "u1",
                "route": "bigUpload",
                "partSize": MIN_PART_SIZE,
                "totalSize": 12 * MIN_PART_SIZE,
            },
        )
        session = verify_session(self.secret, token)
        self.assertEqual(session["key"], "a.bin")
        self.assertEqual(session["uploadId"], "u1")

    def test_rejects_a_forged_signature(self) -> None:
        token = sign_session(
            self.secret,
            {"key": "a.bin", "uploadId": "u1", "route": "r", "partSize": MIN_PART_SIZE,
             "totalSize": 1},
        )
        payload = token.split(".")[0]
        with self.assertRaises(UploadError):
            verify_session(self.secret, f"{payload}.wrong")

    def test_rejects_a_tampered_payload(self) -> None:
        # The attack the signature exists to stop: keep the signature, swap the
        # claim for one naming someone else's object.
        token = sign_session(
            self.secret,
            {"key": "a.bin", "uploadId": "u1", "route": "r", "partSize": MIN_PART_SIZE,
             "totalSize": 1},
        )
        signature = token.split(".")[1]
        with self.assertRaises(UploadError):
            verify_session(self.secret, f"bm90LWEtc2Vzc2lvbg.{signature}")

    def test_rejects_a_valid_signature_over_a_malformed_claim(self) -> None:
        # A signature proves the payload was not altered, not that it means
        # anything.
        token = sign_session(self.secret, {"key": "", "uploadId": "", "partSize": 0})
        with self.assertRaises(UploadError):
            verify_session(self.secret, token)

    def test_rejects_a_token_from_another_secret(self) -> None:
        token = sign_session(
            "someone-elses-secret",
            {"key": "a.bin", "uploadId": "u1", "route": "r", "partSize": MIN_PART_SIZE,
             "totalSize": 1},
        )
        with self.assertRaises(UploadError):
            verify_session(self.secret, token)


class SessionAuthorisation(unittest.TestCase):
    def router(self) -> Router:
        return Router(
            UploadConfig(
                bucket="b",
                region="us-east-1",
                access_key_id="k",
                secret_access_key="conformance-secret",
            )
        )

    def test_signing_rejects_a_forged_session(self) -> None:
        router = self.router()
        router.add_route("bigUpload", file(max_size="500MB"))

        status, body = call(
            router, "multipart-sign",
            {"session": "bm90LWEtc2Vzc2lvbg.ZmFrZQ", "partNumbers": [1]},
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["code"], "FORBIDDEN")

    def test_signing_rejects_a_session_from_another_route(self) -> None:
        # Otherwise a session minted on a permissive route signs parts on a
        # strict one.
        router = self.router()
        router.add_route("bigUpload", file(max_size="500MB"))
        router.add_route("otherUpload", file(max_size="500MB"))

        token = sign_session(
            "conformance-secret",
            {"key": "a.bin", "uploadId": "u1", "route": "otherUpload",
             "partSize": MIN_PART_SIZE, "totalSize": 12 * MIN_PART_SIZE},
        )

        status, _ = call(router, "multipart-sign", {"session": token, "partNumbers": [1]})
        self.assertEqual(status, 403)

    def test_rejects_a_part_number_outside_the_plan(self) -> None:
        # Signing one would authorise a write past the end of the object the
        # session was created for.
        router = self.router()
        router.add_route("bigUpload", file(max_size="500MB"))

        token = sign_session(
            "conformance-secret",
            {"key": "a.bin", "uploadId": "u1", "route": "bigUpload",
             "partSize": MIN_PART_SIZE, "totalSize": 12 * 1024 * 1024},
        )

        status, _ = call(router, "multipart-sign", {"session": token, "partNumbers": [99]})
        self.assertEqual(status, 400)

    def test_signs_a_part_within_the_plan(self) -> None:
        router = self.router()
        router.add_route("bigUpload", file(max_size="500MB"))

        total = 12 * 1024 * 1024
        token = sign_session(
            "conformance-secret",
            {"key": "a.bin", "uploadId": "u1", "route": "bigUpload",
             "partSize": MIN_PART_SIZE, "totalSize": total},
        )

        status, body = call(router, "multipart-sign", {"session": token, "partNumbers": [1, 3]})
        self.assertEqual(status, 200)
        self.assertEqual([part["partNumber"] for part in body], [1, 3])
        self.assertIn("X-Amz-Signature", body[0]["url"])
        self.assertIn("partNumber=1", body[0]["url"])
        self.assertIn("uploadId=u1", body[0]["url"])
        # The final part is short, and its declared size must say so or the
        # client writes past the end of its own file.
        self.assertEqual(body[1]["size"], total - 2 * MIN_PART_SIZE)

    def test_the_route_handler_runs_on_every_multipart_call(self) -> None:
        # The token proves which object is acted on; the handler proves the
        # caller is still allowed to act. Checking only the token would let a
        # revoked user finish an upload they started.
        router = Router(
            UploadConfig(bucket="b", access_key_id="k", secret_access_key="conformance-secret")
        )

        @router.route("bigUpload", file(max_size="500MB"))
        def guard(request: Request) -> dict:
            if request.header("authorization") != "Bearer ok":
                raise UploadError("UNAUTHORIZED", "Sign in to upload")
            return {}

        token = sign_session(
            "conformance-secret",
            {"key": "a.bin", "uploadId": "u1", "route": "bigUpload",
             "partSize": MIN_PART_SIZE, "totalSize": 12 * 1024 * 1024},
        )

        status, _ = call(router, "multipart-sign", {"session": token, "partNumbers": [1]})
        self.assertEqual(status, 401, "a valid session must not bypass the route handler")


class PartPlanning(unittest.TestCase):
    def test_raises_a_sub_minimum_request_to_the_floor(self) -> None:
        self.assertEqual(choose_part_size(10 * 1024 * 1024, 1024), MIN_PART_SIZE)

    def test_grows_the_part_size_past_the_ten_thousand_part_cap(self) -> None:
        # At the 5 MiB floor the cap is reached at roughly 48.8 GiB.
        huge = 100 * 1024 * 1024 * 1024
        size = choose_part_size(huge, MIN_PART_SIZE)
        self.assertLessEqual(huge // size, MAX_PARTS)


@unittest.skipUnless(minio_available(), f"MinIO unreachable at {MINIO}")
class MinioRoundTrip(unittest.TestCase):
    """The parts that only a real server can check.

    Part signing is self-consistently wrong if `partNumber` and `uploadId` are
    not in the canonical request, and assembly failures still return 200 with a
    corrupt object. Neither is observable against a stub.
    """

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
        self.router.add_route("bigUpload", file(max_size="500MB"))

    @staticmethod
    def patterned(size: int) -> bytes:
        # Every byte encodes its own offset, so a misplaced part reports *where*
        # rather than only that the contents differ.
        return bytes(i % 251 for i in range(size))

    def _upload_parts(self, session: str, payload: bytes, part_size: int, numbers: list) -> list:
        """Sign and transfer the given part numbers, returning their ETags."""
        status, signed = call(
            self.router, "multipart-sign", {"session": session, "partNumbers": numbers}
        )
        self.assertEqual(status, 200, signed)

        parts = []
        for part in signed:
            start = (part["partNumber"] - 1) * part_size
            chunk = payload[start : start + part_size]
            request = urllib.request.Request(part["url"], data=chunk, method="PUT")
            with urllib.request.urlopen(request, timeout=30) as response:
                self.assertEqual(response.status, 200)
                etag = response.headers.get("ETag")
            self.assertTrue(etag, f"part {part['partNumber']} returned no ETag")
            parts.append({"partNumber": part["partNumber"], "etag": etag})

        return parts

    def _read_back(self, key: str) -> bytes:
        from pushduck.sign import presign

        scheme, host, path = self.config.object_address(key)
        url = presign(
            access_key_id=self.config.access_key_id,
            secret_access_key=self.config.secret_access_key,
            session_token=None, method="GET", scheme=scheme, host=host, path=path,
            region=self.config.region, expires_in=120, now=self.config.now(),
        )
        with urllib.request.urlopen(url, timeout=30) as response:
            return response.read()

    def test_resumes_after_an_interruption(self) -> None:
        """The end-to-end resume claim.

        Interrupt an upload, ask the provider what actually landed, send only
        the rest, and get the object that was intended.

        It also exercises something only a real provider can check: the ETags
        returned by `ListParts` must be acceptable to
        `CompleteMultipartUpload`. They come from two different S3 operations,
        and if their quoting differs, completion fails with `InvalidPart` after
        every byte has already been transferred.
        """
        # 22 MiB at 5 MiB parts → five parts, with a short final one.
        payload = self.patterned(22 * 1024 * 1024)
        name = f"py-resume-{datetime.now(timezone.utc).timestamp()}.bin"

        status, initiated = call(
            self.router, "multipart-init",
            {"file": {"name": name, "size": len(payload), "type": "application/octet-stream"},
             "partSize": MIN_PART_SIZE},
        )
        self.assertEqual(status, 200, initiated)

        session, key = initiated["session"], initiated["key"]
        part_size = initiated["partSize"]
        count = -(-len(payload) // part_size)

        # First attempt: parts 1 and 2 land, then the network "drops".
        self._upload_parts(session, payload, part_size, [1, 2])

        # Resume: the provider is the authority on what survived. A client's own
        # record is a hint that can be wrong in either direction.
        status, listed = call(self.router, "multipart-parts", {"session": session})
        self.assertEqual(status, 200, listed)
        recovered = listed["parts"]
        self.assertEqual(len(recovered), 2, f"provider reports {len(recovered)} parts, expected 2")

        # Send only what is missing.
        fresh = self._upload_parts(session, payload, part_size, list(range(3, count + 1)))

        # Completion mixes ETags from two sources: the listing for the parts
        # that survived, and the upload responses for the rest.
        status, completed = call(
            self.router, "multipart-complete",
            {"session": session, "parts": recovered + fresh,
             "file": {"name": name, "size": len(payload), "type": "application/octet-stream"}},
        )
        self.assertEqual(status, 200, completed)

        stored = self._read_back(key)
        self.assertEqual(len(stored), len(payload))
        self.assertEqual(stored, payload, "the resumed object differs from what was uploaded")

    def test_follows_pagination_when_a_listing_is_truncated(self) -> None:
        """A truncated listing is indistinguishable from a complete one.

        Providers page `ListParts` at 1000 by default, which no realistic test
        reaches — 1000 parts is a 5 GiB upload — so this path had never
        executed in any implementation. Forcing a page size of 1 exercises it
        against a real server for the cost of two parts.

        Stopping at the first page makes a resuming client re-upload parts the
        provider already holds: wasted bandwidth on a metered connection, and
        silently so.
        """
        from pushduck.multipart import list_uploaded_parts

        payload = self.patterned(12 * 1024 * 1024)
        name = f"py-paged-{datetime.now(timezone.utc).timestamp()}.bin"

        status, initiated = call(
            self.router, "multipart-init",
            {"file": {"name": name, "size": len(payload), "type": "application/octet-stream"},
             "partSize": MIN_PART_SIZE},
        )
        self.assertEqual(status, 200, initiated)
        session, key = initiated["session"], initiated["key"]

        self._upload_parts(session, payload, initiated["partSize"], [1, 2, 3])

        session_claim = verify_session(self.config.secret_access_key, session)
        upload_id = str(session_claim["uploadId"])

        # One part per page: the provider truncates, and only a loop that
        # follows NextPartNumberMarker sees all three.
        paged = list_uploaded_parts(self.config, key, upload_id, page_size=1)
        self.assertEqual(
            [part["partNumber"] for part in paged], [1, 2, 3],
            "pagination was not followed — a truncated listing was treated as complete",
        )

        call(self.router, "multipart-abort", {"session": session})

    def test_uploads_and_reads_back_byte_identical(self) -> None:
        payload = self.patterned(12 * 1024 * 1024)
        name = f"py-multi-{datetime.now(timezone.utc).timestamp()}.bin"

        status, initiated = call(
            self.router, "multipart-init",
            {"file": {"name": name, "size": len(payload), "type": "application/octet-stream"},
             "partSize": MIN_PART_SIZE},
        )
        self.assertEqual(status, 200, initiated)

        session, key = initiated["session"], initiated["key"]
        part_size = initiated["partSize"]
        count = -(-len(payload) // part_size)

        status, signed = call(
            self.router, "multipart-sign",
            {"session": session, "partNumbers": list(range(1, count + 1))},
        )
        self.assertEqual(status, 200, signed)

        parts = []
        for part in signed:
            start = (part["partNumber"] - 1) * part_size
            chunk = payload[start : start + part_size]
            request = urllib.request.Request(part["url"], data=chunk, method="PUT")
            with urllib.request.urlopen(request, timeout=30) as response:
                self.assertEqual(response.status, 200)
                etag = response.headers.get("ETag")
            self.assertTrue(etag, f"part {part['partNumber']} returned no ETag")
            parts.append({"partNumber": part["partNumber"], "etag": etag})

        status, completed = call(
            self.router, "multipart-complete",
            {"session": session, "parts": parts,
             "file": {"name": name, "size": len(payload), "type": "application/octet-stream"}},
        )
        self.assertEqual(status, 200, completed)

        from pushduck.sign import presign

        scheme, host, path = self.config.object_address(key)
        url = presign(
            access_key_id=self.config.access_key_id,
            secret_access_key=self.config.secret_access_key,
            session_token=None, method="GET", scheme=scheme, host=host, path=path,
            region=self.config.region, expires_in=120, now=self.config.now(),
        )
        with urllib.request.urlopen(url, timeout=30) as response:
            stored = response.read()

        self.assertEqual(len(stored), len(payload))
        self.assertEqual(stored, payload, "the assembled object differs from what was uploaded")


if __name__ == "__main__":
    unittest.main()
