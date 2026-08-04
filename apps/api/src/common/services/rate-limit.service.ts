import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class RateLimitService {
  private readonly hits = new Map<string, number[]>();

  assertWithinLimit(key: string, limit: number, windowMs: number, message?: string): void {
    const now = Date.now();
    const windowStart = now - windowMs;
    const arr = (this.hits.get(key) || []).filter((t) => t > windowStart);
    if (arr.length >= limit) {
      throw new HttpException(message || 'Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    arr.push(now);
    this.hits.set(key, arr);
  }
}
