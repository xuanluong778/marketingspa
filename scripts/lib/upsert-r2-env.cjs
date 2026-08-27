'use strict';
/**
 * Upsert BACKUP_R2_* into env files from the current process env.
 * Never prints secret values. Usage:
 *   node scripts/with-root-env.cjs node scripts/lib/upsert-r2-env.cjs [env-file...]
 */
const fs = require('fs');

const KEYS = [
  'BACKUP_R2_BUCKET',
  'BACKUP_R2_ENDPOINT',
  'BACKUP_R2_ACCESS_KEY_ID',
  'BACKUP_R2_SECRET_ACCESS_KEY',
  'BACKUP_R2_REGION',
  'BACKUP_R2_REQUIRED',
];

function parseEnv(text) {
  const map = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    map[t.slice(0, i).trim()] = t.slice(i + 1);
  }
  return map;
}

function upsert(file, incoming) {
  if (!fs.existsSync(file)) throw new Error('missing_env_file');
  let text = fs.readFileSync(file, 'utf8');
  const cur = parseEnv(text);
  const changed = [];
  for (const [k, v] of Object.entries(incoming)) {
    if (!v) continue;
    if (cur[k] === v) continue;
    const re = new RegExp(`^${k}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, `${k}=${v}`);
    else {
      if (!text.endsWith('\n')) text += '\n';
      text += `${k}=${v}\n`;
    }
    changed.push(k);
  }
  if (changed.length) fs.writeFileSync(file, text, { mode: 0o600 });
  return changed;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: upsert-r2-env.cjs <env-file>...');
  process.exit(2);
}

const incoming = {};
for (const k of KEYS) {
  if (process.env[k] && String(process.env[k]).trim()) incoming[k] = String(process.env[k]).trim();
}
if (!incoming.BACKUP_R2_BUCKET || !incoming.BACKUP_R2_ENDPOINT || !incoming.BACKUP_R2_ACCESS_KEY_ID || !incoming.BACKUP_R2_SECRET_ACCESS_KEY) {
  console.error('missing_r2_env');
  process.exit(2);
}
incoming.BACKUP_R2_REQUIRED = incoming.BACKUP_R2_REQUIRED || '1';
incoming.BACKUP_R2_REGION = incoming.BACKUP_R2_REGION || 'auto';

for (const file of files) {
  const changed = upsert(file, incoming);
  console.log(JSON.stringify({ file: file.replace(/^.*\//, ''), changed }));
}
