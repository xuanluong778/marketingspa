'use strict';
/**
 * Encrypt dump and copy off-host: S3/R2, SSH, or encrypted SMTP mailbox.
 * Local postgres-offsite/ is NOT treated as offsite. Fail if no remote channel succeeds.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { encryptFile, sha256File } = require('./backup-crypto.cjs');
const s3 = require('./s3-compat.cjs');
const { notify } = require('./send-ops-alert.cjs');

const ROOT = path.resolve(__dirname, '../..');
const STATUS =
  process.env.BACKUP_OFFSITE_STATUS ||
  '/var/www/marketingaut_usr/data/backups/postgres/last-offsite.json';

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout || 120000, env: { ...process.env, ...(opts.env || {}) } });
}

function ensureKey() {
  const keyPath =
    process.env.BACKUP_ENCRYPTION_KEY_FILE ||
    '/var/www/marketingaut_usr/data/backups/.backup-key';
  if (!fs.existsSync(keyPath)) {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, require('crypto').randomBytes(32).toString('hex'), { mode: 0o600 });
    try {
      fs.chmodSync(keyPath, 0o600);
    } catch {
      /* ignore */
    }
  }
  process.env.BACKUP_ENCRYPTION_KEY_FILE = keyPath;
  return keyPath;
}

function sshConfigured() {
  return Boolean(process.env.BACKUP_SSH_HOST && process.env.BACKUP_SSH_USER && process.env.BACKUP_SSH_PATH);
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function retentionDays() {
  const n = Number(process.env.BACKUP_RETENTION_DAYS || 21);
  if (!Number.isFinite(n)) return 21;
  return Math.min(30, Math.max(14, Math.floor(n)));
}

async function applyR2Retention(newestKey) {
  const retention = retentionDays();
  const keys = await s3.listPrefix('postgres/');
  const dumps = keys.filter((k) => k.endsWith('.dump.enc')).sort();
  const newest = newestKey || dumps[dumps.length - 1] || '';
  const protect = new Set([newest, newest ? `${newest}.sha256` : '']);
  const cutoff = Date.now() - retention * 86400000;
  const failed = [];
  let deleted = 0;
  let skippedNewest = 0;
  for (const k of keys) {
    if (protect.has(k)) {
      skippedNewest += 1;
      continue;
    }
    const m = /marketingspa_(\d{8})_/.exec(k);
    if (!m) continue;
    const t = Date.parse(`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}T00:00:00Z`);
    if (!Number.isFinite(t) || t >= cutoff) continue;
    try {
      await s3.deleteObject(k);
      deleted += 1;
    } catch {
      failed.push(k.replace(/^postgres\//, ''));
    }
  }
  if (failed.length) {
    await notify('HIGH', 'BACKUP_R2_RETENTION_FAIL', `delete_failed=${failed.length}`, { skipCooldown: false });
    throw new Error(`retention_delete_failed:${failed.length}`);
  }
  return { deleted, skippedNewest, retentionDays: retention, newest };
}

async function main() {
  const dump = process.argv[2];
  if (!dump || !fs.existsSync(dump)) {
    console.error('usage: backup-offsite-upload.cjs <dump-file>');
    process.exit(2);
  }
  ensureKey();
  const base = path.basename(dump);
  const enc = `${dump}.enc`;
  encryptFile(dump, enc);
  const encName = path.basename(enc);
  const checksum = sha256File(enc);
  fs.writeFileSync(`${enc}.sha256`, `${checksum}  ${encName}\n`, { mode: 0o600 });
  const channels = [];
  const errors = [];

  if (s3.isConfigured()) {
    try {
      const key = `postgres/${encName}`;
      const body = fs.readFileSync(enc);
      await s3.putObject(key, body);
      const got = await s3.getObject(key);
      const remoteHash = require('crypto').createHash('sha256').update(got.body).digest('hex');
      if (remoteHash !== checksum) throw new Error('r2_checksum_mismatch');
      if (!got.body.length) throw new Error('r2_empty_object');
      const anon = await s3.unsignedGet(key);
      if (anon.status === 200) throw new Error('r2_object_public');
      await s3.putObject(`postgres/${encName}.sha256`, Buffer.from(`${checksum}  ${encName}\n`));
      let retention = { skipped: true };
      try {
        retention = await applyR2Retention(key);
      } catch (re) {
        errors.push(`s3_retention:${re.message}`);
      }
      channels.push({
        type: 's3',
        key,
        checksum,
        verified: true,
        bytes: got.body.length,
        anonymousStatus: anon.status,
        retention,
      });
    } catch (e) {
      errors.push(`s3:${e.message}`);
    }
  }

  if (sshConfigured()) {
    const dest = `${process.env.BACKUP_SSH_USER}@${process.env.BACKUP_SSH_HOST}:${process.env.BACKUP_SSH_PATH.replace(/\/$/, '')}/${encName}`;
    const r = run('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new', enc, dest]);
    if (r.status === 0) channels.push({ type: 'ssh', host: process.env.BACKUP_SSH_HOST });
    else errors.push('ssh:upload_failed');
  }

  if (smtpConfigured()) {
    const r = run('python3', [path.join(__dirname, 'ops-mail.py'), 'send-backup'], {
      env: {
        BACKUP_ATTACH_PATH: enc,
        BACKUP_ATTACH_NAME: encName,
      },
      timeout: 90000,
    });
    if (r.status === 0) {
      channels.push({ type: 'smtp_imap' });
      run('python3', [path.join(__dirname, 'ops-mail.py'), 'purge'], { timeout: 90000 });
    } else {
      errors.push(`smtp:${(r.stderr || 'send_failed').split('\n')[0].slice(0, 80)}`);
    }
  }

  const r2Required = process.env.BACKUP_R2_REQUIRED === '1';
  if (r2Required && !channels.some((c) => c.type === 's3')) {
    console.error('[offsite] FAIL R2 required but not verified');
    process.exit(2);
  }
  const ok = channels.length > 0;
  const rec = {
    ok,
    timestamp: new Date().toISOString(),
    file: base,
    encrypted: encName,
    checksum,
    channels: channels.map((c) => c.type),
    remote: channels,
    errors,
    required: process.env.BACKUP_OFFSITE_REQUIRED !== '0',
  };
  fs.mkdirSync(path.dirname(STATUS), { recursive: true });
  fs.writeFileSync(STATUS, JSON.stringify(rec, null, 2));
  if (!ok) {
    console.error(`[offsite] FAIL no remote channel (${errors.join(';') || 'none_configured'})`);
    process.exit(2);
  }
  console.log(`[offsite] ok channels=${channels.map((c) => c.type).join(',')} file=${encName}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`[offsite] FAIL ${e.message}`);
  process.exit(2);
});
