import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdsActionRequestStatus,
  AdsSyncJobStatus,
  IntegrationProvider,
  OfflineConversionStatus,
  Prisma,
} from '@marketingspa/database';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  ADS_ACTION_QUEUE,
  ADS_SYNC_QUEUE,
  OFFLINE_CONVERSION_QUEUE,
} from '../queue/queue.constants';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import { redactForAudit } from '../common/utils/token-security.util';
import { QUEUE_NAMES } from '@marketingspa/shared';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type {
  AdminAuditQueryDto,
  AdminJobsQueryDto,
  AdminReasonDto,
  AdminUsageQueryDto,
} from './dto/platform-admin.dto';

const WORKER_HEARTBEAT_KEY = 'marketingspa:worker:heartbeat';

@Injectable()
export class PlatformAdminOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly queueEnqueue: QueueEnqueueService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(ADS_SYNC_QUEUE) private readonly adsSyncQueue: Queue,
    @Inject(ADS_ACTION_QUEUE) private readonly adsActionQueue: Queue,
    @Inject(OFFLINE_CONVERSION_QUEUE) private readonly offlineQueue: Queue,
  ) {}

  async listUsage(query: AdminUsageQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.OrganizationWhereInput = {};
    if (query.organizationId) where.id = query.organizationId;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, orgs] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        select: { id: true, name: true, slug: true, email: true, isActive: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const month = new Date().toISOString().slice(0, 7);
    const items = await Promise.all(
      orgs.map(async (org) => {
        const [
          leads,
          posts,
          postsWithImage,
          chatbot,
          adSpend,
          creditWallet,
          creditDebits,
          aiReports,
        ] = await Promise.all([
          this.prisma.lead.count({ where: { organizationId: org.id } }),
          this.prisma.autoPost.count({ where: { organizationId: org.id } }),
          this.prisma.autoPost.count({
            where: { organizationId: org.id, imageUrl: { not: null } },
          }),
          this.prisma.chatbotUsage.aggregate({
            where: { organizationId: org.id, month },
            _sum: { aiReplies: true, creditsUsed: true },
          }),
          this.prisma.adInsight.aggregate({
            where: { organizationId: org.id },
            _sum: { spend: true },
          }),
          this.prisma.creditWallet.findUnique({ where: { organizationId: org.id } }),
          this.prisma.creditTransaction.aggregate({
            where: { organizationId: org.id, type: 'DEBIT' },
            _sum: { amount: true },
          }),
          this.prisma.aiReport.count({ where: { organizationId: org.id } }),
        ]);

        const aiReplies = chatbot._sum.aiReplies ?? 0;
        const chatbotCredits = chatbot._sum.creditsUsed ?? 0;
        const adsSpend = Number(adSpend._sum.spend ?? 0);
        const creditCost = Number(creditDebits._sum.amount ?? 0);

        return {
          organizationId: org.id,
          organization: org,
          month,
          usage: {
            ai: { replies: aiReplies, reports: aiReports, chatbotCredits },
            posts,
            images: postsWithImage,
            chatbot: { aiReplies, creditsUsed: chatbotCredits },
            leads,
            ads: { spend: adsSpend },
            cost: {
              creditDebits: creditCost,
              creditBalance: Number(creditWallet?.balance ?? 0),
              adsSpend,
            },
          },
        };
      }),
    );

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
  }

  async integrationsHealth() {
    const sepayConfigured = !!(
      this.config.get<string>('SEPAY_API_TOKEN')?.trim() ||
      this.config.get<string>('SEPAY_WEBHOOK_SECRET')?.trim()
    );

    let redisOk = false;
    let workerOk = false;
    try {
      redisOk = (await this.redis.ping()) === 'PONG';
      if (redisOk) {
        const hb = await this.redis.get(WORKER_HEARTBEAT_KEY);
        if (hb) {
          const age = Date.now() - parseInt(hb, 10);
          workerOk = !Number.isNaN(age) && age < 120_000;
        }
      }
    } catch {
      redisOk = false;
      workerOk = false;
    }

    const queues = [
      { key: 'ADS_SYNC', queue: this.adsSyncQueue, name: QUEUE_NAMES.ADS_SYNC },
      { key: 'ADS_ACTION', queue: this.adsActionQueue, name: QUEUE_NAMES.ADS_ACTION },
      {
        key: 'OFFLINE_CONVERSION',
        queue: this.offlineQueue,
        name: QUEUE_NAMES.OFFLINE_CONVERSION,
      },
    ];

    const bullmq = await Promise.all(
      queues.map(async (q) => {
        try {
          const counts = await q.queue.getJobCounts(
            'waiting',
            'active',
            'completed',
            'failed',
            'delayed',
          );
          return {
            key: q.key,
            name: q.name,
            ok: true,
            counts,
          };
        } catch (e) {
          return {
            key: q.key,
            name: q.name,
            ok: false,
            error: e instanceof Error ? e.message : 'queue_error',
            counts: null,
          };
        }
      }),
    );

    const [integrations, adConnections, messaging] = await Promise.all([
      this.prisma.integration.groupBy({
        by: ['provider', 'status'],
        _count: { _all: true },
      }),
      this.prisma.adConnection.groupBy({
        by: ['provider', 'status'],
        _count: { _all: true },
      }),
      this.prisma.messagingChannelConnection.groupBy({
        by: ['channel', 'status'],
        _count: { _all: true },
      }),
    ]);

    const fold = (
      rows: Array<{ key: string; status: string; count: number }>,
    ): Record<string, Record<string, number>> => {
      const map: Record<string, Record<string, number>> = {};
      for (const r of rows) {
        const bucket = map[r.key] ?? (map[r.key] = {});
        bucket[r.status] = (bucket[r.status] ?? 0) + r.count;
      }
      return map;
    };

    const byIntegrationProvider = fold(
      integrations.map((i) => ({
        key: i.provider,
        status: i.status,
        count: i._count._all,
      })),
    );
    const byAdProvider = fold(
      adConnections.map((a) => ({
        key: String(a.provider),
        status: String(a.status),
        count: a._count._all,
      })),
    );
    const byMessagingChannel = fold(
      messaging.map((m) => ({
        key: String(m.channel),
        status: String(m.status),
        count: m._count._all,
      })),
    );

    return {
      sepay: {
        configured: sepayConfigured,
        // Không trả token/secret — chỉ trạng thái cấu hình
        authModes: ['API_KEY', 'HMAC'],
      },
      redis: { ok: redisOk },
      worker: { ok: workerOk },
      bullmq,
      meta: {
        integrations: byIntegrationProvider[IntegrationProvider.META_ADS] ?? {},
        adConnections: byAdProvider.META ?? {},
        messaging: byMessagingChannel.MESSENGER ?? {},
      },
      google: {
        integrations: byIntegrationProvider[IntegrationProvider.GOOGLE_ADS] ?? {},
        adConnections: byAdProvider.GOOGLE ?? {},
      },
      zalo: {
        integrations: byIntegrationProvider[IntegrationProvider.ZALO_OA] ?? {},
        messaging: byMessagingChannel.ZALO ?? {},
      },
      counts: {
        integrations: byIntegrationProvider,
        adConnections: byAdProvider,
        messaging: byMessagingChannel,
      },
    };
  }

  async listFailedJobs(query: AdminJobsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const type = query.type || 'all';

    const [adsSync, adsAction, offline] = await Promise.all([
      type === 'all' || type === 'ads_sync'
        ? this.prisma.adsSyncJob.findMany({
            where: {
              status: AdsSyncJobStatus.FAILED,
              ...(query.organizationId ? { organizationId: query.organizationId } : {}),
            },
            orderBy: { updatedAt: 'desc' },
            take: pageSize,
            select: {
              id: true,
              organizationId: true,
              platform: true,
              status: true,
              attemptCount: true,
              maxAttempts: true,
              lastError: true,
              bullJobId: true,
              createdAt: true,
              updatedAt: true,
              organization: { select: { id: true, name: true, slug: true } },
            },
          })
        : Promise.resolve([]),
      type === 'all' || type === 'ads_action'
        ? this.prisma.adsActionRequest.findMany({
            where: {
              status: AdsActionRequestStatus.FAILED,
              ...(query.organizationId ? { organizationId: query.organizationId } : {}),
            },
            orderBy: { updatedAt: 'desc' },
            take: pageSize,
            select: {
              id: true,
              organizationId: true,
              platform: true,
              actionType: true,
              status: true,
              attemptCount: true,
              maxAttempts: true,
              lastError: true,
              bullJobId: true,
              createdAt: true,
              updatedAt: true,
              organization: { select: { id: true, name: true, slug: true } },
            },
          })
        : Promise.resolve([]),
      type === 'all' || type === 'offline_conversion'
        ? this.prisma.offlineConversionJob.findMany({
            where: {
              status: OfflineConversionStatus.FAILED,
              ...(query.organizationId ? { organizationId: query.organizationId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: pageSize,
            select: {
              id: true,
              organizationId: true,
              provider: true,
              status: true,
              attemptCount: true,
              lastError: true,
              createdAt: true,
              organization: { select: { id: true, name: true, slug: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const items = [
      ...adsSync.map((j) => ({
        type: 'ads_sync' as const,
        id: j.id,
        organizationId: j.organizationId,
        organization: j.organization,
        status: j.status,
        attemptCount: j.attemptCount,
        maxAttempts: j.maxAttempts,
        lastError: j.lastError,
        bullJobId: j.bullJobId,
        platform: j.platform,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
        retryable: true,
      })),
      ...adsAction.map((j) => ({
        type: 'ads_action' as const,
        id: j.id,
        organizationId: j.organizationId,
        organization: j.organization,
        status: j.status,
        attemptCount: j.attemptCount,
        maxAttempts: j.maxAttempts,
        lastError: j.lastError,
        bullJobId: j.bullJobId,
        platform: j.platform,
        actionType: j.actionType,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
        retryable: true,
      })),
      ...offline.map((j) => ({
        type: 'offline_conversion' as const,
        id: j.id,
        organizationId: j.organizationId,
        organization: j.organization,
        status: j.status,
        attemptCount: j.attemptCount,
        maxAttempts: null,
        lastError: j.lastError,
        bullJobId: null,
        provider: j.provider,
        createdAt: j.createdAt,
        updatedAt: j.createdAt,
        retryable: true,
      })),
    ].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));

    // Lightweight paging over merged list
    const sliced = items.slice((page - 1) * pageSize, page * pageSize);
    return {
      items: sliced,
      total: items.length,
      page,
      pageSize,
      totalPages: Math.ceil(items.length / pageSize) || 1,
    };
  }

  async retryJob(
    actor: AuthUser,
    type: string,
    id: string,
    dto: AdminReasonDto,
    ipAddress?: string,
  ) {
    if (!['ads_sync', 'ads_action', 'offline_conversion'].includes(type)) {
      throw new BadRequestException('Loại job không hỗ trợ retry');
    }

    if (type === 'ads_sync') {
      const job = await this.prisma.adsSyncJob.findUnique({ where: { id } });
      if (!job) throw new NotFoundException('Không tìm thấy ads_sync job');
      if (job.status !== AdsSyncJobStatus.FAILED) {
        throw new BadRequestException('Chỉ retry job FAILED');
      }
      const before = {
        status: job.status,
        attemptCount: job.attemptCount,
        lastError: job.lastError,
      };

      const updated = await this.prisma.adsSyncJob.update({
        where: { id },
        data: {
          status: AdsSyncJobStatus.QUEUED,
          progressPercent: 0,
          progressMessage: 'Admin retry',
          lastError: null,
          startedAt: null,
          finishedAt: null,
          attemptCount: 0,
        },
      });

      const dateFrom = job.dateFrom.toISOString().slice(0, 10);
      const dateTo = job.dateTo.toISOString().slice(0, 10);
      const payload = {
        organizationId: job.organizationId,
        connectionId: job.connectionId,
        accountId: job.accountId,
        dateFrom,
        dateTo,
        jobId: job.id,
        platform: job.platform === 'GOOGLE' ? 'GOOGLE' : 'META',
      };
      // Remove old bull job id collision
      try {
        const old = await this.adsSyncQueue.getJob(`ads-sync-${job.id}`);
        if (old) await old.remove();
      } catch {
        /* ignore */
      }
      await this.queueEnqueue.add(this.adsSyncQueue, 'ads-sync', payload, {
        jobId: `ads-sync-${job.id}`,
        attempts: job.maxAttempts,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      });

      await this.audit.log({
        organizationId: job.organizationId,
        userId: actor.id,
        action: 'ADMIN_JOB_RETRY',
        entityType: 'ADS_SYNC_JOB',
        entityId: id,
        ipAddress,
        metadata: {
          reason: dto.reason,
          result: 'queued',
          before,
          after: { status: updated.status, attemptCount: updated.attemptCount },
          type,
        },
      });

      return { result: 'queued', type, id, before, after: { status: updated.status } };
    }

    if (type === 'ads_action') {
      const job = await this.prisma.adsActionRequest.findUnique({ where: { id } });
      if (!job) throw new NotFoundException('Không tìm thấy ads_action');
      if (job.status !== AdsActionRequestStatus.FAILED) {
        throw new BadRequestException('Chỉ retry job FAILED');
      }
      const before = {
        status: job.status,
        attemptCount: job.attemptCount,
        lastError: job.lastError,
      };
      try {
        const old = await this.adsActionQueue.getJob(`ads-action:${job.id}`);
        if (old) await old.remove();
      } catch {
        /* ignore */
      }
      const payload = {
        organizationId: job.organizationId,
        actionRequestId: job.id,
      };
      const bull = await this.adsActionQueue.add('ads-action-execute', payload, {
        jobId: `ads-action:${job.id}`,
        attempts: job.maxAttempts,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
      const updated = await this.prisma.adsActionRequest.update({
        where: { id },
        data: {
          status: AdsActionRequestStatus.QUEUED,
          lastError: null,
          bullJobId: String(bull.id),
          attemptCount: 0,
        },
      });
      await this.audit.log({
        organizationId: job.organizationId,
        userId: actor.id,
        action: 'ADMIN_JOB_RETRY',
        entityType: 'ADS_ACTION_REQUEST',
        entityId: id,
        ipAddress,
        metadata: {
          reason: dto.reason,
          result: 'queued',
          before,
          after: { status: updated.status, bullJobId: updated.bullJobId },
          type,
        },
      });
      return { result: 'queued', type, id, before, after: { status: updated.status } };
    }

    // offline_conversion
    const job = await this.prisma.offlineConversionJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Không tìm thấy offline conversion job');
    if (job.status !== OfflineConversionStatus.FAILED) {
      throw new BadRequestException('Chỉ retry job FAILED');
    }
    const before = {
      status: job.status,
      attemptCount: job.attemptCount,
      lastError: job.lastError,
    };
    const updated = await this.prisma.offlineConversionJob.update({
      where: { id },
      data: {
        status: OfflineConversionStatus.PENDING,
        lastError: null,
        nextRetryAt: new Date(),
      },
    });
    try {
      const old = await this.offlineQueue.getJob(`offline-conv-${job.id}`);
      if (old) await old.remove();
    } catch {
      /* ignore */
    }
    await this.queueEnqueue.add(
      this.offlineQueue,
      'send-offline-conversion',
      { organizationId: job.organizationId, jobId: job.id },
      {
        jobId: `offline-conv-${job.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    );
    await this.audit.log({
      organizationId: job.organizationId,
      userId: actor.id,
      action: 'ADMIN_JOB_RETRY',
      entityType: 'OFFLINE_CONVERSION_JOB',
      entityId: id,
      ipAddress,
      metadata: {
        reason: dto.reason,
        result: 'queued',
        before,
        after: { status: updated.status },
        type,
      },
    });
    return { result: 'queued', type, id, before, after: { status: updated.status } };
  }

  async listAuditLogs(query: AdminAuditQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AuditLogWhereInput = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.action?.trim()) where.action = { contains: query.action.trim(), mode: 'insensitive' };
    if (query.entityType?.trim()) where.entityType = query.entityType.trim();
    if (query.entityId?.trim()) where.entityId = query.entityId.trim();
    if (query.userId?.trim()) where.userId = query.userId.trim();
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { action: { contains: q, mode: 'insensitive' } },
        { entityType: { contains: q, mode: 'insensitive' } },
        { entityId: { contains: q } },
      ];
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true, role: { select: { code: true } } } },
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((r) => {
        const meta = (redactForAudit(r.metadata ?? {}) || {}) as Record<string, unknown>;
        return {
          id: r.id,
          createdAt: r.createdAt,
          ipAddress: r.ipAddress,
          requestId: r.requestId,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          organizationId: r.organizationId,
          organization: r.organization,
          admin: r.user
            ? {
                id: r.user.id,
                email: r.user.email,
                name: r.user.name,
                role: r.user.role.code,
              }
            : null,
          reason: typeof meta.reason === 'string' ? meta.reason : meta.note ?? null,
          before: meta.before ?? null,
          after: meta.after ?? null,
          result: meta.result ?? null,
          metadata: meta,
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }
}
