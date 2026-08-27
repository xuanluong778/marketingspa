'use strict';
/**
 * R2 connectivity smoke: PUT/GET/checksum/unsigned/delete.
 * Never logs keys, bodies, or endpoints with credentials.
 */
const crypto = require('crypto');
const s3 = require('./lib/s3-compat.cjs');

async function main() {
  if (!s3.isConfigured()) {
    console.error(JSON.stringify({ ok: false, step: 'configured' }));
    process.exit(2);
  }
  const cfg = s3.cfgFromEnv();
  let endpointHost = '';
  try {
    endpointHost = new URL(cfg.endpoint).host.replace(/^[a-f0-9]{32}\./i, '<account>.');
  } catch {
    endpointHost = 'invalid';
  }
  const key = `postgres/_r2_smoke_${Date.now()}.bin`;
  const payload = crypto.randomBytes(4096);
  const want = crypto.createHash('sha256').update(payload).digest('hex');
  await s3.putObject(key, payload);
  const got = await s3.getObject(key);
  const checksum = crypto.createHash('sha256').update(got.body).digest('hex');
  const checksumOk = checksum === want && got.body.length === payload.length;
  const anon = await s3.unsignedGet(key);
  const privateOk = anon.status !== 200 && anon.status !== 0;
  await s3.deleteObject(key);
  let deleted = false;
  try {
    await s3.getObject(key);
  } catch (e) {
    deleted = /s3_http_404/.test(e.message);
  }
  const out = {
    ok: checksumOk && privateOk && deleted,
    bucket: cfg.bucket,
    endpointHost,
    key,
    bytes: got.body.length,
    checksumOk,
    anonymousStatus: anon.status,
    privateOk,
    deleted,
  };
  console.log(JSON.stringify(out));
  process.exit(out.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, step: 'exception', code: String(e.message || e).slice(0, 80) }));
  process.exit(2);
});
