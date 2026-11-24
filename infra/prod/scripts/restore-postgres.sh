#!/usr/bin/env bash
# CIMCMS PostgreSQL restore (plan T4.4). DESTRUCTIVE for the target database. Read
# docs/runbooks/backup-restore.md first.
# Usage: restore-postgres.sh <file.dump> [--yes]
# Env overrides: COMPOSE_FILE, PG_EXEC (as in backup-postgres.sh), plus
#   TARGET_DB  database to restore into (default: cimcms_restore_check, a scratch database).
#              Restoring into the live database (cimcms) needs the api container stopped first.
#              Broker dumps (broker-*.dump from backup-postgres.sh) go into the broker database
#              (TARGET_DB=cimcms_broker; stop the broker and api containers first).
# The target database is dropped and re-created, then the dump is restored into it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/../docker-compose.yml}"
TARGET_DB="${TARGET_DB:-cimcms_restore_check}"

dump="${1:-}"; shift || true
yes=0
for a in "$@"; do
  case "$a" in
    --yes) yes=1 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done
[ -f "$dump" ] || { echo "usage: $0 <file.dump> [--yes]" >&2; exit 2; }
[[ "$TARGET_DB" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "invalid TARGET_DB" >&2; exit 2; }

# shellcheck disable=SC2206
if [ -n "${PG_EXEC:-}" ]; then EXEC=($PG_EXEC); else EXEC=(docker compose -f "$COMPOSE_FILE" exec -T postgres); fi

"${EXEC[@]}" pg_restore --list < "$dump" > /dev/null   # readable archive?

if [ "$yes" != "1" ]; then
  echo "About to DROP and re-create database '$TARGET_DB', then restore '$dump' into it."
  read -r -p "Type the target database name ($TARGET_DB) to continue: " ans
  [ "$ans" = "$TARGET_DB" ] || { echo "aborted"; exit 1; }
fi

# TARGET_DB is validated above (lower-case identifier), so it is safe inside the SQL text.
"${EXEC[@]}" sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d postgres \
  -c 'DROP DATABASE IF EXISTS \"$TARGET_DB\" WITH (FORCE)' -c 'CREATE DATABASE \"$TARGET_DB\"'"
"${EXEC[@]}" sh -c "pg_restore --no-owner --exit-on-error -U \"\$POSTGRES_USER\" -d \"$TARGET_DB\"" < "$dump"
echo "restore finished into database '$TARGET_DB'"
