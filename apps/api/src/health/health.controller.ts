import { Controller, Get, Inject } from '@nestjs/common';
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

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    let dbOk = false;
    let redisOk = false;
    let workerOk = false;

    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, 2_000);
      dbOk = true;
    } catch {
      dbOk = false;
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
          workerOk = !Number.isNaN(ageMs) && ageMs < 120_000;
        }
      } catch {
        workerOk = false;
      }
    }

    const coreOk = dbOk && redisOk;
    return {
      status: coreOk && workerOk ? 'ok' : coreOk ? 'degraded' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk,
        redis: redisOk,
        worker: workerOk,
      },
    };
  }
}
