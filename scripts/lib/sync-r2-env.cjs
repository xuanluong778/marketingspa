'use strict';
/**
 * Copy BACKUP_R2_* from source env to dest env without printing values.
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
    if (v == null || String(v).trim() === '') continue;
    if (cur[k] === v) continue;
    const re = new RegExp(`^${k}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, `${k}=${v}`);
    else {
      if (!text.endsWith('\n')) text += '\n';
      text += `${k}=${v}\n`;
    }
    changed.push(k);
  }
  if (changed.length) {
    fs.writeFileSync(file, text, { mode: 0o600 });
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* ignore */
    }
  }
  return changed;
}

const src = process.argv[2];
const dest = process.argv[3];
if (!src || !dest) {
  console.error('usage: sync-r2-env.cjs <src-env> <dest-env>');
  process.exit(2);
}
const map = parseEnv(fs.readFileSync(src, 'utf8'));
const incoming = {};
for (const k of KEYS) {
  if (map[k] && String(map[k]).trim()) incoming[k] = String(map[k]).trim();
}
const have = Object.keys(incoming);
const need = ['BACKUP_R2_BUCKET', 'BACKUP_R2_ENDPOINT', 'BACKUP_R2_ACCESS_KEY_ID', 'BACKUP_R2_SECRET_ACCESS_KEY'];
const missing = need.filter((k) => !incoming[k]);
if (missing.length) {
  console.error(JSON.stringify({ ok: false, missing }));
  process.exit(2);
}
const changed = upsert(dest, incoming);
console.log(JSON.stringify({ ok: true, copiedKeys: have, destChanged: changed }));
