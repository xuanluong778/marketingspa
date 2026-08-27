'use strict';
/**
 * Per-endpoint authenticated profile — localhost only, never prints tokens.
 * Usage: node scripts/with-root-env.cjs node scripts/perf-endpoint-profile.cjs [concurrency] [durationSec]
 */
const http = require('http');

const concurrency = Number(process.argv[2] || 40);
const durationSec = Number(process.argv[3] || 5);
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
  '/api/v1/ai-ads-manager/dashboard',
  '/api/v1/sales/reports/summary?preset=today',
  '/api/v1/leads/alerts/stale',
];

http.globalAgent.maxSockets = Math.max(concurrency + 20, 128);
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
        timeout: 20000,
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          resolve({ code: res.statusCode, ms });
        });
      },
    );
    req.on('error', () => resolve({ code: 0, ms: 0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ code: 0, ms: 0 });
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
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            const token = json.accessToken || json.tokens?.accessToken;
            if (!token) reject(new Error(`login_failed ${res.statusCode}`));
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

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function profilePath(token, path) {
  const end = Date.now() + durationSec * 1000;
  const lat = [];
  let ok = 0;
  let fail = 0;
  let lastCode = 0;
  async function worker() {
    while (Date.now() < end) {
      const r = await request(path, token);
      lastCode = r.code;
      if (r.code >= 200 && r.code < 400) {
        ok += 1;
        lat.push(r.ms);
      } else fail += 1;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  lat.sort((a, b) => a - b);
  const total = ok + fail;
  return {
    path,
    code: lastCode,
    n: total,
    err: total ? Number((fail / total).toFixed(4)) : 1,
    p50: Number((pct(lat, 50) || 0).toFixed(1)),
    p95: Number((pct(lat, 95) || 0).toFixed(1)),
    p99: Number((pct(lat, 99) || 0).toFixed(1)),
  };
}

async function main() {
  const token = await login();
  const rows = [];
  for (const p of PATHS) {
    rows.push(await profilePath(token, p));
  }
  console.log(JSON.stringify({ concurrency, durationSec, rows }, null, 2));
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
