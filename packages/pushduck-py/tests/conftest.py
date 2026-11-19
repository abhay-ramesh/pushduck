from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import memory_storage  # noqa: E402


@pytest.fixture
def storage():
    """An in-memory S3 over real HTTP; see ``memory_storage.py``."""
    store, server = memory_storage.start()
    yield store
    server.shutdown()
    server.server_close()
