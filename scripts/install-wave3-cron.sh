#!/usr/bin/env bash
# Install host crontab for backup + ops monitor (WAVE3). Idempotent.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="/var/www/marketingaut_usr/data/.nvm/versions/node/v22.22.3/bin/node"
CRON_FILE="/etc/cron.d/marketingautoaz-wave3"

cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${NODE%/*}
PM2_HOME=/var/www/marketingaut_usr/data/.pm2

# Daily pg_dump at 02:05 (host fallback; worker also enqueues 02:00)
5 2 * * * root cd $ROOT && $NODE scripts/with-root-env.cjs bash scripts/backup-postgres.sh >> /var/www/marketingaut_usr/data/backups/postgres/cron.log 2>&1

# Ops monitor every 5 minutes
*/5 * * * * root cd $ROOT && $NODE scripts/with-root-env.cjs node scripts/ops-monitor.cjs >> /var/www/marketingaut_usr/data/backups/ops/cron.log 2>&1

# Weekly completed/failed queue prune (Sunday 03:30)
30 3 * * 0 root cd $ROOT && $NODE scripts/with-root-env.cjs node scripts/bullmq-cleanup.cjs >> /var/www/marketingaut_usr/data/backups/ops/cleanup.log 2>&1
EOF

chmod 644 "$CRON_FILE"
mkdir -p /var/www/marketingaut_usr/data/backups/postgres /var/www/marketingaut_usr/data/backups/postgres-offsite /var/www/marketingaut_usr/data/backups/ops
chown -R marketingaut_usr:marketingaut_usr /var/www/marketingaut_usr/data/backups/postgres /var/www/marketingaut_usr/data/backups/postgres-offsite /var/www/marketingaut_usr/data/backups/ops || true
echo "[cron] installed $CRON_FILE"
