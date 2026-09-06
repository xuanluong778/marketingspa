#!/usr/bin/env node
/**
 * Production guard — Socket.IO requires API fork on 127.0.0.1:4000 + 4001
 * (matches nginx marketingautoaz_api_socket hash upstream).
 *
 *   node scripts/ensure-api-socket-io-health.cjs
 *   pnpm test:socket-io-health
 */
'use strict';

const { execSync } = require('child_process');
const net = require('net');

const SITE = (process.env.APP_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const API_PORTS = [4000, 4001];

function fail(label, detail) {
  console.error(`${label} = FAIL${detail ? ` — ${detail}` : ''}`);
  process.exit(1);
}

function pass(label, detail) {
  console.log(`${label} = PASS${detail ? ` — ${detail}` : ''}`);
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(2000);
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function pm2ApiModes() {
  try {
    const raw = execSync('pm2 jlist', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const list = JSON.parse(raw);
    return list
      .filter((p) => p.name === 'api')
      .map((p) => ({
        id: p.pm_id,
        mode: p.pm2_env?.exec_mode || 'unknown',
        port: p.pm2_env?.PORT,
      }));
  } catch (e) {
    return null;
  }
}

async function socketPollingPostOk() {
  const pollUrl = `${SITE}/socket.io/?EIO=4&transport=polling`;
  const pollRes = await fetch(pollUrl);
  if (!pollRes.ok) return { ok: false, detail: `poll status=${pollRes.status}` };
  const body = await pollRes.text();
  const jsonPart = body.replace(/^\d+/, '');
  let sid;
  try {
    sid = JSON.parse(jsonPart).sid;
  } catch {
    return { ok: false, detail: 'invalid poll payload' };
  }
  if (!sid) return { ok: false, detail: 'no sid' };
  const postRes = await fetch(`${SITE}/socket.io/?EIO=4&transport=polling&sid=${encodeURIComponent(sid)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: '40/events,',
  });
  return postRes.ok
    ? { ok: true, detail: `sid=${sid} post=${postRes.status}` }
    : { ok: false, detail: `post status=${postRes.status} sid=${sid}` };
}

async function main() {
  for (const port of API_PORTS) {
    const open = await portOpen(port);
    if (!open) fail(`API_PORT_${port}`, 'not listening — nginx socket.io will 400');
    pass(`API_PORT_${port}`, 'listening');
  }

  const modes = pm2ApiModes();
  if (!modes || modes.length === 0) {
    fail('PM2_API', 'no api process in pm2 jlist');
  }
  if (modes.length !== 2) {
    fail('PM2_API_INSTANCES', `expected 2 fork instances, got ${modes.length}`);
  }
  for (const m of modes) {
    if (m.mode !== 'fork_mode') {
      fail('PM2_API_EXEC_MODE', `instance ${m.id} mode=${m.mode} — MUST be fork_mode (not cluster)`);
    }
  }
  const ports = modes.map((m) => Number(m.port)).sort();
  if (ports.join(',') !== '4000,4001') {
    fail('PM2_API_PORTS', `ports=${ports.join(',')} — expected 4000,4001 via increment_var PORT`);
  }
  pass('PM2_API_FORK_4000_4001', `instances=${modes.length} ports=4000,4001`);

  const sio = await socketPollingPostOk();
  if (!sio.ok) fail('SOCKET_IO_POLLING', sio.detail);
  pass('SOCKET_IO_POLLING', sio.detail);

  console.log('\nSOCKET_IO_HEALTH = PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
