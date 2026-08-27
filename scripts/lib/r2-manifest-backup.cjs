'use strict';
const fs = require('fs');
const s3 = require('./s3-compat.cjs');

async function main() {
  const dest = fs.readFileSync('/tmp/full-backup-dest', 'utf8').trim();
  let keys = [];
  try {
    keys = await s3.listPrefix('postgres/');
  } catch (e) {
    fs.writeFileSync(
      `${dest}/media/r2-manifest.json`,
      JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 80) }),
    );
    process.exit(0);
  }
  let last = {};
  try {
    last = JSON.parse(fs.readFileSync('/var/www/marketingaut_usr/data/backups/postgres/last-offsite.json', 'utf8'));
  } catch {
    last = {};
  }
  const s3ch = (last.remote || []).find((c) => c.type === 's3') || {};
  const rec = {
    ok: true,
    bucket: 'marketingautoaz-pg-backup',
    objectCount: keys.length,
    dumpEncCount: keys.filter((k) => k.endsWith('.dump.enc')).length,
    keys,
    lastOffsite: last.encrypted
      ? {
          file: last.file,
          encrypted: last.encrypted,
          checksum: last.checksum,
          channels: last.channels,
          bytes: s3ch.bytes,
          key: s3ch.key,
        }
      : null,
  };
  fs.writeFileSync(`${dest}/media/r2-manifest.json`, JSON.stringify(rec, null, 2));
  console.log(JSON.stringify({ ok: true, objectCount: rec.objectCount, dumpEncCount: rec.dumpEncCount, lastKey: rec.lastOffsite && rec.lastOffsite.key }));
}

main().catch((e) => {
  console.error(String(e.message || e).slice(0, 80));
  process.exit(2);
});
