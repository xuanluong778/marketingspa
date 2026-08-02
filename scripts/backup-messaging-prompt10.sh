#!/usr/bin/env bash
# Backup code + database trước khi triển khai messaging (Prompt 10)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
DEST="$BACKUP_DIR/prompt10_$STAMP"
mkdir -p "$DEST"

echo "==> Backup code snapshot → $DEST/code.tgz"
tar -czf "$DEST/code.tgz" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='dist' \
  --exclude='backups' \
  --exclude='*.log' \
  -C "$ROOT" \
  apps packages scripts docs prisma 2>/dev/null \
  || tar -czf "$DEST/code.tgz" \
    --exclude='node_modules' --exclude='.next' --exclude='dist' --exclude='backups' \
    -C "$ROOT" apps packages scripts docs

if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT/.env"; set +a
fi

DB_URL="${DATABASE_URL:-}"
if [[ -n "$DB_URL" ]]; then
  echo "==> pg_dump → $DEST/db.sql.gz"
  # Prisma URL may include ?schema=public — strip query for pg_dump
  PG_URL="${DB_URL%%\?*}"
  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump "$PG_URL" | gzip > "$DEST/db.sql.gz" || echo "WARN: pg_dump failed"
  else
    echo "WARN: pg_dump not found — skip DB backup"
  fi
else
  echo "WARN: DATABASE_URL empty — skip DB backup"
fi

echo "==> Env flag snapshot"
grep -E 'MESSAGING_LIVE_SEND|DATABASE_URL' "$ROOT/.env" 2>/dev/null | sed 's/=.*/=***/' > "$DEST/env-flags.txt" || true

echo "OK: $DEST"
ls -lh "$DEST"
