#!/usr/bin/env bash
# Runs as /docker-entrypoint-initdb.d init on the Postgres PRIMARY to enable
# streaming replication with a replication slot + WAL archiving for PITR.
set -euo pipefail

: "${REPL_USER:=repl}"
: "${REPL_PASSWORD:=repl_secret}"
: "${REPL_SLOT_NAME:=replica_slot}"

# 1) Replication role
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${REPL_USER}') THEN
      CREATE ROLE ${REPL_USER} WITH REPLICATION LOGIN PASSWORD '${REPL_PASSWORD}';
    END IF;
  END
  \$\$;
EOSQL

# 2) Replication slot (prevents WAL removal while the replica is disconnected)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT pg_create_physical_replication_slot('${REPL_SLOT_NAME}')
  WHERE NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name='${REPL_SLOT_NAME}');
EOSQL

# 3) Allow replication connections from the docker network
cat >> "${PGDATA}/pg_hba.conf" <<-HBA
host    replication     ${REPL_USER}      0.0.0.0/0    scram-sha-256
HBA

echo "postgres-primary-init: replication user=${REPL_USER}, slot=${REPL_SLOT_NAME}"
