import { randomUUID } from 'crypto';
import type Redis from 'ioredis';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Redis single-flight: cùng key chỉ 1 hàm chạy; waiter poll cache/result.
 * Không dùng để cache access token.
 */
export async function withRedisSingleFlight<T>(
  redis: Redis | null | undefined,
  lockKey: string,
  options: {
    ttlMs?: number;
    waitMs?: number;
    pollMs?: number;
    /** Nếu có — waiter đọc kết quả từ đây sau khi leader xong */
    resultKey?: string;
    resultTtlSec?: number;
  },
  fn: () => Promise<T>,
): Promise<{ value: T; leader: boolean }> {
  const ttlMs = options.ttlMs ?? 30_000;
  const waitMs = options.waitMs ?? 12_000;
  const pollMs = options.pollMs ?? 250;
  const resultKey = options.resultKey;
  const resultTtlSec = options.resultTtlSec ?? 30;

  if (!redis) {
    return { value: await fn(), leader: true };
  }

  const owner = randomUUID();
  const got = await redis.set(lockKey, owner, 'PX', ttlMs, 'NX');
  if (got === 'OK') {
    try {
      const value = await fn();
      if (resultKey) {
        await redis.set(resultKey, JSON.stringify({ ok: true, value }), 'EX', resultTtlSec);
      }
      return { value, leader: true };
    } catch (e) {
      if (resultKey) {
        const message = e instanceof Error ? e.message : 'error';
        await redis.set(
          resultKey,
          JSON.stringify({ ok: false, message }),
          'EX',
          Math.min(resultTtlSec, 10),
        );
      }
      throw e;
    } finally {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      try {
        await redis.eval(script, 1, lockKey, owner);
      } catch {
        /* ignore */
      }
    }
  }

  // Waiter: đợi result hoặc hết thời gian rồi tự chạy 1 lần (tránh deadlock)
  if (resultKey) {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      const raw = await redis.get(resultKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { ok: boolean; value?: T; message?: string };
        if (parsed.ok) return { value: parsed.value as T, leader: false };
        throw new Error(parsed.message || 'Meta single-flight failed');
      }
      await sleep(pollMs);
    }
  } else {
    await sleep(Math.min(waitMs, 1500));
  }

  return { value: await fn(), leader: false };
}

export async function redisCacheGet<T>(
  redis: Redis | null | undefined,
  key: string,
): Promise<T | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function redisCacheSet(
  redis: Redis | null | undefined,
  key: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', Math.max(1, ttlSec));
  } catch {
    /* ignore — cache best-effort */
  }
}

export async function redisCacheDel(
  redis: Redis | null | undefined,
  ...keys: string[]
): Promise<void> {
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch {
    /* ignore */
  }
}
