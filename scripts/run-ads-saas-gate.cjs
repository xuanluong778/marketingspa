#!/usr/bin/env node
/**
 * Ads SaaS gate: run all mandatory ads tests. Exit 1 on any failure.
 * Do NOT deploy production if this script fails.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const tests = [
  'test:ads-saas-phase-a',
  'test:ads-unification',
  'test:ads-sync-queue',
  'test:ads-meta-harden',
  'test:ads-google-oauth',
  'test:ads-normalized-metrics',
  'test:ads-mcp-gateway',
  'test:ads-action-request',
  'test:ads-saas-audit',
];

let failed = 0;
for (const t of tests) {
  console.log(`\n════════ ${t} ════════`);
  const r = spawnSync('pnpm', [t], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });
  if (r.status !== 0) {
    failed += 1;
    console.error(`FAILED: ${t}`);
  }
}

if (failed > 0) {
  console.error(`\n❌ Ads SaaS gate FAILED (${failed}/${tests.length}). DO NOT DEPLOY PRODUCTION.`);
  process.exit(1);
}
console.log(`\n✅ All ${tests.length} Ads SaaS test suites passed.`);
