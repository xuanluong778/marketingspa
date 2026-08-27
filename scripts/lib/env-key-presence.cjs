'use strict';
/** Names-only presence probe for env files. Never prints values. */
const fs = require('fs');
const files = process.argv.slice(2);
const want = [
  'BACKUP_R2_BUCKET',
  'BACKUP_R2_ENDPOINT',
  'BACKUP_R2_ACCESS_KEY_ID',
  'BACKUP_R2_SECRET_ACCESS_KEY',
  'BACKUP_R2_REQUIRED',
  'BACKUP_RETENTION_DAYS',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
];
for (const file of files) {
  const out = { file: file.replace(/^.*\//, ''), exists: fs.existsSync(file), present: {} };
  if (out.exists) {
    const text = fs.readFileSync(file, 'utf8');
    const map = {};
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      map[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    for (const k of want) out.present[k] = Boolean(map[k]);
  }
  console.log(JSON.stringify(out));
}
