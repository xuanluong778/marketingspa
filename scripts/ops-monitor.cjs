'use strict';
/**
 * WAVE3 ops monitor — localhost only. Writes status JSON + alerts on thresholds.
 * Never prints secrets.
 */
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STATUS_DIR = process.env.OPS_STATUS_DIR || '/var/www/marketingaut_usr/data/backups/ops';
const STATUS_FILE = path.join(STATUS_DIR, 'status.json');
const ALERT_LOG = process.env.OPS_ALERT_LOG || path.join(STATUS_DIR, 'alerts.log');
const BACKUP_STATUS =
  process.env.BACKUP_STATUS_FILE ||
  '/var/www/marketingaut_usr/data/backups/postgres/last-status.json';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const PREFIX = process.env.QUEUE_PREFIX || 'marketingspa';
const API_HEALTH = process.env.OPS_HEALTH_URL || 'http://127.0.0.1:4000/api/v1/health';
const API_READY = process.env.OPS_READY_URL || 'http://127.0.0.1:4000/api/v1/ready';
const PM2_HOME = process.env.PM2_HOME || '/var/www/marketingaut_usr/data/.pm2';
const WARN = Number(process.env.REDIS_ALERT_WARN || 70);
const HIGH = Number(process.env.REDIS_ALERT_HIGH || 85);
const CRIT = Number(process.env.REDIS_ALERT_CRIT || 95);

function redact(s) {
  return String(s || '')
    .replace(/postgres(?:ql)?:\/\/[^@\s'"]+@/gi, 'postgresql://***@')
    .replace(/redis:\/\/[^@\s'"]+@/gi, 'redis://***@')
    .replace(/(password|secret|token|authorization)=[^\s&]+/gi, '$1=***');
}

function httpGet(url) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = http.get(url, { timeout: 4000 }, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, body, ms: Date.now() - t0 });
      });
    });
    req.on('error', (err) => resolve({ status: 0, body: redact(err.message), ms: Date.now() - t0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, body: 'timeout', ms: Date.now() - t0 });
    });
  });
}

function loadIoredis() {
  const tryPaths = [path.join(ROOT, 'apps/worker'), path.join(ROOT, 'apps/api'), ROOT];
  const id = require.resolve('ioredis', { paths: tryPaths });
  return require(id);
}

function loadBullmq() {
  const tryPaths = [path.join(ROOT, 'apps/worker'), path.join(ROOT, 'apps/api'), ROOT];
  return require(require.resolve('bullmq', { paths: tryPaths }));
}

const { notify } = require(path.join(ROOT, 'scripts/lib/send-ops-alert.cjs'));

function diskUsage(p) {
  const r = spawnSync('df', ['-P', p], { encoding: 'utf8' });
  const line = (r.stdout || '').trim().split('\n')[1] || '';
  const parts = line.split(/\s+/);
  const usedPct = Number(String(parts[4] || '').replace('%', ''));
  return { usedPct: Number.isFinite(usedPct) ? usedPct : null, target: p };
}

function pm2Snapshot() {
  const r = spawnSync('pm2', ['jlist'], {
    encoding: 'utf8',
    env: { ...process.env, PM2_HOME },
  });
  if (r.status !== 0) return { ok: false, apps: [] };
  try {
    const list = JSON.parse(r.stdout || '[]');
    return {
      ok: true,
      apps: list.map((a) => ({
        name: a.name,
        status: a.pm2_env?.status,
        restarts: a.pm2_env?.restart_time,
        unstable: a.pm2_env?.unstable_restarts,
        memory: a.monit?.memory,
        cpu: a.monit?.cpu,
      })),
    };
  } catch {
    return { ok: false, apps: [] };
  }
}

