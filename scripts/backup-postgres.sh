#!/usr/bin/env bash
# Daily PostgreSQL backup — never dump through PgBouncer, never print secrets.
# Offsite = S3/R2, SSH VPS, or encrypted SMTP/IMAP mailbox (not same-host copy).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${BACKUP_DIR:-}" ] || [ "${BACKUP_DIR#/}" = "$BACKUP_DIR" ]; then
  BACKUP_DIR="/var/www/marketingaut_usr/data/backups/postgres"
fi
if [ -z "${BACKUP_OFFSITE_DIR:-}" ] || [ "${BACKUP_OFFSITE_DIR#/}" = "$BACKUP_OFFSITE_DIR" ]; then
  OFFSITE_DIR="/var/www/marketingaut_usr/data/backups/postgres-offsite"
else
  OFFSITE_DIR="$BACKUP_OFFSITE_DIR"
fi
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-21}"
if [ "$RETENTION_DAYS" -lt 14 ]; then RETENTION_DAYS=14; fi
if [ "$RETENTION_DAYS" -gt 30 ]; then RETENTION_DAYS=30; fi
ALERT_LOG="${BACKUP_ALERT_LOG:-$BACKUP_DIR/alerts.log}"
STATUS_FILE="$BACKUP_DIR/last-status.json"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
FILENAME="marketingspa_${TIMESTAMP}.dump"
PG_CONTAINER="${BACKUP_PG_CONTAINER:-marketingspa-postgres-dev}"
NODE_BIN="${NODE_BIN:-/var/www/marketingaut_usr/data/.nvm/versions/node/v22.22.3/bin/node}"

mkdir -p "$BACKUP_DIR" "$OFFSITE_DIR"
if ! command -v node >/dev/null 2>&1 && [ -x "$NODE_BIN" ]; then
  PATH="$(dirname "$NODE_BIN"):$PATH"
fi

external_alert() {
  local level="$1"
  local code="$2"
  local msg="$3"
  "$NODE_BIN" "$ROOT_DIR/scripts/lib/send-ops-alert.cjs" "$level" "$code" "$msg" >/dev/null 2>&1 || true
}

alert() {
  local msg="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$(dirname "$ALERT_LOG")"
  echo "[$ts] BACKUP_FAIL $msg" >> "$ALERT_LOG"
  echo "[backup] ALERT $msg" >&2
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    curl -sS -m 10 -X POST -H 'Content-Type: application/json' \
      --data "{\"text\":\"Marketing Auto AZ backup FAIL: ${msg}\"}" \
      "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
  external_alert CRITICAL BACKUP_FAIL "$msg"
}

write_status() {
  local ok="$1"
  local extra="$2"
  cat > "$STATUS_FILE" <<EOF
{"ok": ${ok}, "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "file": "${extra}", "retentionDays": ${RETENTION_DAYS}}
EOF
}

on_err() {
  alert "script_aborted"
  write_status false ""
}
trap on_err ERR

echo "[backup] starting dump=$FILENAME"

eval "$("$NODE_BIN" "$ROOT_DIR/scripts/lib/pg-dump-env.cjs")"

if [ "${PGPORT:-}" = "6432" ]; then
  alert "refused_pgbouncer_port_6432"
  exit 2
fi

DUMP_PATH="$BACKUP_DIR/$FILENAME"
DUMPED=0

if command -v docker >/dev/null 2>&1 && docker exec "$PG_CONTAINER" pg_dump --version >/dev/null 2>&1; then
  docker exec "$PG_CONTAINER" pg_dump -U "${PGUSER:-marketingspa}" -d "${PGDATABASE:-marketingspa}" \
    --no-owner --no-acl -Fc -Z 6 -f /tmp/wave3-pg.dump
  docker cp "$PG_CONTAINER:/tmp/wave3-pg.dump" "$DUMP_PATH"
  docker exec "$PG_CONTAINER" rm -f /tmp/wave3-pg.dump
  DUMPED=1
  echo "[backup] dumped via docker exec $PG_CONTAINER"
elif command -v pg_dump >/dev/null 2>&1; then
  pg_dump --no-owner --no-acl -Fc -Z 6 -f "$DUMP_PATH"
  DUMPED=1
  echo "[backup] dumped via host pg_dump ${PGHOST}:${PGPORT}"
else
  alert "pg_dump_not_found"
  exit 2
fi

if [ "$DUMPED" != "1" ] || [ ! -s "$DUMP_PATH" ]; then
  alert "empty_dump"
  exit 2
fi

SIZE="$(wc -c < "$DUMP_PATH" | tr -d ' ')"
if [ "$SIZE" -lt 1024 ]; then
  alert "dump_too_small_${SIZE}b"
  exit 2
fi

# Same-host second copy is local only — keep dump until offsite GET-verify succeeds.
cp -f "$DUMP_PATH" "$OFFSITE_DIR/$FILENAME"
echo "[backup] local copies size=${SIZE}b"

set +e
"$NODE_BIN" "$ROOT_DIR/scripts/lib/backup-offsite-upload.cjs" "$DUMP_PATH"
OFFSITE_CODE=$?
set -e
if [ "$OFFSITE_CODE" -ne 0 ]; then
  alert "offsite_upload_failed"
  write_status false "$FILENAME"
  exit 2
fi

# Retention only after verified upload. Never delete the dump we just verified.
find "$BACKUP_DIR" -name 'marketingspa_*.dump' -mtime +"$RETENTION_DAYS" ! -name "$FILENAME" -delete
find "$BACKUP_DIR" -name 'marketingspa_*.dump.enc' -mtime +"$RETENTION_DAYS" ! -name "${FILENAME}.enc" -delete
find "$OFFSITE_DIR" -name 'marketingspa_*.dump' -mtime +"$RETENTION_DAYS" ! -name "$FILENAME" -delete

trap - ERR
write_status true "$FILENAME"
echo "[backup] ok file=$FILENAME bytes=$SIZE retention=${RETENTION_DAYS}d offsite=ok"
