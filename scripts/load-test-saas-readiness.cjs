/**
 * SaaS readiness load probe — targets live API without mutating tenant data.
 *
 * Env:
 *   API_URL (default http://127.0.0.1:4000)
 *   META_REVIEWER_EMAIL / META_REVIEWER_PASSWORD for authenticated reads
 *   LOAD_VUS (default 100)
 *   LOAD_DURATION_SEC (default 900 = 15m)
 *
 *   node scripts/with-root-env.cjs node scripts/load-test-saas-readiness.cjs
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

function loadEnv() {
  const env = { ...process.env };
  const p = path.join(__dirname, '../.env');
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    if (env[k] == null || env[k] === '') env[k] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const API = (env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const VUS = Math.max(1, Number(env.LOAD_VUS || 100));
const DURATION_SEC = Math.max(30, Number(env.LOAD_DURATION_SEC || 900));
const OUT =
  env.LOAD_OUT ||
  path.join(__dirname, '../docs/saas-production-readiness/load-test-metrics.json');

const latencies = [];
let ok = 0;
let fail = 0;
let started = 0;

async function login() {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: env.META_REVIEWER_EMAIL,
      password: env.META_REVIEWER_PASSWORD,
    }),
  });
  const j = await res.json();
  const token = j.accessToken || j.access_token || j.tokens?.accessToken;
  if (!token) throw new Error(`login failed status=${res.status}`);
  return token;
}

async function oneRequest(token) {
  const paths = [
    '/api/v1/health',
    '/api/v1/auth/me',
    '/api/v1/content-marketing/industries',
    '/api/v1/auto-post/status',
    '/api/v1/billing/subscription',
  ];
  const p = paths[Math.floor(Math.random() * paths.length)];
  const t0 = process.hrtime.bigint();
  try {
    const res = await fetch(`${API}${p}`, {
      headers: p === '/api/v1/health' ? {} : { Authorization: `Bearer ${token}` },
    });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    latencies.push(ms);
    if (res.status >= 200 && res.status < 400) ok += 1;
    else fail += 1;
  } catch {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    latencies.push(ms);
    fail += 1;
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[idx] * 100) / 100;
}

async function vuLoop(token, stopAt) {
  while (Date.now() < stopAt) {
    started += 1;
    await oneRequest(token);
  }
}

async function main() {
  const token = await login();
  const stopAt = Date.now() + DURATION_SEC * 1000;
  const memStart = process.memoryUsage();
  const cpuStart = process.cpuUsage();
  const loadStart = os.loadavg();

  console.log(
    JSON.stringify({
      phase: 'start',
      api: API,
      vus: VUS,
      durationSec: DURATION_SEC,
      loadavg: loadStart,
    }),
  );

  await Promise.all(Array.from({ length: VUS }, () => vuLoop(token, stopAt)));

  const sorted = [...latencies].sort((a, b) => a - b);
  const total = ok + fail;
  const errorRate = total ? fail / total : 1;
  const memEnd = process.memoryUsage();
  const cpuEnd = process.cpuUsage(cpuStart);

  const report = {
    finishedAt: new Date().toISOString(),
    api: API,
    vus: VUS,
    durationSec: DURATION_SEC,
    requests: { total, ok, fail, errorRate: Number(errorRate.toFixed(6)) },
    latencyMs: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted.length ? Math.round(sorted[sorted.length - 1] * 100) / 100 : null,
    },
    host: {
      loadavgStart: loadStart,
      loadavgEnd: os.loadavg(),
      freememMb: Math.round(os.freemem() / 1024 / 1024),
      totalmemMb: Math.round(os.totalmem() / 1024 / 1024),
      clientRssMb: Math.round(memEnd.rss / 1024 / 1024),
      clientCpuUserMs: Math.round(cpuEnd.user / 1000),
      clientCpuSystemMs: Math.round(cpuEnd.system / 1000),
    },
    gates: {
      errorRateUnder0_5pct: errorRate < 0.005,
      pass: errorRate < 0.005 && ok > 0,
    },
    notes:
      'Read-only endpoints only. DB connection count / queue lag require server-side sampling during canary.',
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.gates.pass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