async function pgConnections(redisIgnored) {
  void redisIgnored;
  const r = spawnSync(
    'docker',
    [
      'exec',
      'marketingspa-postgres-dev',
      'psql',
      '-U',
      'marketingspa',
      '-d',
      'marketingspa',
      '-tAc',
      "SELECT count(*) FROM pg_stat_activity WHERE datname='marketingspa'",
    ],
    { encoding: 'utf8' },
  );
  if (r.status === 0) {
    return { ok: true, count: Number((r.stdout || '').trim()) };
  }
  return { ok: false, count: null, error: 'docker_or_psql_unavailable' };
}

async function main() {
  fs.mkdirSync(STATUS_DIR, { recursive: true });
  const alerts = [];
  const health = await httpGet(API_HEALTH);
  const ready = await httpGet(API_READY);
  if (health.status !== 200) {
    alerts.push(['CRITICAL', 'API_HEALTH', `status=${health.status}`]);
  }
  if (ready.status !== 200) {
    alerts.push(['CRITICAL', 'API_READY', `status=${ready.status}`]);
  }

  let redisMem = { usedBytes: null, maxBytes: null, pct: null };
  let http5xx = 0;
  const queues = [];
  let Redis;
  try {
    Redis = loadIoredis();
  } catch (e) {
    alerts.push(['HIGH', 'REDIS_CLIENT', redact(e.message)]);
  }
  if (Redis) {
    const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
    try {
      const info = await redis.info('memory');
      const used = Number((info.match(/used_memory:(\d+)/) || [])[1] || 0);
      const max = Number((info.match(/maxmemory:(\d+)/) || [])[1] || 0);
      const pct = max > 0 ? Math.round((used / max) * 1000) / 10 : null;
      redisMem = { usedBytes: used, maxBytes: max, pct };
      if (pct != null && pct >= CRIT) alerts.push(['CRITICAL', 'REDIS_MEM', `${pct}%`]);
      else if (pct != null && pct >= HIGH) alerts.push(['HIGH', 'REDIS_MEM', `${pct}%`]);
      else if (pct != null && pct >= WARN) alerts.push(['WARN', 'REDIS_MEM', `${pct}%`]);

      const hour = new Date().toISOString().slice(0, 13).replace(/[-:T]/g, '');
      http5xx = Number(await redis.get(`marketingspa:metrics:http5xx:${hour}`)) || 0;
      if (http5xx >= 20) alerts.push(['HIGH', 'API_5XX', `hour=${http5xx}`]);
      else if (http5xx >= 5) alerts.push(['WARN', 'API_5XX', `hour=${http5xx}`]);

      const { Queue } = loadBullmq();
      const { QUEUE_NAMES } = require(path.join(ROOT, 'packages/shared/dist/constants.js'));
      for (const name of Object.values(QUEUE_NAMES)) {
        const q = new Queue(name, { connection: { url: REDIS_URL, maxRetriesPerRequest: null }, prefix: PREFIX });
        const counts = await q.getJobCounts('wait', 'waiting', 'active', 'delayed', 'failed', 'completed', 'paused');
        const stalledFn = typeof q.getStalledCount === 'function' ? q.getStalledCount.bind(q) : null;
        const stalled = stalledFn ? await stalledFn().catch(() => 0) : 0;
        await q.close();
        const waiting = (counts.waiting || 0) + (counts.wait || 0);
        queues.push({
          name,
          waiting,
          active: counts.active || 0,
          delayed: counts.delayed || 0,
          failed: counts.failed || 0,
          completed: counts.completed || 0,
          stalled,
        });
        if (waiting > 500) alerts.push(['HIGH', 'QUEUE_BACKLOG', `${name} waiting=${waiting}`]);
        if ((counts.failed || 0) > 200) alerts.push(['WARN', 'QUEUE_FAILED', `${name} failed=${counts.failed}`]);
        if (stalled > 5) alerts.push(['HIGH', 'QUEUE_STALLED', `${name} stalled=${stalled}`]);
      }
    } finally {
      await redis.quit().catch(() => undefined);
    }
  }

  const pg = await pgConnections();
  if (pg.ok && pg.count != null && pg.count > 80) {
    alerts.push(['HIGH', 'PG_CONNECTIONS', String(pg.count)]);
  }

  const disk = diskUsage('/var/www/marketingaut_usr');
  if (disk.usedPct != null && disk.usedPct >= 90) alerts.push(['CRITICAL', 'DISK', `${disk.usedPct}%`]);
  else if (disk.usedPct != null && disk.usedPct >= 80) alerts.push(['HIGH', 'DISK', `${disk.usedPct}%`]);

  const memPct = Math.round((1 - os.freemem() / os.totalmem()) * 1000) / 10;
  if (memPct >= 90) alerts.push(['CRITICAL', 'RAM', `${memPct}%`]);
  else if (memPct >= 80) alerts.push(['HIGH', 'RAM', `${memPct}%`]);

  const load = os.loadavg()[0];
  const cpus = os.cpus().length || 1;
  if (load / cpus >= 2) alerts.push(['HIGH', 'CPU_LOAD', `${load.toFixed(2)}/${cpus}`]);

  let prevStatus = {};
  try {
    prevStatus = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    prevStatus = {};
  }
  const prevRestarts = Object.fromEntries((prevStatus.pm2?.apps || []).map((a) => [a.name, a.restarts || 0]));

  const pm2 = pm2Snapshot();
  for (const app of pm2.apps) {
    if (app.status && app.status !== 'online') {
      alerts.push(['CRITICAL', 'PM2_STATUS', `${app.name}=${app.status}`]);
    }
    const prev = prevRestarts[app.name];
    if (prev != null && (app.restarts || 0) > prev) {
      alerts.push(['HIGH', 'PM2_RESTART', `${app.name} restarts ${prev}->${app.restarts}`]);
    }
  }

  let backup = { ok: null, ageHours: null, offsite: null };
  try {
    const raw = JSON.parse(fs.readFileSync(BACKUP_STATUS, 'utf8'));
    const ageHours = (Date.now() - Date.parse(raw.timestamp)) / 3600000;
    backup = { ok: !!raw.ok, ageHours: Math.round(ageHours * 10) / 10, file: raw.file || null, offsite: null };
    if (!raw.ok) alerts.push(['CRITICAL', 'BACKUP_STATUS', 'last dump marked fail']);
    else if (ageHours > 36) alerts.push(['HIGH', 'BACKUP_STALE', `${backup.ageHours}h`]);
  } catch {
    backup = { ok: false, ageHours: null, offsite: null };
    alerts.push(['WARN', 'BACKUP_STATUS', 'missing last-status.json']);
  }
  try {
    const off = JSON.parse(
      fs.readFileSync('/var/www/marketingaut_usr/data/backups/postgres/last-offsite.json', 'utf8'),
    );
    backup.offsite = { ok: !!off.ok, channels: off.channels || [] };
    if (!off.ok) alerts.push(['CRITICAL', 'BACKUP_OFFSITE', 'remote copy failed']);
  } catch {
    backup.offsite = { ok: false };
  }

  for (const [level, code, detail] of alerts) {
    await notify(level, code, detail);
  }

  const status = {
    timestamp: new Date().toISOString(),
    health: { status: health.status, ms: health.ms },
    ready: { status: ready.status, ms: ready.ms },
    http5xxHour: http5xx,
    redis: redisMem,
    postgres: pg,
    disk,
    ramPct: memPct,
    load1: load,
    pm2,
    backup,
    queues,
    alerts: alerts.map(([level, code, detail]) => ({ level, code, detail })),
  };
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  console.log(
    JSON.stringify({
      ok: alerts.length === 0,
      ready: ready.status,
      redisPct: redisMem.pct,
      pg: pg.count,
      alerts: alerts.length,
    }),
  );
  if (alerts.some((a) => a[0] === 'CRITICAL')) process.exitCode = 2;
}

main().catch((err) => {
  console.error(redact(err.stack || err.message));
  process.exit(1);
});
