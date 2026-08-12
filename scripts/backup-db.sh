#!/usr/bin/env bash
#
# Self-hosted PostgreSQL backup via pg_dump.
# Usage: npm run db:backup [-- <label>]
#
# Uses DATABASE_URL if set, otherwise the dev default. Backups are written to
# ./data/backups/<label>-<timestamp>.sql.gz and pruned to keep BACKUP_KEEP
# (default 30) files. Restore with:  gunzip -c <file> | psql "$DATABASE_URL"
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="${1:-manual}"
DIR="${REPORTS_DIR:-$ROOT/data}/backups"
KEEP="${BACKUP_KEEP:-30}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  URL="$DATABASE_URL"
else
  URL="${DATABASE_URL_OVERRIDE:-postgres://creative_seo:creative_seo_dev@127.0.0.1:5432/creative_seo}"
fi

mkdir -p "$DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DIR/${LABEL}-${STAMP}.sql.gz"

echo "Backing up database to $FILE"
if ! pg_dump "$URL" | gzip > "$FILE"; then
  echo "Backup failed" >&2
  rm -f "$FILE"
  exit 1
fi

echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
# Prune old backups.
ls -1t "$DIR"/*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "Pruned to keep the ${KEEP} most recent backups."
