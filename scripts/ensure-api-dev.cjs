/**
 * Đảm bảo Nest API lắng nghe :4000 trước khi chạy web.
 * Nếu chưa có → spawn `pnpm --filter @marketingspa/api dev` ở nền.
 *
 * Dùng: node scripts/ensure-api-dev.cjs
 */
const { spawn } = require('child_process');
const { resolve } = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

const ROOT = resolve(__dirname, '..');
const API_PORT = Number(process.env.API_PORT || 4000);
const HEALTH_PATH = '/api/v1/health';
const WAIT_MS = 120_000;
const LOG_DIR = resolve(ROOT, 'tmp');
const LOG_FILE = resolve(LOG_DIR, 'api-dev.log');

function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolvePort) => {
    const socket = net.connect({ port, host });
    const done = (ok) => {
      socket.destroy();
      resolvePort(ok);
    };
    socket.setTimeout(1200);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

function healthOk() {
  return new Promise((resolveHealth) => {
    const req = http.get(
      { hostname: '127.0.0.1', port: API_PORT, path: HEALTH_PATH, timeout: 2500 },
      (res) => {
        res.resume();
        resolveHealth(res.statusCode !== undefined && res.statusCode < 500);
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolveHealth(false);
    });
    req.on('error', () => resolveHealth(false));
  });
}

async function waitReady() {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    if ((await portOpen(API_PORT)) && (await healthOk())) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

function startApi() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFd = fs.openSync(LOG_FILE, 'a');
  fs.writeSync(
    logFd,
    `\n==== API start ${new Date().toISOString()} ====\n`,
  );

  const child = spawn('pnpm', ['--filter', '@marketingspa/api', 'dev'], {
    cwd: ROOT,
    shell: true,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  });
  child.unref();
  console.log(
    `[ensure-api-dev] Đã khởi động API nền (pid ${child.pid}). Log: tmp/api-dev.log`,
  );
}

async function main() {
  if ((await portOpen(API_PORT)) && (await healthOk())) {
    console.log(`[ensure-api-dev] API đã sẵn sàng (:${API_PORT})`);
    return;
  }

  if (await portOpen(API_PORT)) {
    console.log(
      `[ensure-api-dev] Cổng :${API_PORT} đang mở — đợi health ${HEALTH_PATH}...`,
    );
  } else {
    console.log(`[ensure-api-dev] API chưa chạy — đang start...`);
    startApi();
  }

  const ok = await waitReady();
  if (!ok) {
    console.error(
      `[ensure-api-dev] API chưa sẵn sàng sau ${WAIT_MS / 1000}s. Xem ${LOG_FILE}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`[ensure-api-dev] API sẵn sàng (:${API_PORT})`);
}

main().catch((err) => {
  console.error('[ensure-api-dev]', err);
  process.exitCode = 1;
});
