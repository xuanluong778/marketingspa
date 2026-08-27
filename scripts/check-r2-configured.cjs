'use strict';
/** Report R2/backup env presence only. Never prints secret values. */
const keys = [
  'BACKUP_R2_BUCKET',
  'BACKUP_R2_ENDPOINT',
  'BACKUP_R2_ACCESS_KEY_ID',
  'BACKUP_R2_SECRET_ACCESS_KEY',
  'BACKUP_R2_REQUIRED',
  'BACKUP_R2_REGION',
  'BACKUP_RETENTION_DAYS',
  'BACKUP_OFFSITE_REQUIRED',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CF_API_TOKEN',
  'CF_ACCOUNT_ID',
  'WRANGLER_ACCOUNT_ID',
];
const present = {};
for (const k of keys) {
  const v = process.env[k];
  present[k] = Boolean(v && String(v).trim());
}
const s3 = require('./lib/s3-compat.cjs');
const cfg = s3.cfgFromEnv();
const out = {
  configured: s3.isConfigured(),
  present,
  bucketSet: Boolean(cfg.bucket),
  endpointHost: cfg.endpoint ? (() => {
    try { return new URL(cfg.endpoint).host.replace(/^[a-f0-9]{32}\./i, '<account>.'); } catch { return 'invalid_url'; }
  })() : '',
  accessKeyLen: cfg.accessKey ? cfg.accessKey.length : 0,
  secretKeyLen: cfg.secretKey ? cfg.secretKey.length : 0,
  region: cfg.region,
};
process.stdout.write(JSON.stringify(out) + '\n');
