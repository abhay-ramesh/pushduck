"""An in-memory object store that answers the slice of the S3 API the router uses.

Completion asks storage what it holds, so a router test needs storage that
answers. MinIO answers truthfully but is not always running; this answers every
time, so the completion rules are tested on every run and the MinIO tests stay
about signatures and assembly. Signatures are not checked here.
"""

from __future__ import annotations

import hashlib
import re
import threading
from dataclasses import dataclass, field
from email.utils import formatdate
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Tuple
from urllib.parse import parse_qs, unquote, urlparse

from pushduck import UploadConfig

BUCKET = "memory-bucket"


@dataclass
class StoredObject:
    body: bytes
    content_type: str
    modified: float = 0.0


@dataclass
class MemoryStorage:
    objects: Dict[str, StoredObject] = field(default_factory=dict)
    #: upload id → (content type, part number → bytes)
    uploads: Dict[str, Tuple[str, Dict[int, bytes]]] = field(default_factory=dict)
    port: int = 0

    def config(self) -> UploadConfig:
        return UploadConfig(
            bucket=BUCKET,
            access_key_id="memory-key",
            secret_access_key="memory-secret",
            endpoint=f"http://127.0.0.1:{self.port}",
            force_path_style=True,
        )

    def put(self, key: str, size: int, content_type: str) -> None:
        """Store an object directly, as a browser's PUT would."""
        self.objects[key] = StoredObject(b"\0" * size, content_type)


def _etag(body: bytes) -> str:
    return '"' + hashlib.md5(body).hexdigest() + '"'


def start() -> Tuple[MemoryStorage, ThreadingHTTPServer]:
    """Start a store on a free port. Call ``server.shutdown()`` when done."""
    storage = MemoryStorage()
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args: object) -> None:  # quiet
            pass

        def _reply(self, status: int, body: bytes = b"", headers: Dict[str, str] = {}) -> None:
            self.send_response(status)
            for name, value in headers.items():
                self.send_header(name, value)
            if "Content-Length" not in headers:
                self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _serve(self) -> None:
            parsed = urlparse(self.path)
            key = unquote(parsed.path[len(f"/{BUCKET}/"):])
            query = parse_qs(parsed.query, keep_blank_values=True)
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length else b""

            with lock:
                self._dispatch(key, query, body)

        def _dispatch(self, key: str, query: Dict, body: bytes) -> None:
            method = self.command
            upload_id = query.get("uploadId", [""])[0]
            no_such_upload = b"<Error><Code>NoSuchUpload</Code><Message>gone</Message></Error>"

            if method == "POST" and "uploads" in query:
                upload_id = f"upload-{len(storage.uploads) + 1}"
                storage.uploads[upload_id] = (self.headers.get("Content-Type", ""), {})
                self._reply(200, (
                    "<InitiateMultipartUploadResult>"
                    f"<Key>{key}</Key><UploadId>{upload_id}</UploadId>"
                    "</InitiateMultipartUploadResult>"
                ).encode())
            elif method == "PUT" and "partNumber" in query:
                if upload_id not in storage.uploads:
                    return self._reply(404, no_such_upload)
                storage.uploads[upload_id][1][int(query["partNumber"][0])] = body
                self._reply(200, headers={"ETag": _etag(body)})
            elif method == "POST" and upload_id:
                if upload_id not in storage.uploads:
                    return self._reply(404, no_such_upload)
                content_type, parts = storage.uploads.pop(upload_id)
                numbers = [int(n) for n in re.findall(rb"<PartNumber>(\d+)</PartNumber>", body)]
                assembled = b"".join(parts[n] for n in numbers)
                storage.objects[key] = StoredObject(assembled, content_type)
                self._reply(200, b"<CompleteMultipartUploadResult/>")
            elif method == "GET" and upload_id:
                if upload_id not in storage.uploads:
                    return self._reply(404, no_such_upload)
                parts = storage.uploads[upload_id][1]
                listing = "".join(
                    f"<Part><PartNumber>{n}</PartNumber><ETag>{_etag(parts[n])}</ETag></Part>"
                    for n in sorted(parts)
                )
                self._reply(200, (
                    f"<ListPartsResult><IsTruncated>false</IsTruncated>{listing}</ListPartsResult>"
                ).encode())
            elif method == "DELETE" and upload_id:
                storage.uploads.pop(upload_id, None)
                self._reply(204)
            elif method == "PUT":
                storage.objects[key] = StoredObject(body, self.headers.get("Content-Type", ""))
                self._reply(200, headers={"ETag": _etag(body)})
            elif method in ("HEAD", "GET"):
                stored = storage.objects.get(key)
                if stored is None:
                    return self._reply(404)
                self._reply(200, stored.body, {
                    "Content-Type": stored.content_type,
                    "Content-Length": str(len(stored.body)),
                    "ETag": _etag(stored.body),
                    "Last-Modified": formatdate(usegmt=True),
                })
            elif method == "DELETE":
                storage.objects.pop(key, None)
                self._reply(204)
            else:
                self._reply(501)

        do_GET = do_PUT = do_POST = do_DELETE = do_HEAD = _serve

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    storage.port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return storage, server
