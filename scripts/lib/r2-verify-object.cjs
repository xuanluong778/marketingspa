'use strict';
const fs = require('fs');
const s3 = require('./s3-compat.cjs');

async function main() {
  const rec = JSON.parse(
    fs.readFileSync('/var/www/marketingaut_usr/data/backups/postgres/last-offsite.json', 'utf8'),
  );
  const key = (rec.remote || []).find((c) => c.type === 's3').key;
  const got = await s3.getObject(key);
  const anon = await s3.unsignedGet(key);
  const out = {
    key,
    bytes: got.body.length,
    unsignedStatus: anon.status,
    privateOk: anon.status !== 200 && anon.status !== 0,
    sizeOk: got.body.length > 0,
  };
  console.log(JSON.stringify(out));
  process.exit(out.privateOk && out.sizeOk ? 0 : 2);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, code: String(e.message || e).slice(0, 80) }));
  process.exit(2);
});
