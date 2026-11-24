#!/usr/bin/env bash
# CIMCMS PostgreSQL backup (plan T4.4). Run on the server as a user that can run docker.
#   0 2 * * *  /opt/cimcms/repo/infra/prod/scripts/backup-postgres.sh >> /var/log/cimcms-backup.log 2>&1
# Writes $BACKUP_DIR/postgres-YYYY-MM-DD.dump (pg_dump custom format, compressed); on Sundays also
# a copy to $BACKUP_DIR/weekly/. Retention: newest 14 daily + newest 8 weekly. Credentials are read
# INSIDE the postgres container from its own environment (postgres.env), never from this file.
#
# Env overrides (all optional):
#   COMPOSE_FILE  compose file             (default: ../docker-compose.yml next to this script)
#   PG_EXEC       command prefix that runs a process in the postgres container,
#                 stdin attached, no TTY   (default: docker compose -f "$COMPOSE_FILE" exec -T postgres)
#   BACKUP_DIR    (default: /var/backups/cimcms)
#   OFFSITE_CMD   optional command run as: $OFFSITE_CMD <dump-path>   (see TODO below)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/../docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cimcms}"
KEEP_DAILY=14
KEEP_WEEKLY=8

# shellcheck disable=SC2206
if [ -n "${PG_EXEC:-}" ]; then EXEC=($PG_EXEC); else EXEC=(docker compose -f "$COMPOSE_FILE" exec -T postgres); fi

umask 077
mkdir -p "$BACKUP_DIR/weekly"
stamp="$(date +%F)"
out="$BACKUP_DIR/postgres-$stamp.dump"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

# The single-quoted script runs inside the container; $POSTGRES_* come from the container env.
# shellcheck disable=SC2016
"${EXEC[@]}" sh -c 'pg_dump --format=custom --compress=6 --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$tmp"

# The dump must be readable by pg_restore (checks the archive table of contents).
"${EXEC[@]}" pg_restore --list < "$tmp" > /dev/null
[ "$(stat -c %s "$tmp")" -gt 1000 ] || { echo "backup suspiciously small, aborting" >&2; exit 1; }
mv "$tmp" "$out"
echo "$(date -Is) wrote $out ($(stat -c %s "$out") bytes)"

# Sunday (date +%u = 7): keep a weekly copy
if [ "$(date +%u)" = "7" ]; then
  cp "$out" "$BACKUP_DIR/weekly/postgres-$stamp.dump"
fi

# Retention (names sort chronologically)
prune() { # dir keep
  ls -1 "$1"/postgres-*.dump 2>/dev/null | sort -r | tail -n +"$(( $2 + 1 ))" | xargs -r rm -f --
}
prune "$BACKUP_DIR" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

# TODO(owner-decision O-13): off-server copy destination. Until the owner names one, backups
# live on the same host and do NOT protect against loss of the server.
if [ -n "${OFFSITE_CMD:-}" ]; then
  # shellcheck disable=SC2086
  $OFFSITE_CMD "$out"
fi
