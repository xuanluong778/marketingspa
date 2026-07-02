#!/bin/sh
# PostgreSQL daily backup script
# Chạy qua cron trong container backup hoặc host VPS

set -e

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="marketingspa_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting PostgreSQL backup: $FILENAME"

PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h "${POSTGRES_HOST:-postgres}" \
  -U "${POSTGRES_USER:-marketingspa}" \
  -d "${POSTGRES_DB:-marketingspa}" \
  | gzip > "$BACKUP_DIR/$FILENAME"

echo "[backup] Saved to $BACKUP_DIR/$FILENAME"

# Xóa backup cũ hơn RETENTION_DAYS
find "$BACKUP_DIR" -name "marketingspa_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

echo "[backup] Cleanup done (retention: ${RETENTION_DAYS} days)"
