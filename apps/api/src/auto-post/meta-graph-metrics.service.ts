import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

/** Metrics an toàn — không chứa token / PII nhạy cảm. */
export type MetaGraphMetricsSnapshot = {
  graphRequestsByEndpoint: Record<string, number>;
  cacheHit: number;
  cacheMiss: number;
  singleFlightPrevented: number;
  retries: number;
  duplicatePublishPrevented: number;
  rateLimitEvents: number;
  updatedAt: string;
};

@Injectable()
export class MetaGraphMetricsService {
  private readonly logger = new Logger(MetaGraphMetricsService.name);
  private readonly local: MetaGraphMetricsSnapshot = {
    graphRequestsByEndpoint: {},
    cacheHit: 0,
    cacheMiss: 0,
    singleFlightPrevented: 0,
    retries: 0,
    duplicatePublishPrevented: 0,
    rateLimitEvents: 0,
    updatedAt: new Date().toISOString(),
  };

  constructor(@Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis) {}

  private touch() {
    this.local.updatedAt = new Date().toISOString();
  }

  private async bumpRedis(field: string, by = 1) {
    if (!this.redis) return;
    try {
      await this.redis.hincrby('meta:graph:metrics', field, by);
    } catch {
      /* best-effort */
    }
  }

  /** endpoint dạng an toàn: page_metadata | published_posts | me_accounts | debug_token | feed | photos | other */
  graphRequest(endpoint: string) {
    const key = endpoint.replace(/[^a-z0-9_\-./]/gi, '_').slice(0, 64);
    this.local.graphRequestsByEndpoint[key] = (this.local.graphRequestsByEndpoint[key] ?? 0) + 1;
    this.touch();
    void this.bumpRedis(`graph:${key}`);
  }

  cacheHit() {
    this.local.cacheHit += 1;
    this.touch();
    void this.bumpRedis('cacheHit');
  }

  cacheMiss() {
    this.local.cacheMiss += 1;
    this.touch();
    void this.bumpRedis('cacheMiss');
  }

  singleFlightPrevented() {
    this.local.singleFlightPrevented += 1;
    this.touch();
    void this.bumpRedis('singleFlightPrevented');
  }

  retry() {
    this.local.retries += 1;
    this.touch();
    void this.bumpRedis('retries');
  }

  duplicatePublishPrevented() {
    this.local.duplicatePublishPrevented += 1;
    this.touch();
    void this.bumpRedis('duplicatePublishPrevented');
    this.logger.log('metric=duplicate_publish_prevented');
  }

  rateLimit() {
    this.local.rateLimitEvents += 1;
    this.touch();
    void this.bumpRedis('rateLimitEvents');
  }

  snapshot(): MetaGraphMetricsSnapshot {
    return {
      ...this.local,
      graphRequestsByEndpoint: { ...this.local.graphRequestsByEndpoint },
    };
  }
}
