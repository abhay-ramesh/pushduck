#!/usr/bin/env bash
#
# Starts a disposable MinIO for the integration tests.
#
# The integration suite skips itself when MinIO is unreachable, so this is
# optional locally — but without it the SigV4 signing path is only ever checked
# against our own expectations, never against a real S3 server.
#
#   ./scripts/minio.sh start    # start and create the bucket
#   ./scripts/minio.sh stop
#   ./scripts/minio.sh status
#
# Ports 9010/9011 are used instead of the defaults so this cannot collide with a
# MinIO the developer is already running for their own project.
#
# The image is Chainguard's, not MinIO's. MinIO withdrew minio/minio from
# Docker Hub in September 2026, and by October quay.io/minio/minio answered
# anonymous pulls with "unauthorized" and dl.min.io returned 410 — no first-party
# distribution is left. cgr.dev/chainguard/minio is built from MinIO's source,
# rebuilt daily, and pullable without an account.
#
# The bucket is created from the host with a SigV4-signed PUT (curl's
# --aws-sigv4) rather than `docker exec mc`, so a substituted MINIO_IMAGE only
# has to serve S3 — it need not ship a shell or the mc client.

set -euo pipefail

CONTAINER="pushduck-minio"
# Overridable so a mirror or a pinned digest can be substituted without a patch.
MINIO_IMAGE="${MINIO_IMAGE:-cgr.dev/chainguard/minio:latest}"
API_PORT="${MINIO_API_PORT:-9010}"
CONSOLE_PORT="${MINIO_CONSOLE_PORT:-9011}"
BUCKET="${MINIO_BUCKET:-test-uploads}"
DOCKER="${DOCKER:-docker}"

require_docker() {
  if ! command -v "$DOCKER" >/dev/null 2>&1; then
    cat >&2 <<'MSG'
Docker is not available on PATH.

The integration suite skips itself without MinIO, so this is optional — but the
SigV4 signing path then goes unverified against a real S3 server.

  macOS:  install Docker Desktop, or set DOCKER=/path/to/docker
  Linux:  install docker.io / podman (DOCKER=podman also works)
MSG
    exit 1
  fi
}

start() {
  require_docker
  if "$DOCKER" ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "MinIO already running on :${API_PORT}"
    return 0
  fi

  echo "Starting MinIO on :${API_PORT} (console :${CONSOLE_PORT})…"
  "$DOCKER" run -d --rm \
    --name "$CONTAINER" \
    -p "${API_PORT}:9000" \
    -p "${CONSOLE_PORT}:9001" \
    -e MINIO_ROOT_USER=minioadmin \
    -e MINIO_ROOT_PASSWORD=minioadmin \
    "$MINIO_IMAGE" server /data --console-address ":9001" >/dev/null

  echo -n "Waiting for readiness"
  local ready=0
  for _ in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:${API_PORT}/minio/health/live" >/dev/null 2>&1; then
      ready=1
      echo " ok"
      break
    fi
    echo -n "."
    sleep 1
  done
  if [ "$ready" -ne 1 ]; then
    echo " timed out" >&2
    "$DOCKER" logs "$CONTAINER" >&2 || true
    exit 1
  fi

  # 200 is created; 409 BucketAlreadyOwnedByYou keeps this idempotent.
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
    --aws-sigv4 "aws:amz:us-east-1:s3" --user minioadmin:minioadmin \
    "http://127.0.0.1:${API_PORT}/${BUCKET}")
  if [ "$code" != "200" ] && [ "$code" != "409" ]; then
    echo "Creating bucket '${BUCKET}' failed: HTTP ${code}" >&2
    exit 1
  fi

  echo "Bucket '${BUCKET}' ready. Run: pnpm test"
}

stop() {
  require_docker
  "$DOCKER" rm -f "$CONTAINER" >/dev/null 2>&1 || true
  echo "MinIO stopped."
}

status() {
  if curl -sf "http://127.0.0.1:${API_PORT}/minio/health/live" >/dev/null 2>&1; then
    echo "MinIO is up on :${API_PORT}"
  else
    echo "MinIO is not reachable on :${API_PORT}"
    exit 1
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  restart) stop; start ;;
  *) echo "usage: $0 {start|stop|status|restart}" >&2; exit 1 ;;
esac
