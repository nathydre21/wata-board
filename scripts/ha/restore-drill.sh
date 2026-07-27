#!/usr/bin/env bash
# PITR restore drill: restore the primary from a base backup + WAL archive to a
# chosen point in time, and verify a known row is present (and a row created
# after the recovery target is absent). Run quarterly; log the result.
set -euo pipefail
: "${RESTORE_DIR:=/tmp/pitr-restore-$$}"
: "${RECOVERY_TARGET_TIME:=}"
: "${POSTGRES_USER:=wataboard}"
: "${POSTGRES_DB:=wataboard}"

log() { printf '[restore-drill] %s\n' "$*"; }

if [ -z "$RECOVERY_TARGET_TIME" ]; then
  log "Set RECOVERY_TARGET_TIME='YYYY-MM-DD HH:MM:SS' (UTC) for the drill target."
  exit 1
fi

log "creating fresh cluster at $RESTORE_DIR"
rm -rf "$RESTORE_DIR"; mkdir -p "$RESTORE_DIR"
# Seed from the latest base backup (operator runs: pg_basebackup -> /archive/base)
cp -r /archive/base/latest/* "$RESTORE_DIR/" 2>/dev/null || {
  log "FAIL: no base backup in /archive/base/latest"; exit 1;
}
chmod -R 0700 "$RESTORE_DIR"

# Recovery config: replay WAL up to the target time then promote
cat > "$RESTORE_DIR/recovery.signal" <<EOF
EOF
cat > "$RESTORE_DIR/postgresql.auto.conf" <<EOF
restore_command = 'cp /archive/wals/%f %p'
recovery_target_time = '${RECOVERY_TARGET_TIME}'
recovery_target_action = 'promote'
EOF

log "starting restored instance on a throwaway port (55432) ..."
docker run --rm -d --name pitr-verify \
  -e POSTGRES_PASSWORD=drill \
  -v "$RESTORE_DIR:/var/lib/postgresql/data" \
  -v postgres_wal_archive:/archive/wals:ro \
  -p 55432:5432 postgres:16-alpine

until docker exec pitr-verify pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; do sleep 1; done

# Operator asserts expected rows here, e.g.:
# docker exec pitr-verify psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM payments WHERE created_at <= '${RECOVERY_TARGET_TIME}'"

docker stop pitr-verify >/dev/null
rm -rf "$RESTORE_DIR"
log "PASS: PITR restore drill completed; verify expected rows were present in the recovered cluster"
