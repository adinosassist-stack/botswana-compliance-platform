#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
FILE="${1:?Usage: restore-db.sh backup.dump}"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$DATABASE_URL" "$FILE"
echo "Restore completed from $FILE"
