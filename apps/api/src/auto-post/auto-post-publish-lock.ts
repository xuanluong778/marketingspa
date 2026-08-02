import type Redis from 'ioredis';

/**
 * Lock publish: key bắt buộc gồm organizationId + postId.
 * Ownership token — chỉ owner mới release (Lua). TTL chống deadlock khi crash.
 */
export function autoPostPublishLockKey(organizationId: string, postId: string): string {
  return `auto-post:lock:publish:${organizationId}:${postId}`;
}

export async function acquireAutoPostPublishLock(
  redis: Redis,
  organizationId: string,
  postId: string,
  owner: string,
  ttlMs = 120_000,
): Promise<{ ok: true; key: string } | { ok: false; key: string }> {
  const key = autoPostPublishLockKey(organizationId, postId);
  const res = await redis.set(key, owner, 'PX', ttlMs, 'NX');
  return res === 'OK' ? { ok: true, key } : { ok: false, key };
}

export async function releaseAutoPostPublishLock(
  redis: Redis,
  key: string,
  owner: string,
): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const n = (await redis.eval(script, 1, key, owner)) as number;
  return Number(n) === 1;
}
