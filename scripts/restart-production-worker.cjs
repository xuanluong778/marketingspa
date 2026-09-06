#!/usr/bin/env node
/**
 * Safe production worker restart — starts worker + worker-heavy from release ecosystem.
 *
 *   node scripts/restart-production-worker.cjs
 *   pnpm ops:restart-worker
 */
'use strict';

const { existsSync } = require('fs');
const { resolve } = require('path');
const { spawnSync } = require('child_process');

const RELEASE =
  process.env.MARKETINGAUTOAZ_RELEASE_DIR ||
  '/var/www/marketingaut_usr/data/releases/autopilot-homepage-20260824_192247';

const ecosystem = resolve(RELEASE, 'ecosystem.config.cjs');

if (!existsSync(ecosystem)) {
  console.error(`Missing ecosystem: ${ecosystem}`);
  process.exit(1);
}

console.log(`Using ecosystem: ${ecosystem}`);
console.log('Starting worker + worker-heavy...\n');

for (const name of ['worker', 'worker-heavy']) {
  spawnSync('pm2', ['delete', name], { stdio: 'inherit', encoding: 'utf8' });
}

const start = spawnSync(
  'pm2',
  ['start', ecosystem, '--only', 'worker,worker-heavy', '--update-env'],
  { cwd: RELEASE, stdio: 'inherit', encoding: 'utf8' },
);
if (start.status !== 0) process.exit(start.status || 1);

spawnSync('pm2', ['save'], { stdio: 'inherit' });

console.log('\nWorker restart complete.');
const hb = spawnSync(
  'node',
  ['-e', "const Redis=require('ioredis');(async()=>{const r=new Redis(process.env.REDIS_URL||'redis://127.0.0.1:6379');const v=await r.get('marketingspa:worker:heartbeat');console.log('heartbeat',v?new Date(Number(v)).toISOString():'missing');await r.quit();})();"],
  { cwd: RELEASE, stdio: 'inherit', env: process.env },
);
process.exit(hb.status || 0);
