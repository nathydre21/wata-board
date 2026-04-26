#!/usr/bin/env bash
# Periodic PostgreSQL backup script.
#
# Runs in an infinite loop, taking a pg_dump every BACKUP_INTERVAL_SECONDS.
# Each iteration:
#   1. pg_dump -Fc (custom format, restorable with pg_restore)
#   2. sha256 sidecar for the BackupVerifier integrity check
#   3. optional GPG symmetric encryption (BACKUP_ENCRYPTION_PASSPHRASE)
#   4. optional off-site upload to S3-compatible store (BACKUP_S3_BUCKET)
#   5. retention pruning: BACKUP_RETENTION_DAYS daily, _WEEKS weekly,
#      _MONTHS monthly
#   6. updates /backups/.last-success — read by the backend's /health/backup
#      endpoint and the container's healthcheck.
#
# Designed to fail loudly: any step failing is logged and the iteration is
# skipped without updating the success marker. Staleness > 25h is the alert.

set -uo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
BACKUP_RETENTION_WEEKS="${BACKUP_RETENTION_WEEKS:-4}"
BACKUP_RETENTION_MONTHS="${BACKUP_RETENTION_MONTHS:-12}"
SUCCESS_MARKER="${BACKUP_DIR}/.last-success"

mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly" "${BACKUP_DIR}/monthly"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

run_backup() {
  local timestamp dump_file sha_file encrypted_file basename
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  basename="${PGDATABASE}-${timestamp}.dump"
  dump_file="${BACKUP_DIR}/daily/${basename}"
  sha_file="${dump_file}.sha256"

  log "Starting pg_dump → ${dump_file}"
  if ! pg_dump --format=custom --compress=6 --no-owner --no-privileges \
      --file="${dump_file}" "${PGDATABASE}"; then
    log "pg_dump FAILED"
    rm -f "${dump_file}"
    return 1
  fi

  # Refuse anything suspiciously small — pg_dump can exit 0 on edge cases
  # where the dump is effectively empty.
  local size
  size="$(stat -c %s "${dump_file}" 2>/dev/null || stat -f %z "${dump_file}")"
  if [ "${size}" -lt 1024 ]; then
    log "Dump file too small (${size} bytes) — refusing"
    rm -f "${dump_file}"
    return 1
  fi

  log "Computing SHA-256"
  ( cd "$(dirname "${dump_file}")" && sha256sum "$(basename "${dump_file}")" ) \
      | awk '{print $1}' > "${sha_file}"

  if [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
    encrypted_file="${dump_file}.gpg"
    log "Encrypting → ${encrypted_file}"
    if ! gpg --batch --yes --quiet --symmetric --cipher-algo AES256 \
        --passphrase "${BACKUP_ENCRYPTION_PASSPHRASE}" \
        --output "${encrypted_file}" "${dump_file}"; then
      log "GPG encryption FAILED"
      return 1
    fi
    rm -f "${dump_file}"
    dump_file="${encrypted_file}"
    ( cd "$(dirname "${dump_file}")" && sha256sum "$(basename "${dump_file}")" ) \
        | awk '{print $1}' > "${dump_file}.sha256"
    rm -f "${sha_file}"
    sha_file="${dump_file}.sha256"
  fi

  if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    local s3_uri="s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-postgres}/daily/$(basename "${dump_file}")"
    log "Uploading to ${s3_uri}"
    local aws_args=()
    [ -n "${AWS_ENDPOINT_URL:-}" ] && aws_args+=(--endpoint-url "${AWS_ENDPOINT_URL}")
    if ! aws "${aws_args[@]}" s3 cp "${dump_file}" "${s3_uri}" \
        --only-show-errors; then
      log "S3 upload FAILED"
      return 1
    fi
    aws "${aws_args[@]}" s3 cp "${sha_file}" "${s3_uri}.sha256" \
        --only-show-errors || log "S3 sha256 upload FAILED (non-fatal)"
  fi

  promote_weekly_monthly "${dump_file}" "${sha_file}"
  prune_retention
  date +%s > "${SUCCESS_MARKER}"
  log "Backup OK"
  return 0
}

# On Sundays, copy the most recent daily into weekly/. On the 1st of the month,
# also copy into monthly/. Cheap and lets the daily prune run independently.
promote_weekly_monthly() {
  local dump="$1" sha="$2"
  local dow dom
  dow="$(date -u +%u)"  # 1=Mon … 7=Sun
  dom="$(date -u +%d)"
  if [ "${dow}" = "7" ]; then
    cp -f "${dump}" "${BACKUP_DIR}/weekly/" && cp -f "${sha}" "${BACKUP_DIR}/weekly/"
    log "Promoted to weekly"
  fi
  if [ "${dom}" = "01" ]; then
    cp -f "${dump}" "${BACKUP_DIR}/monthly/" && cp -f "${sha}" "${BACKUP_DIR}/monthly/"
    log "Promoted to monthly"
  fi
}

prune_retention() {
  prune_dir "${BACKUP_DIR}/daily"   "${BACKUP_RETENTION_DAYS}"
  prune_dir "${BACKUP_DIR}/weekly"  $((BACKUP_RETENTION_WEEKS * 7))
  prune_dir "${BACKUP_DIR}/monthly" $((BACKUP_RETENTION_MONTHS * 31))
}

prune_dir() {
  local dir="$1" days="$2"
  [ -d "${dir}" ] || return 0
  find "${dir}" -type f -mtime "+${days}" -print -delete | while read -r f; do
    log "Pruned ${f}"
  done
}

log "Backup loop starting (interval=${BACKUP_INTERVAL_SECONDS}s, retention=${BACKUP_RETENTION_DAYS}d/${BACKUP_RETENTION_WEEKS}w/${BACKUP_RETENTION_MONTHS}m)"
while true; do
  run_backup || log "Iteration failed — success marker NOT updated"
  sleep "${BACKUP_INTERVAL_SECONDS}"
done
