import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { tenantRedisKey } from '@marketingspa/shared';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { MarketingContextSnapshotPayload } from './marketing-context.types';

const CACHE_TTL_SEC = 120;

@Injectable()
export class MarketingContextCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(organizationId: string) {
    return tenantRedisKey('mce:snapshot', organizationId);
  }

  async get(organizationId: string): Promise<MarketingContextSnapshotPayload | null> {
    try {
      const raw = await this.redis.get(this.key(organizationId));
      if (!raw) return null;
      return JSON.parse(raw) as MarketingContextSnapshotPayload;
    } catch {
      return null;
    }
  }

  async set(organizationId: string, payload: MarketingContextSnapshotPayload): Promise<void> {
    try {
      await this.redis.set(this.key(organizationId), JSON.stringify(payload), 'EX', CACHE_TTL_SEC);
    } catch {
      /* fail-soft: cache optional */
    }
  }

  async invalidate(organizationId: string): Promise<void> {
    try {
      await this.redis.del(this.key(organizationId));
    } catch {
      /* ignore */
    }
  }

  getTtlSeconds() {
    return CACHE_TTL_SEC;
  }
}
