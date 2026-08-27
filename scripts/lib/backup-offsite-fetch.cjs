'use strict';
/**
 * Fetch latest encrypted offsite backup and decrypt to a local temp dump.
 * Prints only the decrypted path on stdout.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { decryptFile, sha256File } = require('./backup-crypto.cjs');
const s3 = require('./s3-compat.cjs');

const STATUS =
  process.env.BACKUP_OFFSITE_STATUS ||
  '/var/www/marketingaut_usr/data/backups/postgres/last-offsite.json';

async function fromS3(encName) {
  const key = `postgres/${encName}`;
  const res = await s3.getObject(key);
  const tmpEnc = path.join(os.tmpdir(), encName);
  fs.writeFileSync(tmpEnc, res.body);
  const expected = (() => {
    try {
      const rec = JSON.parse(fs.readFileSync(STATUS, 'utf8'));
      return rec.checksum || '';
    } catch {
      return '';
    }
  })();
  if (expected) {
    const got = sha256File(tmpEnc);
    if (got !== expected) throw new Error('r2_download_checksum_mismatch');
  }
  return tmpEnc;
}

function fromImap(encName) {
  const tmpEnc = path.join(os.tmpdir(), encName || `offsite-${Date.now()}.dump.enc`);
  const r = spawnSync('python3', [path.join(__dirname, 'ops-mail.py'), 'fetch-backup'], {
    encoding: 'utf8',
    timeout: 90000,
    env: {
      ...process.env,
      BACKUP_FETCH_DEST: tmpEnc,
      BACKUP_FETCH_NAME: encName || '',
    },
  });
  if (r.status !== 0) {
    throw new Error((r.stderr || 'imap_fetch_failed').split('\n')[0].slice(0, 120));
  }
  return tmpEnc;
}

function fromSsh(encName) {
  const dest = path.join(os.tmpdir(), encName);
  const remote = `${process.env.BACKUP_SSH_USER}@${process.env.BACKUP_SSH_HOST}:${process.env.BACKUP_SSH_PATH.replace(/\/$/, '')}/${encName}`;
  const r = spawnSync(
    'scp',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', remote, dest],
    { encoding: 'utf8', timeout: 120000 },
  );
  if (r.status !== 0) throw new Error('ssh_fetch_failed');
  return dest;
}

async function main() {
  let rec = {};
  try {
    rec = JSON.parse(fs.readFileSync(STATUS, 'utf8'));
  } catch {
    rec = {};
  }
  const forceR2 = process.argv.includes('--from-r2');
  let encName = rec.encrypted || '';
  const positional = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (positional) encName = positional;
  if (!encName && !forceR2) {
    console.error('no offsite encrypted filename');
    process.exit(2);
  }
  const channels = rec.channels || [];
  let encPath = '';
  const errors = [];
  if ((forceR2 || channels.includes('s3')) && s3.isConfigured()) {
    if (!encName) {
      const keys = await s3.listPrefix('postgres/');
      const dumps = keys.filter((k) => k.endsWith('.dump.enc')).sort();
      const latest = dumps[dumps.length - 1];
      if (!latest) throw new Error('r2_empty');
      encName = path.basename(latest);
    }
    try {
      encPath = await fromS3(encName);
    } catch (e) {
      errors.push(`s3:${e.message}`);
    }
  }
  if (!encPath && !forceR2 && channels.includes('ssh')) {
    try {
      encPath = fromSsh(encName);
    } catch (e) {
      errors.push(`ssh:${e.message}`);
    }
  }
  if (!encPath && !forceR2 && (channels.includes('smtp_imap') || process.env.SMTP_USER)) {
    try {
      encPath = fromImap(encName);
    } catch (e) {
      errors.push(`imap:${e.message}`);
    }
  }
  if (!encPath) {
    console.error(`offsite_fetch_failed ${errors.join(';') || 'no_channel'}`);
    process.exit(2);
  }
  const dumpPath = path.join(os.tmpdir(), encName.replace(/\.enc$/, ''));
  decryptFile(encPath, dumpPath);
  try {
    fs.unlinkSync(encPath);
  } catch {
    /* ignore */
  }
  process.stdout.write(dumpPath);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
