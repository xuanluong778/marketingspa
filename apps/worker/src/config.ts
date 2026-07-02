import Redis from 'ioredis';

export const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
export const queuePrefix = process.env.QUEUE_PREFIX ?? 'marketingspa';
export const staleLeadMinutes = Number(process.env.STALE_LEAD_MINUTES ?? 10);

export const bullConnection = {
  url: redisUrl,
  maxRetriesPerRequest: null as null,
};

export function createRedisPublisher() {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}
