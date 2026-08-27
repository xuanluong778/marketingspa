/**
 * WAVE2 load smoke — localhost only (does not stress public HTTPS).
 * Usage: node scripts/wave2-load-smoke.cjs [concurrency] [durationSec]
 */
const http = require('http');

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
    req.setTimeout(5000, () => {
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

async function main() {
  const end = Date.now() + durationSec * 1000;
  const latencies = [];
  let ok = 0;
  let fail = 0;
  let inFlight = 0;

  async function worker() {
    while (Date.now() < end) {
      inFlight += 1;
      const r = await one();
      inFlight -= 1;
      if (r.ok) {
        ok += 1;
        latencies.push(r.ms);
      } else fail += 1;
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  latencies.sort((a, b) => a - b);
  const total = ok + fail;
  const errRate = total ? fail / total : 1;
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
  };
  console.log(JSON.stringify(summary));
  // Pass criteria: errorRate < 1%, p95 < 500ms for health
  if (errRate > 0.01 || summary.p95 > 500) process.exitCode = 1;
}

main();
