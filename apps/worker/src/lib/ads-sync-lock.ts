import type Redis from 'ioredis';

/** Distributed lock: SET key NX PX ttl — chống 2 job cùng platform+account */
export async function acquireAdsSyncLock(
  redis: Redis,
  platform: string,
  externalAccountId: string,
  owner: string,
  ttlMs = 300_000,
): Promise<{ ok: true; key: string } | { ok: false; key: string }> {
  const key = `ads-sync-lock:${platform}:${externalAccountId}`;
  const res = await redis.set(key, owner, 'PX', ttlMs, 'NX');
  return res === 'OK' ? { ok: true, key } : { ok: false, key };
}

export async function releaseAdsSyncLock(redis: Redis, key: string, owner: string) {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, key, owner);
}

export async function renewAdsSyncLock(
  redis: Redis,
  key: string,
  owner: string,
  ttlMs = 300_000,
): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("pexpire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;
  const r = await redis.eval(script, 1, key, owner, String(ttlMs));
  return Number(r) === 1;
}
