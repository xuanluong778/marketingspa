/**
 * Unit tests: Meta Graph SaaS optimizations (usage headers, backoff, single-flight, cache keys).
 *
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-meta-graph-saas-opt.ts
 */
import assert from 'node:assert/strict';
import {
  exponentialBackoffMs,
  isPermanentMetaError,
  isRateLimitMetaError,
  parseMetaUsageHeader,
  redactMetaSecrets,
} from '../apps/api/src/auto-post/meta-graph-http';
import { fanpageDetailsCacheKey } from '../apps/api/src/auto-post/auto-post-facebook-page-details.logic';
import { withRedisSingleFlight } from '../apps/api/src/auto-post/meta-redis-cache';

type Case = { name: string; ok: boolean; detail?: string };

class MemoryRedis {
  store = new Map<string, { v: string; exp?: number }>();
  async set(key: string, value: string, ...args: Array<string | number>) {
    let px: number | undefined;
    let nx = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === 'PX') px = Number(args[++i]);
      if (args[i] === 'EX') px = Number(args[++i]) * 1000;
      if (args[i] === 'NX') nx = true;
    }
    if (nx && this.store.has(key)) return null;
    this.store.set(key, { v: value, exp: px ? Date.now() + px : undefined });
    return 'OK';
  }
  async get(key: string) {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.exp && Date.now() > e.exp) {
      this.store.delete(key);
      return null;
    }
    return e.v;
  }
  async del(...keys: string[]) {
    for (const k of keys) this.store.delete(k);
    return keys.length;
  }
  async eval(_script: string, _n: number, key: string, owner: string) {
    const cur = await this.get(key);
    if (cur === owner) {
      await this.del(key);
      return 1;
    }
    return 0;
  }
}

async function main() {
  const results: Case[] = [];

  const usage = parseMetaUsageHeader(
    JSON.stringify({ call_count: 85, total_cputime: 10, total_time: 12 }),
    'app',
  );
  results.push({
    name: 'usage_near_limit',
    ok: Boolean(usage?.nearLimit && usage.callCount === 85),
  });

  results.push({
    name: 'permanent_permission',
    ok: isPermanentMetaError({ code: 10, message: 'Requires pages_read_engagement' }),
  });
  results.push({
    name: 'permanent_token',
    ok: isPermanentMetaError({ code: 190, message: 'Session has expired' }),
  });
  results.push({
    name: 'rate_limit',
    ok: isRateLimitMetaError({ code: 4, message: 'Application request limit reached' }),
  });
  results.push({
    name: 'backoff_jitter_range',
    ok: (() => {
      const a = exponentialBackoffMs(0, 400, 8000);
      return a >= 400 && a <= 8000 + 400;
    })(),
  });
  results.push({
    name: 'redact_token',
    ok: !redactMetaSecrets('url?access_token=EAAG1234567890abcdef').includes('EAAG'),
  });
  results.push({
    name: 'cache_key_scoped',
    ok:
      fanpageDetailsCacheKey('org-a', 'fp-1') !== fanpageDetailsCacheKey('org-b', 'fp-1') &&
      fanpageDetailsCacheKey('org-a', 'fp-1') === 'org-a:fp-1',
  });

  // Single-flight: 2 concurrent → 1 fn execution
  const redis = new MemoryRedis() as unknown as import('ioredis').default;
  let runs = 0;
  const tasks = Array.from({ length: 2 }, () =>
    withRedisSingleFlight(
      redis,
      'lock:test',
      { resultKey: 'result:test', waitMs: 5000, pollMs: 50, resultTtlSec: 5 },
      async () => {
        runs += 1;
        await new Promise((r) => setTimeout(r, 80));
        return { ok: true, n: runs };
      },
    ),
  );
  const settled = await Promise.all(tasks);
  results.push({
    name: 'single_flight_one_meta_call',
    ok: runs === 1 && settled.every((s) => s.value.ok),
    detail: `runs=${runs}`,
  });
  results.push({
    name: 'single_flight_one_leader',
    ok: settled.filter((s) => s.leader).length === 1,
    detail: `leaders=${settled.filter((s) => s.leader).length}`,
  });

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    if (!r.ok) failed += 1;
  }
  if (failed) {
    console.log(`FAIL ${failed}/${results.length}`);
    process.exit(1);
  }
  console.log(`ALL_PASS ${results.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
