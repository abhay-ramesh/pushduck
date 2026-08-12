"""Cross-implementation agreement.

The conformance suite proves this server obeys the protocol. It does not prove
the three implementations are *interchangeable*, because it matches signatures
and keys by shape — it has to, since both legitimately vary between servers with
different credentials or key generators.

Two things must match exactly for a client to presign against one server and
complete against another, which is the normal outcome of a blue-green deploy or
a load balancer in front of both. The expected values are produced by the
TypeScript implementation and asserted identically in the Go tests.
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pushduck import Router, UploadConfig, generate_key, image  # noqa: E402
from pushduck.config import choose_part_size, MAX_PARTS, MIN_PART_SIZE  # noqa: E402
from pushduck.sign import presign  # noqa: E402

#: The instant the Go and TypeScript tests pin. A signature is scoped to its date.
FIXED_TIME = datetime(2026, 8, 11, 12, 0, 0, tzinfo=timezone.utc)


def fixed_config() -> UploadConfig:
    return UploadConfig(
        bucket="conformance-bucket",
        region="us-east-1",
        access_key_id="conformance-key",
        secret_access_key="conformance-secret",
        now=lambda: FIXED_TIME,
    )


class SignatureAgreement(unittest.TestCase):
    def test_matches_the_other_implementations(self) -> None:
        config = fixed_config()
        scheme, host, path = config.object_address("photo.jpg")

        url = presign(
            access_key_id=config.access_key_id,
            secret_access_key=config.secret_access_key,
            session_token=None,
            method="PUT",
            scheme=scheme,
            host=host,
            path=path,
            region=config.region,
            headers={"x-amz-acl": "private"},
            expires_in=3600,
            now=FIXED_TIME,
        )

        # The value TypeScript and Go both produce for identical inputs.
        self.assertIn(
            "X-Amz-Signature=d5055c164579cc08189f3efa518d271da39979487ca8b8cb49e219349b85ab78",
            url,
        )

    def test_agrees_on_the_inputs_to_the_signature(self) -> None:
        # A mismatch here explains a signature mismatch above rather than
        # leaving it a mystery.
        config = fixed_config()
        scheme, host, path = config.object_address("photo.jpg")

        url = presign(
            access_key_id=config.access_key_id,
            secret_access_key=config.secret_access_key,
            session_token=None,
            method="PUT",
            scheme=scheme,
            host=host,
            path=path,
            region=config.region,
            headers={"x-amz-acl": "private"},
            expires_in=3600,
            now=FIXED_TIME,
        )

        self.assertIn(
            "X-Amz-Credential=conformance-key%2F20260811%2Fus-east-1%2Fs3%2Faws4_request", url
        )
        self.assertIn("X-Amz-Date=20260811T120000Z", url)
        self.assertIn("X-Amz-SignedHeaders=host%3Bx-amz-acl", url)
        self.assertTrue(url.startswith("https://conformance-bucket.s3.us-east-1.amazonaws.com/"))

    def test_temporary_credentials_carry_their_token(self) -> None:
        # The deployment shape AWS recommends — ECS, EKS IRSA, OIDC — and the
        # one that fails with a signature error when the token is dropped.
        config = fixed_config()
        config.session_token = "IQoJb3JpZ2luX2VjEBYaCXVzLWVhc3QtMSJH"
        scheme, host, path = config.object_address("photo.jpg")

        url = presign(
            access_key_id=config.access_key_id,
            secret_access_key=config.secret_access_key,
            session_token=config.session_token,
            method="PUT",
            scheme=scheme,
            host=host,
            path=path,
            region=config.region,
            expires_in=3600,
            now=FIXED_TIME,
        )

        self.assertIn("X-Amz-Security-Token=", url)


class KeyAgreement(unittest.TestCase):
    def test_matches_the_other_implementations(self) -> None:
        # A key that differs between implementations means the same upload
        # lands in two different places.
        cases = [
            ("photo.jpg", "photo.jpg"),
            ("my photo.jpg", "my_photo.jpg"),
            ("file(1).pdf", "file_1_.pdf"),
            ("a,b.csv", "a_b.csv"),
            ("report-2024.final.pdf", "report-2024.final.pdf"),
            ("UPPER_case-99.TXT", "UPPER_case-99.TXT"),
            # The bug that motivated the rewrite: these three collapsed to
            # `.pdf` and overwrote one another.
            ("文档.pdf", "文档.pdf"),
            ("写真.pdf", "写真.pdf"),
            ("Отчёт.pdf", "Отчёт.pdf"),
            ("café.txt", "café.txt"),
            (".gitignore", ".gitignore"),
        ]

        for original, expected in cases:
            with self.subTest(original):
                self.assertEqual(generate_key(original), expected)

    def test_distinct_names_produce_distinct_keys(self) -> None:
        names = ["文档.pdf", "写真.pdf", "报告.pdf", "日本語.pdf", "한국어.pdf", "///.pdf", "???.pdf"]
        keys = [generate_key(name) for name in names]
        self.assertEqual(len(set(keys)), len(names), f"collision among {keys}")

    def test_never_creates_a_directory_level(self) -> None:
        self.assertNotIn("/", generate_key("evil/../../etc/passwd"))


class ValidationAgreement(unittest.TestCase):
    def test_messages_match_the_other_implementations(self) -> None:
        # A user sees this string; it should not depend on which server
        # answered the request.
        route = image(max_size="5MB")
        from pushduck import FileMeta

        message = route.validate(FileMeta("huge.jpg", 50 * 1024 * 1024, "image/jpeg"))
        self.assertEqual(message, "File size 50.0MB exceeds maximum 5.0MB")

        self.assertIsNone(route.validate(FileMeta("a.png", 10, "image/png")))
        self.assertIsNotNone(route.validate(FileMeta("a.pdf", 10, "application/pdf")))


class CompletionTokens(unittest.TestCase):
    def test_round_trips_and_rejects_tampering(self) -> None:
        router = Router(fixed_config())

        token = router._sign_completion("photo.jpg", "imageUpload")
        claim = router._verify_completion(token)
        self.assertEqual(claim["key"], "photo.jpg")
        self.assertEqual(claim["route"], "imageUpload")

        payload, signature = token.split(".")
        with self.assertRaises(Exception):
            router._verify_completion(f"bm90LWEtdG9rZW4.{signature}")
        with self.assertRaises(Exception):
            router._verify_completion(f"{payload}.wrong")


class PartSizing(unittest.TestCase):
    def test_respects_provider_limits(self) -> None:
        self.assertEqual(choose_part_size(10 * (1 << 20), 1 << 20), MIN_PART_SIZE)

        huge = 100 * 1024 * (1 << 20)
        size = choose_part_size(huge, MIN_PART_SIZE)
        self.assertLessEqual(huge // size, MAX_PARTS)


if __name__ == "__main__":
    unittest.main()
