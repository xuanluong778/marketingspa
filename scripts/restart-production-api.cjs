#!/usr/bin/env node
/**
 * Safe production API restart — NEVER use bare `pm2 restart api` (can leave cluster on :4000 only).
 *
 * Requires fork + increment_var PORT → 4000/4001 for nginx /socket.io/ sticky upstream.
 *
 *   node scripts/restart-production-api.cjs
 *   pnpm ops:restart-api
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
  console.error('Set MARKETINGAUTOAZ_RELEASE_DIR to the active release path.');
  process.exit(1);
}

console.log(`Using ecosystem: ${ecosystem}`);
console.log('Restarting API as fork instances on ports 4000 + 4001...\n');

const del = spawnSync('pm2', ['delete', 'api'], { stdio: 'inherit', encoding: 'utf8' });
if (del.status !== 0 && !String(del.stderr || '').includes('not found')) {
  // pm2 delete returns non-zero when process missing — continue
}

const start = spawnSync(
  'pm2',
  ['start', ecosystem, '--only', 'api', '--update-env'],
  { cwd: RELEASE, stdio: 'inherit', encoding: 'utf8' },
);
if (start.status !== 0) process.exit(start.status || 1);

spawnSync('pm2', ['save'], { stdio: 'inherit' });

console.log('\nRunning socket.io health check...');
const health = spawnSync('node', [resolve(__dirname, 'ensure-api-socket-io-health.cjs')], {
  stdio: 'inherit',
  encoding: 'utf8',
});
process.exit(health.status || 0);
