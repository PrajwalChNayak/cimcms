#!/usr/bin/env bash
# CIMCMS MongoDB restore (plan T4.4). DESTRUCTIVE with --drop. Read docs/runbooks/backup-restore.md.
# Usage: restore-mongo.sh <archive.gz> [--drop] [--yes]
#   Without --drop existing documents are kept and duplicates error out (safe merge into empty db).
#   With --drop each collection in the archive is dropped before restore (replaces live data).
# Env overrides: COMPOSE_FILE, MONGO_EXEC, MONGO_AUTH (as in backup-mongo.sh), plus
#   SOURCE_DB  database name inside the archive           (default: cimcms)
#   TARGET_DB  restore into this database name instead    (default: same as SOURCE_DB;
#              use a scratch name for drills so production data is never touched)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/../docker-compose.yml}"
MONGO_AUTH="${MONGO_AUTH:-1}"
SOURCE_DB="${SOURCE_DB:-cimcms}"
TARGET_DB="${TARGET_DB:-$SOURCE_DB}"

archive="${1:-}"; shift || true
drop=''; yes=0
for a in "$@"; do
  case "$a" in
    --drop) drop='--drop' ;;
    --yes) yes=1 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done
[ -f "$archive" ] || { echo "usage: $0 <archive.gz> [--drop] [--yes]" >&2; exit 2; }
gzip -t "$archive"

# shellcheck disable=SC2206
if [ -n "${MONGO_EXEC:-}" ]; then EXEC=($MONGO_EXEC); else EXEC=(docker compose -f "$COMPOSE_FILE" exec -T mongo); fi

if [ "$yes" != "1" ]; then
  echo "About to restore '$archive' ($SOURCE_DB) into database '$TARGET_DB' ${drop:+WITH --drop (existing collections will be replaced)}."
  read -r -p "Type the target database name ($TARGET_DB) to continue: " ans
  [ "$ans" = "$TARGET_DB" ] || { echo "aborted"; exit 1; }
fi

if [ "$MONGO_AUTH" = "1" ]; then
  auth='--username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin'
else
  auth=''
fi

"${EXEC[@]}" sh -c "mongorestore --archive --gzip $auth $drop --nsInclude '$SOURCE_DB.*' --nsFrom '$SOURCE_DB.*' --nsTo '$TARGET_DB.*'" < "$archive"
echo "restore finished into database '$TARGET_DB'"
