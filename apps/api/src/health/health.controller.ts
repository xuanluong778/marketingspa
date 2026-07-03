import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type Redis from 'ioredis';

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

    return {
      status: dbOk && redisOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { database: dbOk, redis: redisOk },
    };
  }
}
