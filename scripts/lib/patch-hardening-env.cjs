'use strict';
/**
 * Add missing hardening env keys without printing values.
 */
const fs = require('fs');

function parseEnv(text) {
  const map = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    map[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return map;
}

function upsertMissing(file, keys) {
  if (!fs.existsSync(file)) {
    console.error('missing_env_file');
    return { added: [] };
  }
  const orig = fs.readFileSync(file, 'utf8');
  const cur = parseEnv(orig);
  let text = orig;
  const added = [];
  for (const [k, v] of Object.entries(keys)) {
    if (!v) continue;
    if (cur[k] != null && cur[k] !== '') continue;
    if (!text.endsWith('\n')) text += '\n';
    text += `${k}=${v}\n`;
    added.push(k);
  }
  if (added.length) fs.writeFileSync(file, text, { mode: 0o600 });
  return { added };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: patch-hardening-env.cjs <env-file>...');
  process.exit(2);
}

for (const file of files) {
  const cur = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {};
  const alertTo = cur.ALERT_EMAIL_TO || cur.PLATFORM_SUPER_ADMIN_EMAIL || cur.SMTP_USER || '';
  const r = upsertMissing(file, {
    ALERT_EMAIL_TO: alertTo,
    BACKUP_ENCRYPTION_KEY_FILE: '/var/www/marketingaut_usr/data/backups/.backup-key',
    BACKUP_OFFSITE_REQUIRED: '1',
    BACKUP_IMAP_HOST: 'imap.gmail.com',
    SOCKET_REDIS_ADAPTER: '1',
  });
  console.log(JSON.stringify({ file: file.replace(/^.*\//, ''), added: r.added }));
}
