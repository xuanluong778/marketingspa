'use strict';
/**
 * Safe BullMQ history cleanup — completed/failed only.
 * Never removes wait / active / delayed / paused jobs or Postgres data.
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const PREFIX = process.env.QUEUE_PREFIX || 'marketingspa';
const KEEP_COMPLETED = Number(process.env.BULLMQ_KEEP_COMPLETED || 1000);
const KEEP_FAILED = Number(process.env.BULLMQ_KEEP_FAILED || 5000);
const COMPLETE_AGE_MS = Number(process.env.BULLMQ_COMPLETE_AGE_SEC || 7 * 24 * 3600) * 1000;
const FAIL_AGE_MS = Number(process.env.BULLMQ_FAIL_AGE_SEC || 14 * 24 * 3600) * 1000;

function load(name) {
  return require(require.resolve(name, { paths: [path.join(ROOT, 'apps/worker'), ROOT] }));
}

async function main() {
  const { Queue } = load('bullmq');
  const { QUEUE_NAMES } = require(path.join(ROOT, 'packages/shared/dist/constants.js'));
  const dryRun = process.argv.includes('--dry-run');
  const out = [];

  for (const name of Object.values(QUEUE_NAMES)) {
    const q = new Queue(name, {
      connection: { url: REDIS_URL, maxRetriesPerRequest: null },
      prefix: PREFIX,
    });
    const before = await q.getJobCounts('wait', 'waiting', 'active', 'delayed', 'failed', 'completed');
    let cleanedCompleted = 0;
    let cleanedFailed = 0;
    if (!dryRun) {
      const agedC = await q.clean(COMPLETE_AGE_MS, 5000, 'completed');
      const agedF = await q.clean(FAIL_AGE_MS, 5000, 'failed');
      cleanedCompleted += agedC.length;
      cleanedFailed += agedF.length;
      const mid = await q.getJobCounts('completed', 'failed');
      if ((mid.completed || 0) > KEEP_COMPLETED) {
        const extra = await q.clean(0, mid.completed - KEEP_COMPLETED, 'completed');
        cleanedCompleted += extra.length;
      }
      if ((mid.failed || 0) > KEEP_FAILED) {
        const extra = await q.clean(0, mid.failed - KEEP_FAILED, 'failed');
        cleanedFailed += extra.length;
      }
    }
    const after = await q.getJobCounts('wait', 'waiting', 'active', 'delayed', 'failed', 'completed');
    out.push({
      name,
      dryRun,
      cleanedCompleted,
      cleanedFailed,
      before: { completed: before.completed, failed: before.failed, delayed: before.delayed, active: before.active },
      after: { completed: after.completed, failed: after.failed, delayed: after.delayed, active: after.active },
    });
    await q.close();
  }

  console.log(JSON.stringify({ ok: true, queues: out }, null, 2));
}

main().catch((err) => {
  console.error(String(err.message || err));
  process.exit(1);
});
