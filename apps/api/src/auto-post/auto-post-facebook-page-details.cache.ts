import type Redis from 'ioredis';
import type { FanpageDetailsResponse } from './auto-post-facebook-page-details.types';
import {
  FANPAGE_DETAILS_CACHE_TTL_MS,
  META_CACHE_OP_DETAILS,
} from './auto-post-facebook-page-details.types';
import { fanpageDetailsCacheKey } from './auto-post-facebook-page-details.logic';
import {
  redisCacheDel,
  redisCacheGet,
  redisCacheSet,
  withRedisSingleFlight,
} from './meta-redis-cache';

/** TTL cache chính 4 phút; stale giữ 24h chỉ cho UI metadata/posts — không dùng cho publish auth. */
const FRESH_TTL_SEC = Math.ceil(FANPAGE_DETAILS_CACHE_TTL_MS / 1000);
const STALE_TTL_SEC = 24 * 60 * 60;

function scope(organizationId: string, fanpageId: string) {
  return fanpageDetailsCacheKey(organizationId, fanpageId);
}

function freshKey(organizationId: string, fanpageId: string) {
  return `meta:cache:${META_CACHE_OP_DETAILS}:${scope(organizationId, fanpageId)}`;
}

function staleKey(organizationId: string, fanpageId: string) {
  return `meta:cache:${META_CACHE_OP_DETAILS}:stale:${scope(organizationId, fanpageId)}`;
}

function lockKey(organizationId: string, fanpageId: string) {
  return `meta:lock:${META_CACHE_OP_DETAILS}:${scope(organizationId, fanpageId)}`;
}

function resultKey(organizationId: string, fanpageId: string) {
  return `meta:lock:${META_CACHE_OP_DETAILS}:result:${scope(organizationId, fanpageId)}`;
}

/** Index fanpage ids đã cache theo org — để invalidate cả org khi reconnect/disconnect. */
function orgIndexKey(organizationId: string) {
  return `meta:cache:${META_CACHE_OP_DETAILS}:index:${organizationId}`;
}

const memoryFresh = new Map<string, { expiresAt: number; value: FanpageDetailsResponse }>();
const memoryStale = new Map<string, FanpageDetailsResponse>();

export class FanpageDetailsRedisCache {
  constructor(private readonly redis?: Redis | null) {}

  async getFresh(
    organizationId: string,
    fanpageId: string,
  ): Promise<FanpageDetailsResponse | null> {
    const mk = scope(organizationId, fanpageId);
    const mem = memoryFresh.get(mk);
    if (mem && Date.now() < mem.expiresAt) {
      return {
        ...mem.value,
        cached: true,
        stale: false,
        dataSource: 'cache',
      };
    }

    const hit = await redisCacheGet<FanpageDetailsResponse>(
      this.redis,
      freshKey(organizationId, fanpageId),
    );
    if (hit) {
      memoryFresh.set(mk, {
        expiresAt: Date.now() + FANPAGE_DETAILS_CACHE_TTL_MS,
        value: { ...hit, cached: false },
      });
      return { ...hit, cached: true, stale: false, dataSource: 'cache' };
    }
    return null;
  }

  async getStale(
    organizationId: string,
    fanpageId: string,
  ): Promise<FanpageDetailsResponse | null> {
    const mk = scope(organizationId, fanpageId);
    const mem = memoryStale.get(mk);
    if (mem) {
      return { ...mem, cached: true, stale: true, dataSource: 'stale' };
    }

    const hit = await redisCacheGet<FanpageDetailsResponse>(
      this.redis,
      staleKey(organizationId, fanpageId),
    );
    return hit ? { ...hit, cached: true, stale: true, dataSource: 'stale' } : null;
  }

  async set(
    organizationId: string,
    fanpageId: string,
    value: FanpageDetailsResponse,
  ): Promise<void> {
    const stored: FanpageDetailsResponse = {
      ...value,
      cached: false,
      stale: false,
      dataSource: 'live',
    };
    const mk = scope(organizationId, fanpageId);
    memoryFresh.set(mk, {
      expiresAt: Date.now() + FANPAGE_DETAILS_CACHE_TTL_MS,
      value: stored,
    });
    memoryStale.set(mk, stored);
    await redisCacheSet(this.redis, freshKey(organizationId, fanpageId), stored, FRESH_TTL_SEC);
    await redisCacheSet(this.redis, staleKey(organizationId, fanpageId), stored, STALE_TTL_SEC);
    if (this.redis) {
      try {
        await this.redis.sadd(orgIndexKey(organizationId), fanpageId);
        await this.redis.expire(orgIndexKey(organizationId), STALE_TTL_SEC);
      } catch {
        /* ignore */
      }
    }
  }

  /** Xóa fresh (và optionally stale) cho 1 Fanpage. */
  async invalidate(
    organizationId: string,
    fanpageId: string,
    opts?: { dropStale?: boolean },
  ): Promise<void> {
    const mk = scope(organizationId, fanpageId);
    memoryFresh.delete(mk);
    const keys = [freshKey(organizationId, fanpageId)];
    if (opts?.dropStale) {
      memoryStale.delete(mk);
      keys.push(staleKey(organizationId, fanpageId));
    }
    await redisCacheDel(this.redis, ...keys);
  }

  /** Reconnect / đổi quyền / disconnect — drop fresh+stale toàn org. */
  async invalidateOrganization(organizationId: string): Promise<void> {
    const ids = new Set<string>();
    if (this.redis) {
      try {
        const members = await this.redis.smembers(orgIndexKey(organizationId));
        for (const id of members) ids.add(id);
      } catch {
        /* ignore */
      }
    }
    for (const [mk] of memoryFresh) {
      if (mk.startsWith(`${organizationId}:`)) {
        ids.add(mk.slice(organizationId.length + 1));
      }
    }
    for (const id of ids) {
      await this.invalidate(organizationId, id, { dropStale: true });
    }
    if (this.redis) {
      await redisCacheDel(this.redis, orgIndexKey(organizationId));
    }
  }

  async withSingleFlight(
    organizationId: string,
    fanpageId: string,
    fn: () => Promise<FanpageDetailsResponse>,
    onPrevented?: () => void,
  ): Promise<FanpageDetailsResponse> {
    const { value, leader } = await withRedisSingleFlight(
      this.redis,
      lockKey(organizationId, fanpageId),
      {
        ttlMs: 45_000,
        waitMs: 15_000,
        resultKey: resultKey(organizationId, fanpageId),
        resultTtlSec: 45,
      },
      fn,
    );
    if (!leader && onPrevented) onPrevented();
    return value;
  }
}
