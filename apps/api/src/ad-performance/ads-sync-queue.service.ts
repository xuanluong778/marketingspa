import { createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdsSyncJobStatus,
  AdsSyncPlatform,
  AdConnectionProvider,
  FacebookAdsConnectionStatus,
  Prisma,
} from '@marketingspa/database';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import { ADS_SYNC_QUEUE } from '../queue/queue.constants';
import { redactForAudit } from '../common/utils/token-security.util';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

export type AdsSyncQueuePayload = {
  organizationId: string;
  connectionId: string;
  accountId: string;
  dateFrom: string;
  dateTo: string;
  jobId: string;
  platform: 'META' | 'GOOGLE';
};

function buildIdempotencyKey(parts: {
  organizationId: string;
  connectionId: string;
  accountId: string;
  dateFrom: string;
  dateTo: string;
  platform: string;
}): string {
  const raw = [
    parts.organizationId,
    parts.connectionId,
    parts.accountId,
    parts.dateFrom,
    parts.dateTo,
    parts.platform,
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class AdsSyncQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly queueEnqueue: QueueEnqueueService,
    @Inject(ADS_SYNC_QUEUE) private readonly adsSyncQueue: Queue,
  ) {}

  /**
   * API chỉ tạo AdsSyncJob + enqueue ID payload — không đọc/đưa token vào queue.
   */
  async enqueueMetaSync(
    user: AuthUser,
    dto: { dateFrom?: string; dateTo?: string; campaignId?: string },
  ) {
    const organizationId = user.organizationId;

    const connection = await this.prisma.adConnection.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: AdConnectionProvider.META,
        },
      },
    });
    if (!connection?.encryptedCredentials) {
      throw new BadRequestException('Chưa kết nối Facebook Ads');
    }

    const meta = await this.prisma.facebookAdsConnection.findUnique({
      where: { organizationId },
    });
    const accountId = meta?.selectedAdAccountId ?? connection.externalAccountId;
    if (!accountId) {
      throw new BadRequestException('Vui lòng chọn tài khoản quảng cáo trước khi đồng bộ');
    }

    // Incremental: nếu thiếu dateFrom → từ lastSyncAt (hoặc 7 ngày)
    const dateTo = this.parseDateOnly(dto.dateTo ?? new Date().toISOString().slice(0, 10));
    let dateFromStr = dto.dateFrom;
    if (!dateFromStr) {
      const last = connection.lastSyncAt ?? meta?.lastSyncAt;
      if (last) {
        dateFromStr = last.toISOString().slice(0, 10);
      } else {
        const d = new Date(dateTo);
        d.setDate(d.getDate() - 7);
        dateFromStr = d.toISOString().slice(0, 10);
      }
    }
    const dateFrom = this.parseDateOnly(dateFromStr);
    if (dateFrom > dateTo) {
      throw new BadRequestException('Từ ngày phải trước đến ngày');
    }

    // Chống 2 job cùng account đang chạy
    const running = await this.prisma.adsSyncJob.findFirst({
      where: {
        organizationId,
        platform: AdsSyncPlatform.META,
        accountId,
        status: { in: [AdsSyncJobStatus.QUEUED, AdsSyncJobStatus.RUNNING] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (running) {
      throw new ConflictException({
        message: 'Đã có job đồng bộ đang chạy cho tài khoản này',
        jobId: running.id,
        status: running.status,
        progressPercent: running.progressPercent,
      });
    }

    const dateFromKey = dateFrom.toISOString().slice(0, 10);
    const dateToKey = dateTo.toISOString().slice(0, 10);
    const idempotencyKey = buildIdempotencyKey({
      organizationId,
      connectionId: connection.id,
      accountId,
      dateFrom: dateFromKey,
      dateTo: dateToKey,
      platform: 'META',
    });

    // Idempotent: job SUCCEEDED cùng key trong 1h → trả lại, không tạo trùng
    const existingDone = await this.prisma.adsSyncJob.findUnique({
      where: { idempotencyKey },
    });
    if (
      existingDone?.status === AdsSyncJobStatus.SUCCEEDED &&
      existingDone.finishedAt &&
      Date.now() - existingDone.finishedAt.getTime() < 60 * 60 * 1000
    ) {
      return {
        jobId: existingDone.id,
        status: existingDone.status,
        queued: false,
        reused: true,
        message: 'Đã đồng bộ gần đây (idempotent)',
        progressPercent: 100,
      };
    }

    const maxAttempts = Number(this.config.get('ADS_SYNC_MAX_ATTEMPTS') ?? 5);

    let job;
    if (existingDone && existingDone.status !== AdsSyncJobStatus.RUNNING) {
      job = await this.prisma.adsSyncJob.update({
        where: { id: existingDone.id },
        data: {
          status: AdsSyncJobStatus.QUEUED,
          progressPercent: 0,
          progressMessage: 'Đang xếp hàng',
          campaignsSynced: 0,
          attemptCount: 0,
          lastError: null,
          startedAt: null,
          finishedAt: null,
          requestedByUserId: user.id,
          metadata: {
            campaignId: dto.campaignId ?? null,
            incremental: !dto.dateFrom,
          } as Prisma.InputJsonValue,
        },
      });
    } else {
      job = await this.prisma.adsSyncJob.create({
        data: {
          organizationId,
          connectionId: connection.id,
          accountId,
          platform: AdsSyncPlatform.META,
          status: AdsSyncJobStatus.QUEUED,
          dateFrom,
          dateTo,
          idempotencyKey,
          maxAttempts,
          requestedByUserId: user.id,
          progressMessage: 'Đang xếp hàng',
          metadata: {
            campaignId: dto.campaignId ?? null,
            incremental: !dto.dateFrom,
          },
        },
      });
    }

    await this.prisma.facebookAdsConnection.updateMany({
      where: { organizationId },
      data: {
        status: FacebookAdsConnectionStatus.SYNCING,
      },
    });

    const payload: AdsSyncQueuePayload = {
      organizationId,
      connectionId: connection.id,
      accountId,
      dateFrom: dateFromKey,
      dateTo: dateToKey,
      jobId: job.id,
      platform: 'META',
    };

    // Guard: payload must never contain token-like keys
    this.assertSafePayload(payload);

    await this.queueEnqueue.add(this.adsSyncQueue, 'ads-sync', payload, {
      jobId: `ads-sync-${job.id}`,
      attempts: maxAttempts,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });

    await this.prisma.adsSyncJob.update({
      where: { id: job.id },
      data: { bullJobId: `ads-sync-${job.id}` },
    });

    await this.audit.log({
      organizationId,
      userId: user.id,
      action: 'ADS_SYNC_QUEUED',
      entityType: 'ADS_SYNC_JOB',
      entityId: job.id,
      metadata: redactForAudit({
        platform: 'META',
        accountId,
        dateFrom: dateFromKey,
        dateTo: dateToKey,
        connectionId: connection.id,
      }) as Prisma.InputJsonValue,
    });

    return {
      jobId: job.id,
      status: AdsSyncJobStatus.QUEUED,
      queued: true,
      reused: false,
      message: 'Đã xếp hàng đồng bộ Ads',
      progressPercent: 0,
      dateFrom: dateFromKey,
      dateTo: dateToKey,
    };
  }

  /**
   * Google Ads sync — payload ID-only; refresh token chỉ giải mã ở worker.
   */
  async enqueueGoogleSync(user: AuthUser, dto: { dateFrom?: string; dateTo?: string }) {
    const organizationId = user.organizationId;

    const connection = await this.prisma.adConnection.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: AdConnectionProvider.GOOGLE,
        },
      },
    });
    if (!connection?.encryptedCredentials) {
      throw new BadRequestException('Chưa kết nối Google Ads');
    }

    const accountId = connection.externalAccountId;
    if (!accountId) {
      throw new BadRequestException('Vui lòng chọn Google Ads customer trước khi đồng bộ');
    }

    const dateTo = this.parseDateOnly(dto.dateTo ?? new Date().toISOString().slice(0, 10));
    let dateFromStr = dto.dateFrom;
    if (!dateFromStr) {
      if (connection.lastSyncAt) {
        dateFromStr = connection.lastSyncAt.toISOString().slice(0, 10);
      } else {
        const d = new Date(dateTo);
        d.setDate(d.getDate() - 7);
        dateFromStr = d.toISOString().slice(0, 10);
      }
    }
    const dateFrom = this.parseDateOnly(dateFromStr);
    if (dateFrom > dateTo) {
      throw new BadRequestException('Từ ngày phải trước đến ngày');
    }

    const running = await this.prisma.adsSyncJob.findFirst({
      where: {
        organizationId,
        platform: AdsSyncPlatform.GOOGLE,
        accountId,
        status: { in: [AdsSyncJobStatus.QUEUED, AdsSyncJobStatus.RUNNING] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (running) {
      throw new ConflictException({
        message: 'Đã có job đồng bộ Google đang chạy cho tài khoản này',
        jobId: running.id,
        status: running.status,
        progressPercent: running.progressPercent,
      });
    }

    const dateFromKey = dateFrom.toISOString().slice(0, 10);
    const dateToKey = dateTo.toISOString().slice(0, 10);
    const idempotencyKey = buildIdempotencyKey({
      organizationId,
      connectionId: connection.id,
      accountId,
      dateFrom: dateFromKey,
      dateTo: dateToKey,
      platform: 'GOOGLE',
    });

    const existingDone = await this.prisma.adsSyncJob.findUnique({
      where: { idempotencyKey },
    });
    if (
      existingDone?.status === AdsSyncJobStatus.SUCCEEDED &&
      existingDone.finishedAt &&
      Date.now() - existingDone.finishedAt.getTime() < 60 * 60 * 1000
    ) {
      return {
        jobId: existingDone.id,
        status: existingDone.status,
        queued: false,
        reused: true,
        message: 'Đã đồng bộ Google gần đây (idempotent)',
        progressPercent: 100,
      };
    }

    const maxAttempts = Number(this.config.get('ADS_SYNC_MAX_ATTEMPTS') ?? 5);
    const meta = (connection.metadata ?? {}) as { loginCustomerId?: string | null };

    let job;
    if (existingDone && existingDone.status !== AdsSyncJobStatus.RUNNING) {
      job = await this.prisma.adsSyncJob.update({
        where: { id: existingDone.id },
        data: {
          status: AdsSyncJobStatus.QUEUED,
          progressPercent: 0,
          progressMessage: 'Đang xếp hàng Google Ads',
          campaignsSynced: 0,
          attemptCount: 0,
          lastError: null,
          startedAt: null,
          finishedAt: null,
          requestedByUserId: user.id,
          metadata: {
            loginCustomerId: meta.loginCustomerId ?? null,
            incremental: !dto.dateFrom,
          } as Prisma.InputJsonValue,
        },
      });
    } else {
      job = await this.prisma.adsSyncJob.create({
        data: {
          organizationId,
          connectionId: connection.id,
          accountId,
          platform: AdsSyncPlatform.GOOGLE,
          status: AdsSyncJobStatus.QUEUED,
          dateFrom,
          dateTo,
          idempotencyKey,
          maxAttempts,
          requestedByUserId: user.id,
          progressMessage: 'Đang xếp hàng Google Ads',
          metadata: {
            loginCustomerId: meta.loginCustomerId ?? null,
            incremental: !dto.dateFrom,
          },
        },
      });
    }

    const payload: AdsSyncQueuePayload = {
      organizationId,
      connectionId: connection.id,
      accountId,
      dateFrom: dateFromKey,
      dateTo: dateToKey,
      jobId: job.id,
      platform: 'GOOGLE',
    };
    this.assertSafePayload(payload);

    await this.queueEnqueue.add(this.adsSyncQueue, 'ads-sync', payload, {
      jobId: `ads-sync-${job.id}`,
      attempts: maxAttempts,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });

    await this.prisma.adsSyncJob.update({
      where: { id: job.id },
      data: { bullJobId: `ads-sync-${job.id}` },
    });

    await this.audit.log({
      organizationId,
      userId: user.id,
      action: 'ADS_SYNC_QUEUED',
      entityType: 'ADS_SYNC_JOB',
      entityId: job.id,
      metadata: redactForAudit({
        platform: 'GOOGLE',
        accountId,
        dateFrom: dateFromKey,
        dateTo: dateToKey,
        connectionId: connection.id,
      }) as Prisma.InputJsonValue,
    });

    return {
      jobId: job.id,
      status: AdsSyncJobStatus.QUEUED,
      queued: true,
      reused: false,
      message: 'Đã xếp hàng đồng bộ Google Ads',
      progressPercent: 0,
      dateFrom: dateFromKey,
      dateTo: dateToKey,
    };
  }

  async getJob(user: AuthUser, jobId: string) {
    const job = await this.prisma.adsSyncJob.findFirst({
      where: { id: jobId, organizationId: user.organizationId },
    });
    if (!job) throw new NotFoundException('Không tìm thấy tài nguyên');
    return this.toPublic(job);
  }

  async listJobs(user: AuthUser, limit = 20) {
    const items = await this.prisma.adsSyncJob.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { items: items.map((j) => this.toPublic(j)) };
  }

  private toPublic(job: {
    id: string;
    status: AdsSyncJobStatus;
    platform: AdsSyncPlatform;
    accountId: string;
    dateFrom: Date;
    dateTo: Date;
    progressPercent: number;
    progressMessage: string | null;
    campaignsSynced: number;
    attemptCount: number;
    lastError: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: job.id,
      status: job.status,
      platform: job.platform,
      accountId: job.accountId,
      dateFrom: job.dateFrom,
      dateTo: job.dateTo,
      progressPercent: job.progressPercent,
      progressMessage: job.progressMessage,
      campaignsSynced: job.campaignsSynced,
      attemptCount: job.attemptCount,
      lastError: job.lastError,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      createdAt: job.createdAt,
    };
  }

  private assertSafePayload(payload: Record<string, unknown>) {
    const json = JSON.stringify(payload);
    const forbidden = /access[_-]?token|refresh[_-]?token|encrypted|bearer|password|secret/i;
    if (forbidden.test(json)) {
      throw new BadRequestException('Ads sync payload không được chứa credential');
    }
  }

  private parseDateOnly(iso: string): Date {
    const d = new Date(iso.slice(0, 10) + 'T00:00:00.000Z');
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Ngày không hợp lệ');
    return d;
  }
}
