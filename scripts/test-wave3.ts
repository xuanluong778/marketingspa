/**
 * WAVE3 gates — health/ready, redact, backup restore evidence helpers.
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-wave3.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { BULLMQ_JOB_RETENTION, REDIS_MEMORY_ALERT_PCT } from '../packages/shared/src/constants';
import { redactLogText } from '../apps/api/src/common/utils/redact-log.util';

const results: Array<{ name: string; pass: boolean; detail: string }> = [];
function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

async function httpJson(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function testRedact() {
  const out = redactLogText(
    'postgresql://marketingspa:super-secret@127.0.0.1:5434/db password=hunter2 Bearer abc.def.ghi',
  );
  assert.ok(!out.includes('super-secret'));
  assert.ok(!out.includes('hunter2'));
  assert.ok(!out.includes('abc.def.ghi'));
  assert.ok(out.includes('postgresql://***@'));
  record('REDACT_LOGS', true, 'password/token/url stripped');
}

function testRetentionConstants() {
  assert.equal(BULLMQ_JOB_RETENTION.complete.count, 1000);
  assert.equal(BULLMQ_JOB_RETENTION.complete.age, 7 * 24 * 3600);
  assert.equal(BULLMQ_JOB_RETENTION.fail.count, 5000);
  assert.equal(REDIS_MEMORY_ALERT_PCT.warn, 70);
  assert.equal(REDIS_MEMORY_ALERT_PCT.high, 85);
  assert.equal(REDIS_MEMORY_ALERT_PCT.critical, 95);
  record('QUEUE_RETENTION_CONST', true, 'complete 1000/7d fail 5000/14d redis 70/85/95');
}

async function testHealthReady() {
  const live = await httpJson('http://127.0.0.1:4000/api/v1/health');
  const liveRoot = await httpJson('http://127.0.0.1:4000/health');
  const ready = await httpJson('http://127.0.0.1:4000/api/v1/ready');
  const readyRoot = await httpJson('http://127.0.0.1:4000/ready');
  const liveOk =
    live.status === 200 &&
    typeof live.json === 'object' &&
    live.json !== null &&
    (live.json as { status?: string }).status === 'ok' &&
    !('services' in (live.json as object));
  record('HEALTH_LIVENESS', liveOk, `api/v1/health=${live.status} root=${liveRoot.status}`);
  const readyBody = ready.json as { status?: string; checks?: { postgres?: boolean; redis?: boolean } };
  const readyOk =
    ready.status === 200 &&
    readyRoot.status === 200 &&
    readyBody.status === 'ready' &&
    readyBody.checks?.postgres === true &&
    readyBody.checks?.redis === true;
  record('READY_DEPS', readyOk, `ready=${ready.status} postgres=${readyBody.checks?.postgres} redis=${readyBody.checks?.redis}`);
}

function testBackupStatus() {
  const p = '/var/www/marketingaut_usr/data/backups/postgres/last-status.json';
  if (!existsSync(p)) {
    record('BACKUP_STATUS_FILE', false, 'missing last-status.json (run backup first)');
    return;
  }
  const st = JSON.parse(readFileSync(p, 'utf8')) as { ok?: boolean; file?: string };
  record('BACKUP_STATUS_FILE', !!st.ok && !!st.file, st.file || 'no file');
}

async function main() {
  try {
    testRedact();
    testRetentionConstants();
    await testHealthReady();
    testBackupStatus();
  } catch (e) {
    record('FATAL', false, e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    console.log('\n--- WAVE3 unit summary ---');
    for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`);
    if (results.some((r) => !r.pass)) process.exitCode = 1;
  }
}

main();
