'use strict';
/**
 * Set BACKUP_R2_REQUIRED=1 and BACKUP_R2_REGION=auto only. Never prints values.
 */
const fs = require('fs');

function upsertFlags(file) {
  if (!fs.existsSync(file)) throw new Error('missing_env_file');
  let text = fs.readFileSync(file, 'utf8');
  const flags = { BACKUP_R2_REQUIRED: '1', BACKUP_R2_REGION: 'auto' };
  const changed = [];
  for (const [k, v] of Object.entries(flags)) {
    const active = new RegExp(`^${k}=.*$`, 'm');
    const commented = new RegExp(`^#\\s*${k}=.*$`, 'm');
    if (active.test(text)) {
      const cur = text.match(active)[0];
      if (cur === `${k}=${v}`) continue;
      text = text.replace(active, `${k}=${v}`);
      changed.push(k);
    } else if (commented.test(text)) {
      text = text.replace(commented, `${k}=${v}`);
      changed.push(k);
    } else {
      if (!text.endsWith('\n')) text += '\n';
      text += `${k}=${v}\n`;
      changed.push(k);
    }
  }
  if (changed.length) {
    fs.writeFileSync(file, text, { mode: 0o600 });
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* ignore */
    }
  }
  return { file: file.replace(/^.*\//, ''), changed };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: enable-r2-required.cjs <env-file>...');
  process.exit(2);
}
const out = files.map(upsertFlags);
console.log(JSON.stringify({ ok: true, results: out }));
