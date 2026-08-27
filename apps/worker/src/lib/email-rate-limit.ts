import type Redis from 'ioredis';
import { emailSendRatePerSec } from '@marketingspa/shared';

export async function acquireEmailSendRateLimit(
  redis: Redis,
  provider: string,
  organizationId: string,
): Promise<void> {
  const limit = emailSendRatePerSec();
  const bucket = Math.floor(Date.now() / 1000);
  const key = `email:rl:${provider}:${organizationId}:${bucket}`;
  for (let attempt = 0; attempt < 40; attempt++) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 2);
    if (count <= limit) return;
    const waitMs = 1000 - (Date.now() % 1000) + 40;
    await new Promise((r) => setTimeout(r, waitMs));
  }
}
