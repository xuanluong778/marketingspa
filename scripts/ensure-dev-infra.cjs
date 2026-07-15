/**
 * Đảm bảo Postgres (+ Redis nếu được) sẵn sàng trước khi chạy API/dev.
 * Nếu DATABASE_URL trỏ remote (vd. Supabase) thì bỏ qua Postgres Docker local.
 * Dùng: node scripts/ensure-dev-infra.cjs [--strict]
 */
const { spawnSync } = require('child_process');
const { resolve } = require('path');
const fs = require('fs');
const net = require('net');

const ROOT = resolve(__dirname, '..');
const COMPOSE_FILE = resolve(ROOT, 'docker-compose.dev.yml');
const POSTGRES_PORT = Number(process.env.DEV_POSTGRES_PORT || 5433);
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const WAIT_MS = 90_000;
const STRICT = process.argv.includes('--strict');

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  try {
    const text = fs.readFileSync(resolve(ROOT, '.env'), 'utf8');
    const m = text.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

function usesRemoteDatabase(url) {
  if (!url) return false;
  return !/(@|\/\/)(localhost|127\.0\.0\.1)(:|\/)/i.test(url);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    ...opts,
  });
}

function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolvePort) => {
    const socket = net.connect({ port, host });
    const done = (ok) => {
      socket.destroy();
      resolvePort(ok);
    };
    socket.setTimeout(1500);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

async function waitForPort(port, label) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    if (await portOpen(port)) {
      console.log(`[ensure-dev-infra] ${label} sẵn sàng (:${port})`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

function dockerReady() {
  const r = run('docker', ['info'], { stdio: 'pipe' });
  return r.status === 0;
}

function fail(message) {
  console.error(`[ensure-dev-infra] ${message}`);
  if (STRICT) process.exitCode = 1;
}

async function main() {
  const databaseUrl = readDatabaseUrl();
  const remoteDb = usesRemoteDatabase(databaseUrl);

  if (remoteDb) {
    console.log(
      '[ensure-dev-infra] DATABASE_URL remote (Supabase/cloud) — bỏ qua Postgres Docker local.',
    );
  } else if (!(await portOpen(POSTGRES_PORT))) {
    if (!dockerReady()) {
      fail(
        'Docker chưa chạy và Postgres (:5433) chưa sẵn sàng. Mở Docker Desktop rồi chạy `pnpm dev:infra`. Đăng nhập sẽ lỗi 503 nếu thiếu DB.',
      );
      return;
    }

    console.log('[ensure-dev-infra] Đang bật postgres/redis (docker compose)...');
    const up = run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d'], {
      stdio: 'inherit',
    });
    if (up.status !== 0) {
      console.warn(
        '[ensure-dev-infra] docker compose up có lỗi (thường do cổng Redis 6379 đã bị chiếm). Tiếp tục kiểm tra Postgres...',
      );
    }

    const pgOk = await waitForPort(POSTGRES_PORT, 'Postgres');
    if (!pgOk) {
      fail(
        `Postgres chưa lắng nghe :${POSTGRES_PORT}. Đăng nhập sẽ thất bại đến khi DB lên.`,
      );
      return;
    }
  } else {
    console.log(`[ensure-dev-infra] Postgres sẵn sàng (:${POSTGRES_PORT})`);
  }

  if (!(await portOpen(REDIS_PORT))) {
    if (!remoteDb && dockerReady()) {
      console.log('[ensure-dev-infra] Đang bật redis (docker compose)...');
      run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', 'redis'], {
        stdio: 'inherit',
      });
      await waitForPort(REDIS_PORT, 'Redis');
    }
    if (!(await portOpen(REDIS_PORT))) {
      console.warn(
        `[ensure-dev-infra] Redis chưa có trên :${REDIS_PORT}. Auth vẫn chạy (memory fallback); queue/worker cần Redis.`,
      );
    }
  } else {
    console.log(`[ensure-dev-infra] Redis sẵn sàng (:${REDIS_PORT})`);
  }
}

main().catch((err) => {
  console.error('[ensure-dev-infra]', err);
  if (STRICT) process.exitCode = 1;
});
