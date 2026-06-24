#!/usr/bin/env bash
# Restore a pg_dump backup into the live Postgres service.
#
# Usage:
#   ./restore-postgres.sh <path-to-dump-or-gpg-file> [--target-db NAME]
#
# Verifies sha256 if a sidecar exists, decrypts if .gpg, then runs pg_restore.
# Requires PG* env vars (PGHOST, PGUSER, PGPASSWORD, PGDATABASE) — same as
# the backup container.

set -euo pipefail

usage() {
  echo "Usage: $0 <dump-file> [--target-db NAME]" >&2
  exit 2
}

[ "$#" -ge 1 ] || usage
SOURCE="$1"
shift

TARGET_DB="${PGDATABASE:-}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --target-db) TARGET_DB="$2"; shift 2 ;;
    *) usage ;;
  esac
done

[ -n "${TARGET_DB}" ] || { echo "PGDATABASE not set and --target-db not given" >&2; exit 2; }
[ -f "${SOURCE}" ] || { echo "File not found: ${SOURCE}" >&2; exit 1; }

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

DUMP_FILE="${SOURCE}"

# Verify sha256 if sidecar exists
SHA_FILE="${SOURCE}.sha256"
if [ -f "${SHA_FILE}" ]; then
  log "Verifying sha256 against ${SHA_FILE}"
  expected="$(awk '{print $1}' "${SHA_FILE}")"
  actual="$(sha256sum "${SOURCE}" | awk '{print $1}')"
  if [ "${expected}" != "${actual}" ]; then
    log "Checksum mismatch: expected=${expected} actual=${actual}"
    exit 1
  fi
  log "Checksum OK"
else
  log "WARNING: no .sha256 sidecar — skipping integrity check"
fi

# Decrypt if .gpg
case "${SOURCE}" in
  *.gpg)
    [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ] || {
      echo "BACKUP_ENCRYPTION_PASSPHRASE required to decrypt ${SOURCE}" >&2
      exit 1
    }
    DUMP_FILE="${WORK_DIR}/$(basename "${SOURCE%.gpg}")"
    log "Decrypting → ${DUMP_FILE}"
    gpg --batch --quiet --yes --decrypt \
        --passphrase "${BACKUP_ENCRYPTION_PASSPHRASE}" \
        --output "${DUMP_FILE}" "${SOURCE}"
    ;;
esac

log "Restoring into database '${TARGET_DB}'"
log "WARNING: --clean is enabled. Existing objects in ${TARGET_DB} will be dropped."

pg_restore \
  --dbname="${TARGET_DB}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --jobs=4 \
  "${DUMP_FILE}"

log "Restore complete"
