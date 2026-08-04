import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  OfflineConversionProvider,
  OfflineConversionStatus,
} from '@marketingspa/database';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OFFLINE_CONVERSION_QUEUE } from '../queue/queue.constants';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';

@Injectable()
export class OfflineConversionService {
  private readonly logger = new Logger(OfflineConversionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueEnqueue: QueueEnqueueService,
    @Inject(OFFLINE_CONVERSION_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueuePendingJobs(organizationId: string, jobIds: string[]) {
    for (const jobId of jobIds) {
      await this.queueEnqueue.add(
        this.queue,
        'send-offline-conversion',
        { organizationId, jobId },
        {
          jobId: `offline-conv-${jobId}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 200,
          removeOnFail: 100,
        },
      );
    }
  }

  /**
   * Processor logic — gọi từ worker. Chưa gắn token thật → mô phỏng SENT/SKIPPED an toàn.
   * Không gửi dữ liệu giả lên Meta/Google production.
   */
  async processJob(organizationId: string, jobId: string) {
    const job = await this.prisma.offlineConversionJob.findFirst({
      where: { id: jobId, organizationId },
    });
    if (!job) return { skipped: true, reason: 'not_found' };
    if (job.status === OfflineConversionStatus.SENT) {
      return { skipped: true, reason: 'already_sent' };
    }

    const metaToken = process.env.META_CAPI_ACCESS_TOKEN?.trim();
    const googleEnabled = process.env.GOOGLE_ENHANCED_CONVERSIONS_ENABLED === 'true';

    try {
      if (job.provider === OfflineConversionProvider.META_CAPI) {
        if (!metaToken) {
          await this.prisma.offlineConversionJob.update({
            where: { id: job.id },
            data: {
              status: OfflineConversionStatus.SKIPPED,
              lastError: 'META_CAPI_ACCESS_TOKEN chưa cấu hình',
              attemptCount: { increment: 1 },
              response: { skipped: true },
            },
          });
          return { skipped: true, reason: 'meta_not_configured' };
        }
        // Placeholder for real CAPI HTTP call — keep idempotent
        this.logger.log(`[META_CAPI] would send job=${job.id} event=${job.eventType}`);
      }

      if (job.provider === OfflineConversionProvider.GOOGLE_ENHANCED) {
        if (!googleEnabled) {
          await this.prisma.offlineConversionJob.update({
            where: { id: job.id },
            data: {
              status: OfflineConversionStatus.SKIPPED,
              lastError: 'GOOGLE_ENHANCED_CONVERSIONS_ENABLED != true',
              attemptCount: { increment: 1 },
              response: { skipped: true },
            },
          });
          return { skipped: true, reason: 'google_not_configured' };
        }
        this.logger.log(`[GOOGLE_EC] would send job=${job.id} event=${job.eventType}`);
      }

      await this.prisma.offlineConversionJob.update({
        where: { id: job.id },
        data: {
          status: OfflineConversionStatus.SENT,
          sentAt: new Date(),
          attemptCount: { increment: 1 },
          response: { ok: true, simulated: !(metaToken || googleEnabled) },
          lastError: null,
        },
      });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'send failed';
      await this.prisma.offlineConversionJob.update({
        where: { id: job.id },
        data: {
          status: OfflineConversionStatus.FAILED,
          lastError: msg,
          attemptCount: { increment: 1 },
          nextRetryAt: new Date(Date.now() + 5 * 60_000),
        },
      });
      throw err;
    }
  }
}
