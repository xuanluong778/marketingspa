import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type Redis from 'ioredis';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { REDIS_CLIENT } from '../redis/redis.constants';

const SKIP = new Set(['/health', '/ready', '/api/v1/health', '/api/v1/ready']);

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const path = (req.originalUrl || req.url || '').split('?')[0] || '';
    if (SKIP.has(path)) {
      return next.handle();
    }

    return next.handle().pipe(
      finalize(() => {
        const res = context.switchToHttp().getResponse<Response>();
        if (res.statusCode >= 500) {
          void this.bump5xx();
        }
      }),
    );
  }

  private async bump5xx() {
    const hour = new Date().toISOString().slice(0, 13).replace(/[-:T]/g, '');
    const key = `marketingspa:metrics:http5xx:${hour}`;
    try {
      await this.redis.incr(key);
      await this.redis.expire(key, 48 * 3600);
    } catch {
      /* metrics must never break requests */
    }
  }
}
