#!/usr/bin/env bash
# Initializes the Postgres REPLICA from the primary via pg_basebackup and
# configures standby with the replication slot. Idempotent: if PGDATA already
# has contents it skips re-seeding.
set -euo pipefail

: "${PGPRIMARY_HOST:=pg_primary}"
: "${PGPRIMARY_PORT:=5432}"
: "${REPL_USER:=repl}"
: "${REPL_PASSWORD:=repl_secret}"
: "${REPL_SLOT_NAME:=replica_slot}"

export PGPASSWORD="${REPL_PASSWORD}"

if [ -s "${PGDATA}/PG_VERSION" ]; then
  echo "postgres-replica: PGDATA already initialised, skipping basebackup"
else
  echo "postgres-replica: seeding from primary ${PGPRIMARY_HOST} ..."
  pg_basebackup \
    -h "${PGPRIMARY_HOST}" -p "${PGPRIMARY_PORT}" -U "${REPL_USER}" \
    -D "${PGDATA}" -Fp -Xs -P -R -S "${REPL_SLOT_NAME}"
  # -R writes standby.signal + primary_conninfo with the slot
fi

# Ensure replication config survives restarts
cat > "${PGDATA}/postgresql.auto.conf" <<-CONF
primary_slot_name = '${REPL_SLOT_NAME}'
hot_standby = on
CONF

exec docker-entrypoint postgres
