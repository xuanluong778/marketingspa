import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import {
  AD_URL_ANALYZE_LIMITS,
  AD_URL_ANALYZE_STAGE_LABELS,
  adUrlAnalyzeQueuePayloadSchema,
  adUrlAnalyzeRedisKey,
  type AdUrlAnalyzeJobPublic,
  type AdUrlAnalyzeQueuePayload,
} from '@marketingspa/shared';
import {
  assertPublicHttpUrl,
  SsrfValidationError,
} from '@marketingspa/shared/dist/ssrf-fetch';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { AD_URL_ANALYZE_QUEUE } from '../queue/queue.constants';
import { RateLimitService } from '../common/services/rate-limit.service';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

@Injectable()
export class AdUrlAnalyzeService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AD_URL_ANALYZE_QUEUE) private readonly queue: Queue,
    private readonly rateLimit: RateLimitService,
    private readonly queueEnqueue: QueueEnqueueService,
  ) {}

  private async save(job: AdUrlAnalyzeJobPublic): Promise<void> {
    await this.redis.set(
      adUrlAnalyzeRedisKey(job.id),
      JSON.stringify(job),
      'EX',
      AD_URL_ANALYZE_LIMITS.redisTtlSeconds,
    );
  }

  private async load(jobId: string): Promise<AdUrlAnalyzeJobPublic | null> {
    const raw = await this.redis.get(adUrlAnalyzeRedisKey(jobId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdUrlAnalyzeJobPublic;
    } catch {
      return null;
    }
  }

  async start(
    user: AuthUser,
    body: { sourceUrl: string; adPostKind: 'product' | 'service'; brandName?: string },
  ): Promise<AdUrlAnalyzeJobPublic> {
    this.rateLimit.assertWithinLimit(
      `ad-url-analyze:user:${user.organizationId}:${user.id}`,
      AD_URL_ANALYZE_LIMITS.rateLimitMax,
      AD_URL_ANALYZE_LIMITS.rateLimitWindowMs,
      'Bạn đã phân tích quá nhiều link trong thời gian ngắn. Thử lại sau vài phút.',
    );
    this.rateLimit.assertWithinLimit(
      `ad-url-analyze:org:${user.organizationId}`,
      AD_URL_ANALYZE_LIMITS.orgRateLimitMax,
      AD_URL_ANALYZE_LIMITS.orgRateLimitWindowMs,
      'Tổ chức đã đạt giới hạn phân tích link. Thử lại sau vài phút.',
    );

    let parsedUrl: URL;
    try {
      parsedUrl = await assertPublicHttpUrl(body.sourceUrl);
    } catch (e) {
      if (e instanceof SsrfValidationError) {
        throw new BadRequestException({ message: e.message, code: e.code });
      }
      throw e;
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const job: AdUrlAnalyzeJobPublic = {
      id,
      organizationId: user.organizationId,
      userId: user.id,
      status: 'pending',
      stage: 'queued',
      stageLabel: AD_URL_ANALYZE_STAGE_LABELS.queued,
      progressPercent: 5,
      sourceUrl: parsedUrl.toString(),
      adPostKind: body.adPostKind === 'service' ? 'service' : 'product',
      errorCode: null,
      errorMessage: null,
      result: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    await this.save(job);

    const payload: AdUrlAnalyzeQueuePayload = adUrlAnalyzeQueuePayloadSchema.parse({
      jobId: id,
      organizationId: user.organizationId,
      userId: user.id,
      sourceUrl: parsedUrl.toString(),
      adPostKind: job.adPostKind,
      brandName: body.brandName?.trim() || undefined,
    });

    await this.queueEnqueue.add(this.queue, 'ad-url-analyze', payload, {
      jobId: `ad-url-analyze-${id}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    return job;
  }

  async get(user: AuthUser, jobId: string): Promise<AdUrlAnalyzeJobPublic> {
    const job = await this.load(jobId);
    if (!job) throw new NotFoundException('Không tìm thấy job phân tích link.');
    if (job.organizationId !== user.organizationId || job.userId !== user.id) {
      throw new ForbiddenException('Không có quyền xem job này.');
    }
    return job;
  }

  async cancel(user: AuthUser, jobId: string): Promise<AdUrlAnalyzeJobPublic> {
    const job = await this.get(user, jobId);
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return job;
    }
    const next: AdUrlAnalyzeJobPublic = {
      ...job,
      status: 'cancelled',
      stage: 'cancelled',
      stageLabel: AD_URL_ANALYZE_STAGE_LABELS.cancelled,
      progressPercent: 100,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      errorCode: 'CANCELLED',
      errorMessage: 'Người dùng đã hủy phân tích.',
    };
    await this.save(next);
    try {
      const bullJob = await this.queue.getJob(`ad-url-analyze-${jobId}`);
      if (bullJob) await bullJob.remove();
    } catch {
      /* ignore */
    }
    return next;
  }
}
