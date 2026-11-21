#!/usr/bin/env bash
# CIMCMS MongoDB backup (plan T4.4). Run on the server as a user that can run docker.
#   0 2 * * *  /opt/cimcms/repo/infra/prod/scripts/backup-mongo.sh >> /var/log/cimcms-backup.log 2>&1
# Writes $BACKUP_DIR/mongo-YYYY-MM-DD.archive.gz; on Sundays also a copy to $BACKUP_DIR/weekly/.
# Retention: newest 14 daily + newest 8 weekly. Credentials are read INSIDE the mongo container
# from its own environment (mongo.env), never from the host command line or this file.
#
# Env overrides (all optional):
#   COMPOSE_FILE  compose file             (default: ../docker-compose.yml next to this script)
#   MONGO_EXEC    command prefix that runs a process in the mongo container,
#                 stdin attached, no TTY   (default: docker compose -f "$COMPOSE_FILE" exec -T mongo)
#   MONGO_AUTH    1 = use root credentials from the container env, 0 = no auth (local dev only)
#   DB_NAME       database to dump; empty = whole instance (default: cimcms)
#   BACKUP_DIR    (default: /var/backups/cimcms)
#   OFFSITE_CMD   optional command run as: $OFFSITE_CMD <archive-path>   (see TODO below)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/../docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cimcms}"
DB_NAME="${DB_NAME-cimcms}"
MONGO_AUTH="${MONGO_AUTH:-1}"
KEEP_DAILY=14
KEEP_WEEKLY=8

# shellcheck disable=SC2206
if [ -n "${MONGO_EXEC:-}" ]; then EXEC=($MONGO_EXEC); else EXEC=(docker compose -f "$COMPOSE_FILE" exec -T mongo); fi

umask 077
mkdir -p "$BACKUP_DIR/weekly"
stamp="$(date +%F)"
out="$BACKUP_DIR/mongo-$stamp.archive.gz"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

if [ "$MONGO_AUTH" = "1" ]; then
  auth='--username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin'
else
  auth=''
fi
db_arg=''
[ -n "$DB_NAME" ] && db_arg="--db $DB_NAME"

# The single-quoted script runs inside the container; $VARS there come from the container env.
"${EXEC[@]}" sh -c "mongodump --quiet --archive --gzip $auth $db_arg" > "$tmp"

gzip -t "$tmp"                       # archive must be a valid gzip stream
[ "$(stat -c %s "$tmp")" -gt 100 ] || { echo "backup suspiciously small, aborting" >&2; exit 1; }
mv "$tmp" "$out"
echo "$(date -Is) wrote $out ($(stat -c %s "$out") bytes)"

# Sunday (date +%u = 7): keep a weekly copy
if [ "$(date +%u)" = "7" ]; then
  cp "$out" "$BACKUP_DIR/weekly/mongo-$stamp.archive.gz"
fi

# Retention (names sort chronologically)
prune() { # dir keep
  ls -1 "$1"/mongo-*.archive.gz 2>/dev/null | sort -r | tail -n +"$(( $2 + 1 ))" | xargs -r rm -f --
}
prune "$BACKUP_DIR" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

# TODO(owner-decision O-13): off-server copy destination. Until the owner names one, backups
# live on the same host and do NOT protect against loss of the server.
if [ -n "${OFFSITE_CMD:-}" ]; then
  # shellcheck disable=SC2086
  $OFFSITE_CMD "$out"
fi
