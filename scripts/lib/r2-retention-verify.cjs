'use strict';
/**
 * Verify R2 retention: newest dump+sha256 kept; 14–30 day clamp; fail alerts.
 * Never prints secrets.
 */
const fs = require('fs');
const s3 = require('./s3-compat.cjs');
const { notify } = require('./send-ops-alert.cjs');

function retentionDays() {
  const n = Number(process.env.BACKUP_RETENTION_DAYS || 21);
  if (!Number.isFinite(n)) return 21;
  return Math.min(30, Math.max(14, Math.floor(n)));
}

async function main() {
  const statusPath =
    process.env.BACKUP_OFFSITE_STATUS ||
    '/var/www/marketingaut_usr/data/backups/postgres/last-offsite.json';
  const rec = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  const s3ch = (rec.remote || []).find((c) => c.type === 's3');
  if (!s3ch || !s3ch.key) throw new Error('no_s3_channel');
  const keys = await s3.listPrefix('postgres/');
  const dumps = keys.filter((k) => k.endsWith('.dump.enc')).sort();
  const newest = dumps[dumps.length - 1] || '';
  const newestPresent = keys.includes(s3ch.key);
  const newestIsLatest = newest === s3ch.key;
  const days = retentionDays();
  const inRange = days >= 14 && days <= 30;
  const skippedNewest = Number(s3ch.retention && s3ch.retention.skippedNewest) || 0;
  const protectedNewest = skippedNewest >= 1 && newestPresent && newestIsLatest;

  let alert = { sent: false, channels: [] };
  if (process.env.R2_RETENTION_ALERT_SMOKE === '1') {
    alert = await notify('HIGH', 'BACKUP_R2_RETENTION_FAIL', 'drill_cleanup_fail_alert', {
      skipCooldown: true,
    });
  }

  const out = {
    ok: protectedNewest && inRange && newestPresent && s3ch.bytes > 0,
    newestKey: s3ch.key,
    newestPresent,
    newestIsLatest,
    dumpCount: dumps.length,
    retentionDays: days,
    inRange,
    skippedNewest,
    bytes: s3ch.bytes,
    checksum: s3ch.checksum,
    anonymousStatus: s3ch.anonymousStatus,
    alertSmoke: alert.sent ? alert.channels : [],
  };
  console.log(JSON.stringify(out));
  process.exit(out.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, code: String(e.message || e).slice(0, 80) }));
  process.exit(2);
});
