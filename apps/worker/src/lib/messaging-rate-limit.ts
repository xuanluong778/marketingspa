import type Redis from 'ioredis';
import { MESSAGING_DEFAULT_RATE_PER_SEC } from '@marketingspa/shared';

export async function acquireMessagingRateLimit(
  redis: Redis,
  providerKind: string,
  scopeKey: string,
  maxPerSecond?: number,
): Promise<void> {
  const limit = maxPerSecond ?? MESSAGING_DEFAULT_RATE_PER_SEC[providerKind] ?? 10;
  const bucket = Math.floor(Date.now() / 1000);
  const key = `messaging:rl:${providerKind}:${scopeKey}:${bucket}`;

  for (let attempt = 0; attempt < 30; attempt++) {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 2);
    }
    if (count <= limit) return;
    const waitMs = 1000 - (Date.now() % 1000) + 50;
    await new Promise((r) => setTimeout(r, waitMs));
  }
}
