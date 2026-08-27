'use strict';
/**
 * Authenticated business load smoke — localhost only, never prints tokens.
 * Usage: node scripts/with-root-env.cjs node scripts/hardening-load-smoke.cjs [concurrency] [durationSec]
 */
const http = require('http');
const os = require('os');
const { execSync } = require('child_process');

const concurrency = Number(process.argv[2] || 100);
const durationSec = Number(process.argv[3] || 10);
const API = (process.env.LOAD_API || 'http://127.0.0.1:4000').replace(/\/$/, '');

const PATHS = [
  '/api/v1/auth/me',
  '/api/v1/leads/pipeline-counts',
  '/api/v1/leads?page=1&pageSize=5',
  '/api/v1/customers?page=1&pageSize=5',
  '/api/v1/finance/dashboard',
  '/api/v1/sales/orders?page=1&pageSize=5',
  '/api/v1/sales/products?page=1&pageSize=5',
  '/api/v1/automation/messaging-campaigns?page=1&pageSize=5',
  '/api/v1/ai-ads-manager/connections',
  '/api/v1/sales/reports/summary?preset=today',
  '/api/v1/leads/alerts/stale',
];

http.globalAgent.maxSockets = Math.max(concurrency + 50, 256);
http.globalAgent.keepAlive = true;

function request(path, token) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const u = new URL(API + path);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 15000,
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          const ok = res.statusCode >= 200 && res.statusCode < 400;
          resolve({ ok, ms, code: res.statusCode, path });
        });
      },
    );
    req.on('error', () => resolve({ ok: false, ms: 0, code: 0, path }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, ms: 0, code: 0, path });
    });
    req.end();
  });
}

function login() {
  const email = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  if (!email || !password) throw new Error('META_REVIEWER_EMAIL/PASSWORD missing');
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, password });
    const u = new URL(API + '/api/v1/auth/login');
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 15000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            const token = json.accessToken || json.access_token || json.tokens?.accessToken;
            if (!token) reject(new Error(`login_failed status=${res.statusCode}`));
            else resolve(token);
          } catch {
            reject(new Error('login_parse_failed'));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

function sampleInfra() {
  const out = { cpu: os.loadavg()[0], ramUsedPct: 0, pg: null, redis: null, queues: null };
  try {
    const total = os.totalmem();
    const free = os.freemem();
    out.ramUsedPct = Number((((total - free) / total) * 100).toFixed(1));
  } catch {
    /* ignore */
  }
  try {
    out.pg = execSync(
      `docker exec marketingspa-postgres-dev psql -U marketingspa -d marketingspa -t -A -c "select count(*) from pg_stat_activity;"`,
      { encoding: 'utf8', timeout: 4000 },
    ).trim();
  } catch {
    out.pg = 'n/a';
  }
  try {
    const info = execSync(`docker exec marketingspa-redis-dev redis-cli INFO memory`, {
      encoding: 'utf8',
      timeout: 4000,
    });
    const used = /used_memory_human:(\S+)/.exec(info);
    const max = /maxmemory_human:(\S+)/.exec(info);
    out.redis = { used: used && used[1], max: max && max[1] };
  } catch {
    out.redis = 'n/a';
  }
  try {
    const wait = execSync(
      `docker exec marketingspa-redis-dev redis-cli EVAL "local s=0; for i,k in ipairs(redis.call('keys','bull:*:wait')) do s=s+redis.call('llen',k) end; return s" 0`,
      { encoding: 'utf8', timeout: 4000 },
    ).trim();
    out.queues = { waitKeysApprox: wait };
  } catch {
    out.queues = 'n/a';
  }
  return out;
}

async function main() {
  const token = await login();
  const usable = [];
  for (const p of PATHS) {
    const r = await request(p, token);
    if (r.code >= 200 && r.code < 400) usable.push(p);
  }
  if (!usable.length) throw new Error('no_usable_business_paths');
  const before = sampleInfra();
  const end = Date.now() + durationSec * 1000;
  const latencies = [];
  const byPath = {};
  let ok = 0;
  let fail = 0;
  let i = 0;

  async function worker() {
    while (Date.now() < end) {
      const path = usable[i++ % usable.length];
      const r = await request(path, token);
      byPath[path] = byPath[path] || { ok: 0, fail: 0 };
      const success = r.code >= 200 && r.code < 400;
      if (success) {
        ok += 1;
        byPath[path].ok += 1;
        latencies.push(r.ms);
      } else {
        fail += 1;
        byPath[path].fail += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  latencies.sort((a, b) => a - b);
  const total = ok + fail;
  const errRate = total ? fail / total : 1;
  const after = sampleInfra();
  const summary = {
    concurrency,
    durationSec,
    total,
    ok,
    fail,
    errorRate: Number(errRate.toFixed(4)),
    p50: Number(percentile(latencies, 50).toFixed(1)),
    p95: Number(percentile(latencies, 95).toFixed(1)),
    p99: Number(percentile(latencies, 99).toFixed(1)),
    byPath,
    probed: usable,
    before,
    after,
  };
  console.log(JSON.stringify(summary));
  const p95Limit = concurrency <= 100 ? 800 : concurrency <= 500 ? 2000 : 4000;
  const errLimit = concurrency <= 500 ? 0.01 : 0.02;
  if (errRate > errLimit || summary.p95 > p95Limit) process.exitCode = 1;
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
