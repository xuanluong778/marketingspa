import type Redis from 'ioredis';

/** Distributed lock chống delayed job + scan 1 phút xử lý trùng cùng post. */
export async function acquireAutoPostPublishLock(
  redis: Redis,
  postId: string,
  owner: string,
  ttlMs = 120_000,
): Promise<{ ok: true; key: string } | { ok: false; key: string }> {
  const key = `auto-post-publish-lock:${postId}`;
  const res = await redis.set(key, owner, 'PX', ttlMs, 'NX');
  return res === 'OK' ? { ok: true, key } : { ok: false, key };
}

export async function releaseAutoPostPublishLock(
  redis: Redis,
  key: string,
  owner: string,
): Promise<void> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, key, owner);
}
