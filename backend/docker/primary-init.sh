#!/bin/bash
# ============================================================
# Runs once, on first boot of every PRIMARY node (before the schema file).
# Creates the replication role and allows it in pg_hba.conf so the
# matching replica container can stream WAL from this node.
# ============================================================
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE ${REPLICATION_USER} WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD}';
EOSQL

echo "host replication ${REPLICATION_USER} all scram-sha-256" >> "$PGDATA/pg_hba.conf"
