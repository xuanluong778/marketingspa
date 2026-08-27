#!/usr/bin/env bash
# Restore drill into an isolated Postgres container. NEVER targets production DB.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/www/marketingaut_usr/data/backups/postgres}"
CONTAINER="${RESTORE_DRILL_CONTAINER:-marketingspa-postgres-restore-drill}"
PROD_DB="${POSTGRES_DB:-marketingspa}"
PROD_CONTAINER="${BACKUP_PG_CONTAINER:-marketingspa-postgres-dev}"
IMAGE="${RESTORE_DRILL_IMAGE:-postgres:16-alpine}"

FROM_OFFSITE=0
FROM_R2=0
DUMP="${1:-}"
if [ "$DUMP" = "--from-offsite" ]; then
  FROM_OFFSITE=1
  DUMP=""
fi
if [ "$DUMP" = "--from-r2" ]; then
  FROM_R2=1
  DUMP=""
fi
if [ "$FROM_R2" = "1" ]; then
  NODE_BIN="${NODE_BIN:-/var/www/marketingaut_usr/data/.nvm/versions/node/v22.22.3/bin/node}"
  DUMP="$("$NODE_BIN" "$ROOT_DIR/scripts/lib/backup-offsite-fetch.cjs" --from-r2)"
  echo "[restore-drill] fetched R2 dump=$(basename "$DUMP")"
elif [ "$FROM_OFFSITE" = "1" ]; then
  NODE_BIN="${NODE_BIN:-/var/www/marketingaut_usr/data/.nvm/versions/node/v22.22.3/bin/node}"
  DUMP="$("$NODE_BIN" "$ROOT_DIR/scripts/lib/backup-offsite-fetch.cjs")"
  echo "[restore-drill] fetched offsite dump=$(basename "$DUMP")"
fi
if [ -z "$DUMP" ]; then
  DUMP="$(ls -1t "$BACKUP_DIR"/marketingspa_*.dump 2>/dev/null | head -1 || true)"
fi
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "[restore-drill] FAIL no dump file" >&2
  exit 2
fi

if echo "$DUMP" | grep -qiE 'password|secret|token'; then
  echo "[restore-drill] FAIL suspicious path" >&2
  exit 2
fi

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ "$CONTAINER" = "$PROD_CONTAINER" ]; then
  echo "[restore-drill] FAIL refuse to use production container name" >&2
  exit 2
fi

echo "[restore-drill] dump=$(basename "$DUMP") isolated=$CONTAINER"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" --network none \
  -e POSTGRES_USER=restore \
  -e POSTGRES_PASSWORD=restore_drill_only \
  -e POSTGRES_DB=restore_drill \
  "$IMAGE" >/dev/null

for i in $(seq 1 40); do
  if docker exec "$CONTAINER" pg_isready -U restore >/dev/null 2>&1 \
    && docker exec "$CONTAINER" psql -U restore -d restore_drill -c 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec "$CONTAINER" psql -U restore -d restore_drill -c 'SELECT 1' >/dev/null

docker cp "$DUMP" "$CONTAINER:/tmp/restore.dump"
set +e
docker exec "$CONTAINER" pg_restore -U restore -d restore_drill --no-owner --no-acl /tmp/restore.dump
RESTORE_CODE=$?
set -e
# pg_restore returns 1 for warnings (e.g. extra comments); 0/1 OK, >=2 fail
if [ "$RESTORE_CODE" -ge 2 ]; then
  echo "[restore-drill] FAIL pg_restore code=$RESTORE_CODE" >&2
  exit 2
fi

TARGET_DB="$(docker exec "$CONTAINER" psql -U restore -d restore_drill -tAc "SELECT current_database();")"
if [ "$TARGET_DB" = "$PROD_DB" ]; then
  echo "[restore-drill] FAIL restored into production database name" >&2
  exit 2
fi

ORGS="$(docker exec "$CONTAINER" psql -U restore -d restore_drill -tAc "SELECT count(*) FROM organizations;")"
TABLES="$(docker exec "$CONTAINER" psql -U restore -d restore_drill -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
USERS="$(docker exec "$CONTAINER" psql -U restore -d restore_drill -tAc "SELECT count(*) FROM users;" 2>/dev/null || echo 0)"
CUSTOMERS="$(docker exec "$CONTAINER" psql -U restore -d restore_drill -tAc "SELECT count(*) FROM customers;" 2>/dev/null || echo 0)"
SALES_PRODUCTS="$(docker exec "$CONTAINER" psql -U restore -d restore_drill -tAc "SELECT count(*) FROM sales_products;" 2>/dev/null || echo 0)"
SALES_ORDERS="$(docker exec "$CONTAINER" psql -U restore -d restore_drill -tAc "SELECT count(*) FROM sales_orders;" 2>/dev/null || echo 0)"
CREDIT_WALLETS="$(docker exec "$CONTAINER" psql -U restore -d restore_drill -tAc "SELECT count(*) FROM credit_wallets;" 2>/dev/null || echo 0)"
PAYMENT_ORDERS="$(docker exec "$CONTAINER" psql -U restore -d restore_drill -tAc "SELECT count(*) FROM payment_orders;" 2>/dev/null || echo 0)"
MIGRATIONS="$(docker exec "$CONTAINER" psql -U restore -d restore_drill -tAc "SELECT count(*) FROM _prisma_migrations;" 2>/dev/null || echo 0)"

if [ "${ORGS:-0}" -lt 1 ] || [ "${TABLES:-0}" -lt 10 ] || [ "${USERS:-0}" -lt 1 ]; then
  echo "[restore-drill] FAIL verification orgs=$ORGS tables=$TABLES users=$USERS" >&2
  exit 2
fi

PROD_ORGS=""
PROD_TABLES=""
if docker exec "$PROD_CONTAINER" psql -U marketingspa -d marketingspa -c 'SELECT 1' >/dev/null 2>&1; then
  PROD_ORGS="$(docker exec "$PROD_CONTAINER" psql -U marketingspa -d marketingspa -tAc "SELECT count(*) FROM organizations;" 2>/dev/null || true)"
  PROD_TABLES="$(docker exec "$PROD_CONTAINER" psql -U marketingspa -d marketingspa -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || true)"
  if [ -n "${PROD_ORGS}" ] && [ "${ORGS}" -ne "${PROD_ORGS}" ]; then
    echo "[restore-drill] FAIL org_count_mismatch restore=$ORGS prod=$PROD_ORGS" >&2
    exit 2
  fi
  if [ -n "${PROD_TABLES}" ] && [ "${TABLES}" -ne "${PROD_TABLES}" ]; then
    echo "[restore-drill] FAIL table_count_mismatch restore=$TABLES prod=$PROD_TABLES" >&2
    exit 2
  fi
fi

echo "{\"ok\":true,\"orgs\":${ORGS},\"tables\":${TABLES},\"users\":${USERS},\"customers\":${CUSTOMERS},\"salesProducts\":${SALES_PRODUCTS},\"salesOrders\":${SALES_ORDERS},\"creditWallets\":${CREDIT_WALLETS},\"paymentOrders\":${PAYMENT_ORDERS},\"prismaMigrations\":${MIGRATIONS},\"prodOrgs\":${PROD_ORGS:-null},\"prodTables\":${PROD_TABLES:-null},\"dump\":\"$(basename "$DUMP")\",\"targetDb\":\"restore_drill\",\"fromR2\":${FROM_R2}}"
