#!/usr/bin/env bash
# CIMCMS PostgreSQL backup (plan T4.4). Run on the server as a user that can run docker.
#   0 2 * * *  /opt/cimcms/repo/infra/prod/scripts/backup-postgres.sh >> /var/log/cimcms-backup.log 2>&1
# Dumps BOTH databases of the postgres container (pg_dump custom format, compressed):
#   $BACKUP_DIR/postgres-YYYY-MM-DD.dump  app database ($POSTGRES_DB of the container, default cimcms)
#   $BACKUP_DIR/broker-YYYY-MM-DD.dump    broker database ($BROKER_DB, default cimcms_broker:
#                                         MqttAccount logins, MqttRetained)
# On Sundays also copies to $BACKUP_DIR/weekly/. Retention per kind: newest 14 daily + newest 8
# weekly. Credentials are read INSIDE the postgres container from its own environment
# (postgres.env), never from this file. Restore either file with restore-postgres.sh (TARGET_DB).
#
# Env overrides (all optional):
#   COMPOSE_FILE  compose file             (default: ../docker-compose.yml next to this script)
#   PG_EXEC       command prefix that runs a process in the postgres container,
#                 stdin attached, no TTY   (default: docker compose -f "$COMPOSE_FILE" exec -T postgres)
#   BACKUP_DIR    (default: /var/backups/cimcms)
#   BROKER_DB     broker database name (default: cimcms_broker); set BROKER_DB= (empty) to skip it
#   OFFSITE_CMD   optional command run as: $OFFSITE_CMD <dump-path>, once per dump (see TODO below)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/../docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cimcms}"
BROKER_DB="${BROKER_DB-cimcms_broker}"
KEEP_DAILY=14
KEEP_WEEKLY=8

# shellcheck disable=SC2206
if [ -n "${PG_EXEC:-}" ]; then EXEC=($PG_EXEC); else EXEC=(docker compose -f "$COMPOSE_FILE" exec -T postgres); fi

[ -z "$BROKER_DB" ] || [[ "$BROKER_DB" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "invalid BROKER_DB" >&2; exit 2; }

umask 077
mkdir -p "$BACKUP_DIR/weekly"
stamp="$(date +%F)"
tmp=""
trap '[ -z "$tmp" ] || rm -f "$tmp"' EXIT

# backup <prefix> <database|empty = container's $POSTGRES_DB>
backup() {
  local prefix="$1" db="$2" out
  out="$BACKUP_DIR/$prefix-$stamp.dump"
  tmp="$out.partial"
  # The single-quoted script runs inside the container; $POSTGRES_* come from the container env.
  # DB (validated above) is passed as an environment variable, never spliced into the script.
  # shellcheck disable=SC2016
  "${EXEC[@]}" env DB="$db" sh -c 'pg_dump --format=custom --compress=6 --no-owner -U "$POSTGRES_USER" -d "${DB:-$POSTGRES_DB}"' > "$tmp"

  # The dump must be readable by pg_restore (checks the archive table of contents).
  "${EXEC[@]}" pg_restore --list < "$tmp" > /dev/null
  [ "$(stat -c %s "$tmp")" -gt 1000 ] || { echo "backup $prefix suspiciously small, aborting" >&2; exit 1; }
  mv "$tmp" "$out"
  tmp=""
  echo "$(date -Is) wrote $out ($(stat -c %s "$out") bytes)"

  # Sunday (date +%u = 7): keep a weekly copy
  if [ "$(date +%u)" = "7" ]; then
    cp "$out" "$BACKUP_DIR/weekly/$prefix-$stamp.dump"
  fi

  # Retention (names sort chronologically)
  prune "$BACKUP_DIR" "$prefix" "$KEEP_DAILY"
  prune "$BACKUP_DIR/weekly" "$prefix" "$KEEP_WEEKLY"

  # TODO(owner-decision O-13): off-server copy destination. Until the owner names one, backups
  # live on the same host and do NOT protect against loss of the server.
  if [ -n "${OFFSITE_CMD:-}" ]; then
    # shellcheck disable=SC2086
    $OFFSITE_CMD "$out"
  fi
}

prune() { # dir prefix keep
  # "|| true": an empty folder (no weekly dump yet) must not end the run under pipefail.
  { ls -1 "$1"/"$2"-*.dump 2>/dev/null || true; } | sort -r | tail -n +"$(( $3 + 1 ))" | xargs -r rm -f --
}

backup postgres ""                                   # app database (POSTGRES_DB)
[ -z "$BROKER_DB" ] || backup broker "$BROKER_DB"    # broker database
