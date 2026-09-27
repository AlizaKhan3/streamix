#!/bin/bash
# ============================================================
# Entrypoint for every REPLICA node.
#
# On first boot it clones the primary with pg_basebackup (-R writes
# standby.signal + primary_conninfo), which turns this container into a
# hot-standby that continuously replays the primary's WAL stream —
# i.e. real asynchronous primary→replica (leader→follower) replication.
# ============================================================
set -e

PGDATA="${PGDATA:-/var/lib/postgresql/data}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[replica] waiting for primary ${PRIMARY_HOST} ..."
  # The primary only listens on TCP after its init scripts finish,
  # so "ready" here also means the schema already exists.
  until pg_isready -h "$PRIMARY_HOST" -p 5432 -q; do sleep 2; done

  echo "[replica] cloning ${PRIMARY_HOST} with pg_basebackup ..."
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"
  gosu postgres env PGPASSWORD="$REPLICATION_PASSWORD" \
    pg_basebackup -h "$PRIMARY_HOST" -p 5432 -U "$REPLICATION_USER" -D "$PGDATA" -X stream -R
  echo "[replica] base backup done, starting as hot standby"
fi

exec docker-entrypoint.sh "$@"
