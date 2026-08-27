'use strict';
/**
 * Strip accidental <> wrappers from BACKUP_R2_ENDPOINT in env files.
 * Never prints the endpoint value.
 */
const fs = require('fs');

function sanitize(v) {
  let e = String(v || '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  e = e.replace(/^(https?:\/\/)<([^>]+)>(\.)/i, '$1$2$3');
  return e.replace(/\/$/, '');
}

function upsertEndpoint(file) {
  if (!fs.existsSync(file)) throw new Error('missing_env_file');
  let text = fs.readFileSync(file, 'utf8');
  const re = /^(BACKUP_R2_ENDPOINT)=(.*)$/m;
  const m = text.match(re);
  if (!m) return { file: file.replace(/^.*\//, ''), changed: false, present: false };
  const next = sanitize(m[2]);
  const changed = next !== m[2].trim();
  if (changed) {
    text = text.replace(re, `BACKUP_R2_ENDPOINT=${next}`);
    fs.writeFileSync(file, text, { mode: 0o600 });
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* ignore */
    }
  }
  let parseOk = false;
  let hostMasked = '';
  try {
    const u = new URL(next);
    parseOk = true;
    hostMasked = u.host.replace(/^[a-f0-9]{32}\./i, '<account>.');
  } catch {
    parseOk = false;
  }
  return { file: file.replace(/^.*\//, ''), changed, present: true, parseOk, hostMasked };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: fix-r2-endpoint.cjs <env-file>...');
  process.exit(2);
}
const out = files.map(upsertEndpoint);
console.log(JSON.stringify({ ok: out.every((r) => r.parseOk), results: out }));
process.exit(out.every((r) => r.parseOk) ? 0 : 2);
