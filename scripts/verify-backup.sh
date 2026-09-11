#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
BACKUP=${1:?Usage: scripts/verify-backup.sh path/to/backup.dump}
command -v pg_restore >/dev/null
TMPDB="bwcos_restore_verify_$(date +%s)"
BASE_URL="${DATABASE_URL%/*}"
cleanup(){ psql "$BASE_URL/postgres" -v ON_ERROR_STOP=1 -c "drop database if exists \"$TMPDB\" with (force);" >/dev/null 2>&1 || true; }
trap cleanup EXIT
psql "$BASE_URL/postgres" -v ON_ERROR_STOP=1 -c "create database \"$TMPDB\";" >/dev/null
pg_restore --no-owner --no-privileges --dbname="$BASE_URL/$TMPDB" "$BACKUP"
COUNT=$(psql "$BASE_URL/$TMPDB" -Atc "select count(*) from information_schema.tables where table_schema='public';")
[ "$COUNT" -ge 8 ] || { echo "Restore verification failed: only $COUNT public tables" >&2; exit 1; }
echo "Backup restore verification passed: $COUNT public tables restored"
