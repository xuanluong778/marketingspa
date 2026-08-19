#!/usr/bin/env node
/** Restart marketing API (4000) + worker with root .env loaded. */
const { spawnSync, execSync } = require('child_process');
const { resolve } = require('path');

const root = resolve(__dirname, '..');
const apiMain = resolve(root, 'apps/api/dist/main.js');
const workerMain = resolve(root, 'apps/worker/dist/index.js');
const nodeBin = process.env.NODE_BIN || 'node';
const runUser = process.env.MARKETING_RUN_USER || 'marketingaut_usr';

function pidsFor(pattern) {
  try {
    return execSync(`pgrep -f "${pattern}"`, { encoding: 'utf8' })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function stop(pattern) {
  for (const pid of pidsFor(pattern)) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      /* ignore */
    }
  }
}

function start(label, scriptPath, cwd) {
  const cmd = `cd ${cwd} && ${nodeBin} ${scriptPath}`;
  const wrapped = `cd ${root} && ${nodeBin} scripts/with-root-env.cjs ${cmd}`;
  const shellCmd =
    process.getuid && process.getuid() === 0
      ? `su -s /bin/bash ${runUser} -c ${JSON.stringify(wrapped)}`
      : wrapped;
  spawnSync('bash', ['-lc', `${shellCmd} >> ${root}/logs/${label}.out.log 2>> ${root}/logs/${label}.err.log &`], {
    stdio: 'inherit',
  });
}

stop('marketingautoaz.com/apps/api/dist/main.js');
stop('marketingautoaz.com/apps/worker/dist/index.js');
// brief grace period
spawnSync('sleep', ['2']);

start('api', apiMain, resolve(root, 'apps/api'));
start('worker', workerMain, resolve(root, 'apps/worker'));

console.log('restarted api + worker');
