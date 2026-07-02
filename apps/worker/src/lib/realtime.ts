import type Redis from 'ioredis';
import { REALTIME_CHANNEL } from '@marketingspa/shared';

export async function publishRealtime(
  redis: Redis,
  organizationId: string,
  event: string,
  payload: unknown,
) {
  await redis.publish(REALTIME_CHANNEL, JSON.stringify({ organizationId, event, payload }));
}
