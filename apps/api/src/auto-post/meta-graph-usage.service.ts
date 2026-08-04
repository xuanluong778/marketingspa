import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type { MetaUsageSnapshot } from './meta-graph-http';
import { redisCacheGet, redisCacheSet } from './meta-redis-cache';

const USAGE_KEY = 'meta:graph:usage:latest';
const THROTTLE_KEY = 'meta:graph:throttle:until';

/**
 * Theo dõi X-App-Usage / X-Page-Usage — giảm tác vụ nền khi gần limit.
 */
@Injectable()
export class MetaGraphUsageService {
  private readonly logger = new Logger(MetaGraphUsageService.name);
  private memory: MetaUsageSnapshot | null = null;
  private throttleUntil = 0;

  constructor(@Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis) {}

  async record(usage: MetaUsageSnapshot | null | undefined): Promise<void> {
    if (!usage) return;
    this.memory = usage;
    if (usage.nearLimit) {
      this.throttleUntil = Date.now() + 60_000;
      this.logger.warn(
        `Meta usage near limit source=${usage.source} call=${usage.callCount}% cpu=${usage.totalCputime}% time=${usage.totalTime}% — throttle background 60s`,
      );
    }
    await redisCacheSet(this.redis, USAGE_KEY, usage, 300);
    if (usage.nearLimit) {
      await redisCacheSet(this.redis, THROTTLE_KEY, { until: this.throttleUntil }, 90);
    }
  }

  async shouldThrottleBackground(): Promise<boolean> {
    if (Date.now() < this.throttleUntil) return true;
    const fromRedis = await redisCacheGet<{ until?: number }>(this.redis, THROTTLE_KEY);
    if (fromRedis?.until && Date.now() < fromRedis.until) {
      this.throttleUntil = fromRedis.until;
      return true;
    }
    const usage = (await redisCacheGet<MetaUsageSnapshot>(this.redis, USAGE_KEY)) ?? this.memory;
    return Boolean(usage?.nearLimit);
  }

  getLatest(): MetaUsageSnapshot | null {
    return this.memory;
  }
}
