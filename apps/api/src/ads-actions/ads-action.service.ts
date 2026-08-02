import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  AdsActionRequestStatus,
  AdsActionSource,
  AdsActionType,
  AdPlatform,
  Prisma,
} from '@marketingspa/database';
import {
  assertApproverAllowed,
  adsActionApproveSchema,
  adsActionProposeSchema,
  adsActionPublicSchema,
  adsActionQueuePayloadSchema,
  adsActionRejectSchema,
  isAdsActionsLive,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ADS_ACTION_QUEUE } from '../queue/queue.constants';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { assertNoCredentialLeak } from '../common/utils/token-security.util';
import { decimalToNumber } from '../ai-ads-manager/ads-efficiency.util';

@Injectable()
export class AdsActionService {
  private readonly logger = new Logger(AdsActionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(ADS_ACTION_QUEUE) private readonly actionQueue: Queue,
  ) {}

  /** Kill-switch: ADS_ACTIONS_LIVE=false tắt toàn bộ write action. */
  writeActionsEnabled(): boolean {
    return isAdsActionsLive({
      ADS_ACTIONS_LIVE: this.config.get<string>('ADS_ACTIONS_LIVE'),
    });
  }

  providerWriteEnabled(): boolean {
    return (
      this.writeActionsEnabled() &&
      String(this.config.get('ADS_ACTIONS_PROVIDER_WRITE') ?? 'false').toLowerCase() === 'true'
    );
  }

