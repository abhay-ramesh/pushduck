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

set -euo pipefail

CONTAINER="pushduck-minio"
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
    minio/minio server /data --console-address ":9001" >/dev/null

  echo -n "Waiting for readiness"
  for _ in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:${API_PORT}/minio/health/live" >/dev/null 2>&1; then
      echo " ok"
      break
    fi
    echo -n "."
    sleep 1
  done

  "$DOCKER" exec "$CONTAINER" \
    mc alias set local http://127.0.0.1:9000 minioadmin minioadmin >/dev/null
  # `--ignore-existing` keeps this idempotent across restarts.
  "$DOCKER" exec "$CONTAINER" mc mb --ignore-existing "local/${BUCKET}" >/dev/null

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
