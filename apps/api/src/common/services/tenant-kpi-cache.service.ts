import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

const PREFIX = 'maaz:kpi';

@Injectable()
export class TenantKpiCacheService {
  constructor(@Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis) {}

  private async gen(organizationId: string): Promise<string> {
    if (!this.redis) return '0';
    try {
      const g = await this.redis.get(`${PREFIX}:${organizationId}:g`);
      return g || '0';
    } catch {
      return '0';
    }
  }

  async getJson<T>(organizationId: string, name: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const g = await this.gen(organizationId);
      const raw = await this.redis.get(`${PREFIX}:${organizationId}:${g}:${name}`);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(organizationId: string, name: string, value: unknown, ttlSec: number): Promise<void> {
    if (!this.redis) return;
    try {
      const g = await this.gen(organizationId);
      await this.redis.set(
        `${PREFIX}:${organizationId}:${g}:${name}`,
        JSON.stringify(value),
        'EX',
        ttlSec,
      );
    } catch {
      /* fail-open */
    }
  }

  async bump(organizationId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.incr(`${PREFIX}:${organizationId}:g`);
    } catch {
      /* ignore */
    }
  }
}
