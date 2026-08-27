/**
 * WAVE5 load smoke — localhost API only (does not hit public HTTPS).
 * Usage: node scripts/wave5-load-smoke.cjs [concurrency] [durationSec]
 * Samples CPU/RAM, Postgres connections, Redis memory, BullMQ wait after the run.
 */
const http = require('http');
const os = require('os');
const { execSync } = require('child_process');

const concurrency = Number(process.argv[2] || 100);
const durationSec = Number(process.argv[3] || 8);
const target = process.env.LOAD_TARGET || 'http://127.0.0.1:4000/api/v1/health';

function one() {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const req = http.get(target, (res) => {
      res.resume();
      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, ms, code: res.statusCode });
      });
    });
    req.on('error', () => resolve({ ok: false, ms: 0, code: 0 }));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ ok: false, ms: 0, code: 0 });
    });
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
    out.queues = execSync(
      `docker exec marketingspa-redis-dev redis-cli LLEN bull:auto-post:wait`,
      { encoding: 'utf8', timeout: 4000 },
    ).trim();
  } catch {
    out.queues = 'n/a';
  }
  return out;
}

async function main() {
  const before = sampleInfra();
  const end = Date.now() + durationSec * 1000;
  const latencies = [];
  let ok = 0;
  let fail = 0;

  async function worker() {
    while (Date.now() < end) {
      const r = await one();
      if (r.ok) {
        ok += 1;
        latencies.push(r.ms);
      } else fail += 1;
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
    before,
    after,
  };
  console.log(JSON.stringify(summary));
  const p95Limit = concurrency <= 100 ? 500 : concurrency <= 500 ? 800 : 2000;
  const errLimit = concurrency <= 500 ? 0.01 : 0.02;
  if (errRate > errLimit || summary.p95 > p95Limit) process.exitCode = 1;
}

main();
