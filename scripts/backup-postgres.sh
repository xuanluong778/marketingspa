#!/bin/sh
# PostgreSQL backup — lưu vào ./backups (hoặc BACKUP_DIR)
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="marketingspa_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

if [ -z "$DATABASE_URL" ] && [ -z "$POSTGRES_PASSWORD" ]; then
  echo "[backup] ERROR: Set DATABASE_URL or POSTGRES_* env vars"
  exit 1
fi

echo "[backup] Starting PostgreSQL backup: $FILENAME"

if [ -n "$DATABASE_URL" ]; then
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/$FILENAME"
else
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "${POSTGRES_HOST:-localhost}" \
    -p "${POSTGRES_PORT:-5432}" \
    -U "${POSTGRES_USER:-marketingspa}" \
    -d "${POSTGRES_DB:-marketingspa}" \
    | gzip > "$BACKUP_DIR/$FILENAME"
fi

echo "[backup] Saved to $BACKUP_DIR/$FILENAME"
find "$BACKUP_DIR" -name "marketingspa_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[backup] Cleanup done (retention: ${RETENTION_DAYS} days)"
