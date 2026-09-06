#!/usr/bin/env node
/** Restart marketing API (4000) + worker with root .env loaded. Minimize WS 502 window. */
const { spawnSync, execSync } = require('child_process');
const { resolve } = require('path');
const net = require('net');

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

function waitPort(port, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      execSync(
        `node -e "const n=require('net');const s=n.connect(${port},'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))"`,
        { stdio: 'ignore' },
      );
      return true;
    } catch {
      spawnSync('sleep', ['0.4']);
    }
  }
  return false;
}

function start(label, scriptPath, cwd) {
  const inner = `cd ${JSON.stringify(cwd)} && ${nodeBin} ${JSON.stringify(scriptPath)}`;
  const wrapped = `cd ${JSON.stringify(root)} && ${nodeBin} scripts/with-root-env.cjs ${JSON.stringify(inner)}`;
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
spawnSync('sleep', ['1']);

start('api', apiMain, resolve(root, 'apps/api'));
start('worker', workerMain, resolve(root, 'apps/worker'));

const ok = waitPort(4000, 25000);
console.log(ok ? 'restarted api + worker (port 4000 ready)' : 'restarted api + worker (WARN: port 4000 not ready)');