  async list(user: AuthUser, status?: string, limit = 40) {
    const items = await this.prisma.adsActionRequest.findMany({
      where: {
        organizationId: user.organizationId,
        ...(status ? { status: status as AdsActionRequestStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    const payload = {
      items: items.map((r) => this.toPublic(r)),
      writeActionsEnabled: this.writeActionsEnabled(),
    };
    assertNoCredentialLeak(payload);
    return payload;
  }

  async get(user: AuthUser, id: string) {
    const row = await this.prisma.adsActionRequest.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy AdsActionRequest');
    const payload = this.toPublic(row);
    assertNoCredentialLeak(payload);
    return payload;
  }

  /**
   * AI / human / rule đề xuất — tạo DRAFT với before/after.
   * AI không được approve tại đây.
   */
  async propose(
    user: AuthUser,
    input: {
      campaignId?: string;
      draftId?: string;
      recommendationId?: string;
      platform: AdPlatform | string;
      actionType: AdsActionType | string;
      source?: AdsActionSource | string;
      beforeState: Record<string, unknown>;
      afterState: Record<string, unknown>;
      payload?: Record<string, unknown>;
      evidence?: Record<string, unknown>;
      reason?: string;
      budgetLimit?: number;
      proposedBudget?: number;
      idempotencyKey: string;
      aiGenerated?: boolean;
      submitForApproval?: boolean;
    },
  ) {
    const parsed = adsActionProposeSchema.parse({
      organizationId: user.organizationId,
      requestedByUserId: user.id,
      campaignId: input.campaignId,
      draftId: input.draftId,
      recommendationId: input.recommendationId,
      platform: input.platform,
      actionType: input.actionType,
      source: input.source ?? (input.aiGenerated ? 'AI' : 'HUMAN'),
      beforeState: input.beforeState,
      afterState: input.afterState,
      payload: input.payload ?? {},
      evidence: input.evidence ?? {},
      reason: input.reason,
      budgetLimit: input.budgetLimit,
      proposedBudget: input.proposedBudget,
      idempotencyKey: input.idempotencyKey,
      aiGenerated: input.aiGenerated ?? input.source === 'AI',
    });

    await this.assertBudgetWithinLimit(user, parsed.proposedBudget, parsed.budgetLimit);

    const existing = await this.prisma.adsActionRequest.findUnique({
      where: { idempotencyKey: parsed.idempotencyKey },
    });
    if (existing) {
      if (existing.organizationId !== user.organizationId) {
        throw new ForbiddenException('Idempotency key thuộc org khác');
      }
      return this.toPublic(existing);
    }

    const status = input.submitForApproval
      ? AdsActionRequestStatus.PENDING_APPROVAL
      : AdsActionRequestStatus.DRAFT;

    const row = await this.prisma.adsActionRequest.create({
      data: {
        organizationId: parsed.organizationId,
        requestedByUserId: parsed.requestedByUserId,
        campaignId: parsed.campaignId,
        draftId: parsed.draftId,
        recommendationId: parsed.recommendationId,
        platform: parsed.platform as AdPlatform,
        actionType: parsed.actionType as AdsActionType,
        source: parsed.source as AdsActionSource,
        status,
        beforeState: parsed.beforeState as Prisma.InputJsonValue,
        afterState: parsed.afterState as Prisma.InputJsonValue,
        payload: parsed.payload as Prisma.InputJsonValue,
        evidence: parsed.evidence as Prisma.InputJsonValue,
        reason: parsed.reason,
        budgetLimit: parsed.budgetLimit,
        proposedBudget: parsed.proposedBudget,
        idempotencyKey: parsed.idempotencyKey,
        aiGenerated: parsed.aiGenerated,
        providerWriteEnabled: false,
        submittedAt: input.submitForApproval ? new Date() : null,
      },
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'ADS_ACTION_PROPOSED',
      entityType: 'AdsActionRequest',
      entityId: row.id,
      metadata: {
        actionType: row.actionType,
        source: row.source,
        status: row.status,
        aiGenerated: row.aiGenerated,
      },
    });

    return this.toPublic(row);
  }

  async submitForApproval(user: AuthUser, id: string) {
    const row = await this.requireOwned(user, id);
    if (
      row.status !== AdsActionRequestStatus.DRAFT &&
      row.status !== AdsActionRequestStatus.PROPOSED
    ) {
      throw new BadRequestException('Chỉ DRAFT/PROPOSED mới submit phê duyệt');
    }
    const updated = await this.prisma.adsActionRequest.update({
      where: { id },
      data: {
        status: AdsActionRequestStatus.PENDING_APPROVAL,
        submittedAt: new Date(),
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'ADS_ACTION_SUBMITTED',
      entityType: 'AdsActionRequest',
      entityId: id,
    });
    return this.toPublic(updated);
  }

  /**
   * Phê duyệt — bắt buộc ads.manage.
   * AI/RULE: approver ≠ requester.
   * Feature flag tắt → không enqueue write.
   */
  async approve(user: AuthUser, id: string) {
    const row = await this.requireOwned(user, id);
    adsActionApproveSchema.parse({
      organizationId: user.organizationId,
      actionRequestId: id,
      approvedByUserId: user.id,
    });

    if (row.status !== AdsActionRequestStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Chỉ PENDING_APPROVAL mới được phê duyệt');
    }

    try {
      assertApproverAllowed({
        source: row.source,
        aiGenerated: row.aiGenerated,
        requestedByUserId: row.requestedByUserId,
        approvedByUserId: user.id,
      });
    } catch (err) {
      throw new ForbiddenException(err instanceof Error ? err.message : 'Không được tự phê duyệt');
    }

    await this.assertBudgetWithinLimit(
      user,
      row.proposedBudget != null ? decimalToNumber(row.proposedBudget) : undefined,
      row.budgetLimit != null ? decimalToNumber(row.budgetLimit) : undefined,
    );

    if (!this.writeActionsEnabled()) {
      const skipped = await this.prisma.adsActionRequest.update({
        where: { id },
        data: {
          status: AdsActionRequestStatus.SKIPPED_DISABLED,
          approvedByUserId: user.id,
          approvedAt: new Date(),
          lastError: 'ADS_ACTIONS_LIVE=false — write action bị tắt',
          result: {
            skipped: true,
            reason: 'feature_flag_disabled',
            providerWrite: false,
          } as Prisma.InputJsonValue,
        },
      });
      await this.audit.log({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'ADS_ACTION_SKIPPED_DISABLED',
        entityType: 'AdsActionRequest',
        entityId: id,
      });
      return this.toPublic(skipped);
    }

    const approved = await this.prisma.adsActionRequest.update({
      where: { id },
      data: {
        status: AdsActionRequestStatus.APPROVED,
        approvedByUserId: user.id,
        approvedAt: new Date(),
        providerWriteEnabled: this.providerWriteEnabled(),
      },
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'ADS_ACTION_APPROVED',
      entityType: 'AdsActionRequest',
      entityId: id,
      metadata: { approvedByUserId: user.id, requestedByUserId: row.requestedByUserId },
    });

    return this.enqueue(user, approved.id);
  }

  /**
   * MCP AUTO: queue trong giới hạn — không cần người duyệt thứ hai.
   * Tôn trọng ADS_ACTIONS_LIVE + budget. Không ENABLE campaign.
   */
  async systemAutoApproveForMcp(
    organizationId: string,
    actionRequestId: string,
    requestedByUserId: string,
  ) {
    const row = await this.prisma.adsActionRequest.findFirst({
      where: { id: actionRequestId, organizationId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy AdsActionRequest');
    if (row.requestedByUserId !== requestedByUserId) {
      throw new ForbiddenException('Ownership mismatch');
    }
    if (
      row.status !== AdsActionRequestStatus.PENDING_APPROVAL &&
      row.status !== AdsActionRequestStatus.DRAFT &&
      row.status !== AdsActionRequestStatus.PROPOSED
    ) {
      return this.toPublic(row);
    }

    if (row.actionType === AdsActionType.ENABLE_CAMPAIGN) {
      throw new BadRequestException('MCP AUTO không được tự bật lại quảng cáo');
    }

    await this.assertBudgetWithinLimit(
      { organizationId, id: requestedByUserId } as AuthUser,
      row.proposedBudget != null ? decimalToNumber(row.proposedBudget) : undefined,
      row.budgetLimit != null ? decimalToNumber(row.budgetLimit) : undefined,
    );

    if (!this.writeActionsEnabled()) {
      const skipped = await this.prisma.adsActionRequest.update({
        where: { id: actionRequestId },
        data: {
          status: AdsActionRequestStatus.SKIPPED_DISABLED,
          approvedAt: new Date(),
          lastError: 'ADS_ACTIONS_LIVE=false — MCP AUTO bỏ qua write',
          result: { skipped: true, reason: 'feature_flag_disabled', actor: 'MCP_AUTO' },
        },
      });
      return this.toPublic(skipped);
    }

    await this.prisma.adsActionRequest.update({
      where: { id: actionRequestId },
      data: {
        status: AdsActionRequestStatus.APPROVED,
        approvedAt: new Date(),
        providerWriteEnabled: this.providerWriteEnabled(),
        reason: `${row.reason ?? ''} [MCP_AUTO]`.trim(),
      },
    });

    await this.audit.log({
      organizationId,
      userId: requestedByUserId,
      action: 'ADS_ACTION_MCP_AUTO_APPROVED',
      entityType: 'AdsActionRequest',
      entityId: actionRequestId,
      metadata: { actor: 'MCP_AUTO', actionType: row.actionType },
    });

    return this.enqueue(
      { organizationId, id: requestedByUserId } as AuthUser,
      actionRequestId,
    );
  }

  async reject(user: AuthUser, id: string, rejectionReason: string) {
    const row = await this.requireOwned(user, id);
    adsActionRejectSchema.parse({
      organizationId: user.organizationId,
      actionRequestId: id,
      rejectedByUserId: user.id,
      rejectionReason,
    });

    if (
      row.status !== AdsActionRequestStatus.PENDING_APPROVAL &&
      row.status !== AdsActionRequestStatus.DRAFT
    ) {
      throw new BadRequestException('Không thể từ chối ở trạng thái hiện tại');
    }

    const updated = await this.prisma.adsActionRequest.update({
      where: { id },
      data: {
        status: AdsActionRequestStatus.REJECTED,
        approvedByUserId: user.id,
        rejectionReason,
        approvedAt: new Date(),
      },
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'ADS_ACTION_REJECTED',
      entityType: 'AdsActionRequest',
      entityId: id,
      metadata: { rejectionReason },
    });

    return this.toPublic(updated);
  }

  private async enqueue(user: AuthUser, actionRequestId: string) {
    const payload = adsActionQueuePayloadSchema.parse({
      organizationId: user.organizationId,
      actionRequestId,
    });
    this.assertSafePayload(payload);

    const job = await this.actionQueue.add('ads-action-execute', payload, {
      jobId: `ads-action:${actionRequestId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    const updated = await this.prisma.adsActionRequest.update({
      where: { id: actionRequestId },
      data: {
        status: AdsActionRequestStatus.QUEUED,
        bullJobId: String(job.id),
      },
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'ADS_ACTION_QUEUED',
      entityType: 'AdsActionRequest',
      entityId: actionRequestId,
      metadata: { bullJobId: String(job.id) },
    });

    this.logger.log(`Queued AdsActionRequest ${actionRequestId} job=${job.id}`);
    return this.toPublic(updated);
  }

  private async assertBudgetWithinLimit(
    user: AuthUser,
    proposedBudget?: number,
    explicitLimit?: number,
  ) {
    if (proposedBudget == null) return;
    const settings = await this.prisma.adManagerSettings.findFirst({
      where: { organizationId: user.organizationId },
      orderBy: { updatedAt: 'desc' },
    });
    const limit =
      explicitLimit ??
      (settings?.dailyBudgetLimit != null ? decimalToNumber(settings.dailyBudgetLimit) : undefined);
    if (limit != null && proposedBudget > limit) {
      throw new BadRequestException(`Ngân sách đề xuất ${proposedBudget} vượt giới hạn ${limit}`);
    }
  }

  private async requireOwned(user: AuthUser, id: string) {
    const row = await this.prisma.adsActionRequest.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy AdsActionRequest');
    return row;
  }

  private assertSafePayload(payload: Record<string, unknown>) {
    const json = JSON.stringify(payload);
    if (/access[_-]?token|refresh[_-]?token|encrypted|bearer|password|secret/i.test(json)) {
      throw new BadRequestException('Ads action payload không được chứa credential');
    }
  }

  toPublic(row: {
    id: string;
    organizationId: string;
    requestedByUserId: string;
    approvedByUserId: string | null;
    campaignId: string | null;
    platform: AdPlatform;
    actionType: AdsActionType;
    source: AdsActionSource;
    status: AdsActionRequestStatus;
    beforeState: unknown;
    afterState: unknown;
    payload: unknown;
    evidence: unknown;
    result: unknown;
    reason: string | null;
    rejectionReason: string | null;
    budgetLimit: Prisma.Decimal | null;
    proposedBudget: Prisma.Decimal | null;
    idempotencyKey: string;
    aiGenerated: boolean;
    providerWriteEnabled: boolean;
    proposedAt: Date;
    submittedAt: Date | null;
    approvedAt: Date | null;
    executedAt: Date | null;
    verifiedAt: Date | null;
    createdAt: Date;
    lastError?: string | null;
  }) {
    const pub = adsActionPublicSchema.parse({
      id: row.id,
      organizationId: row.organizationId,
      requestedByUserId: row.requestedByUserId,
      approvedByUserId: row.approvedByUserId,
      campaignId: row.campaignId,
      platform: row.platform,
      actionType: row.actionType,
      source: row.source,
      status: row.status,
      beforeState: row.beforeState,
      afterState: row.afterState,
      payload: row.payload ?? {},
      evidence: row.evidence ?? {},
      result: row.result,
      reason: row.reason,
      rejectionReason: row.rejectionReason,
      budgetLimit: row.budgetLimit != null ? decimalToNumber(row.budgetLimit) : null,
      proposedBudget: row.proposedBudget != null ? decimalToNumber(row.proposedBudget) : null,
      idempotencyKey: row.idempotencyKey,
      aiGenerated: row.aiGenerated,
      providerWriteEnabled: row.providerWriteEnabled,
      proposedAt: row.proposedAt.toISOString(),
      submittedAt: row.submittedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      executedAt: row.executedAt?.toISOString() ?? null,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    });
    return { ...pub, lastError: row.lastError ?? null };
  }
}
