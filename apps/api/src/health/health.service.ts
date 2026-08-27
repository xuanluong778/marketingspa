import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type Redis from 'ioredis';

const WORKER_HEARTBEAT_KEY = 'marketingspa:worker:heartbeat';

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]);
}

export type ReadinessBody = {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    postgres: boolean;
    redis: boolean;
    worker: boolean;
  };
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  liveness() {
    return {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<{ ok: boolean; body: ReadinessBody }> {
    let postgres = false;
    let redisOk = false;
    let worker = false;

    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, 2_000);
      postgres = true;
    } catch {
      postgres = false;
    }

    try {
      const pong = await withTimeout(this.redis.ping(), 2_000);
      redisOk = pong === 'PONG';
    } catch {
      redisOk = false;
    }

    if (redisOk) {
      try {
        const heartbeat = await this.redis.get(WORKER_HEARTBEAT_KEY);
        if (heartbeat) {
          const ageMs = Date.now() - parseInt(heartbeat, 10);
          worker = !Number.isNaN(ageMs) && ageMs < 120_000;
        }
      } catch {
        worker = false;
      }
    }

    const ok = postgres && redisOk;
    return {
      ok,
      body: {
        status: ok ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          postgres,
          redis: redisOk,
          worker,
        },
      },
    };
  }
}
