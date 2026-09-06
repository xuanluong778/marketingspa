import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  GoogleAdsAutopilotActionStatus,
  GoogleAdsAutopilotProposalStatus,
  Prisma,
} from '@marketingspa/database';
import {
  AUTOPILOT_OUTCOME_HORIZONS_MS,
  QUEUE_NAMES,
  buildAutopilotActionIdempotencyKey,
  canAutopilotProviderWrite,
  googleAdsAutopilotGuardrailSchema,
  googleAdsAutopilotModeSchema,
  normalizeGoogleCustomerId,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { ADS_AUTOPILOT_QUEUE } from '../queue/queue.constants';
import type {
  ApproveAutopilotProposalDto,
  RejectAutopilotProposalDto,
  UpsertGoogleAdsAutopilotConfigDto,
} from './dto/google-ads-autopilot.dto';
import { decimalToNumber } from './ads-efficiency.util';

@Injectable()
export class GoogleAdsAutopilotService {
  private readonly logger = new Logger(GoogleAdsAutopilotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ADS_AUTOPILOT_QUEUE) private readonly autopilotQueue: Queue,
  ) {}

  async getConfig(user: AuthUser, customerIdRaw: string) {
    const customerId = normalizeGoogleCustomerId(customerIdRaw);
    if (!customerId) throw new BadRequestException('Customer ID không hợp lệ');
    await this.assertCustomerOwned(user.organizationId, customerId);

    const config = await this.prisma.googleAdsAutopilotConfig.findUnique({
      where: { organizationId_customerId: { organizationId: user.organizationId, customerId } },
    });
    return { config: config ? this.toPublicConfig(config) : null };
  }

  async upsertConfig(user: AuthUser, dto: UpsertGoogleAdsAutopilotConfigDto) {
    const customerId = normalizeGoogleCustomerId(dto.customerId);
    if (!customerId) throw new BadRequestException('Customer ID không hợp lệ');
    const account = await this.assertCustomerOwned(user.organizationId, customerId);
    const mode = dto.mode ? googleAdsAutopilotModeSchema.parse(dto.mode) : undefined;

    googleAdsAutopilotGuardrailSchema.parse({
      maxDailyBudget: dto.maxDailyBudget ?? null,
      maxMonthlyBudget: dto.maxMonthlyBudget ?? null,
      maxBudgetIncreasePct: dto.maxBudgetIncreasePct ?? 20,
      maxBudgetDecreasePct: dto.maxBudgetDecreasePct ?? 20,
      targetCpa: dto.targetCpa ?? null,
      targetCpl: dto.targetCpl ?? null,
      targetRoas: dto.targetRoas ?? null,
      stopLossDailySpend: dto.stopLossDailySpend ?? null,
      minSpendForAction: dto.minSpendForAction ?? null,
      minClicksForAction: dto.minClicksForAction ?? null,
      minConversionsForAction: dto.minConversionsForAction ?? null,
      gracePeriodHours: dto.gracePeriodHours ?? 24,
      maxActionsPerDay: dto.maxActionsPerDay ?? 10,
    });

    const data: Prisma.GoogleAdsAutopilotConfigUpsertArgs['create'] = {
      organizationId: user.organizationId,
      customerId,
      loginCustomerId: normalizeGoogleCustomerId(dto.loginCustomerId) || account.loginCustomerId,
      enabled: dto.enabled ?? false,
      mode: mode ?? 'RECOMMEND_ONLY',
      maxDailyBudget: dto.maxDailyBudget,
      maxMonthlyBudget: dto.maxMonthlyBudget,
      maxBudgetIncreasePct: dto.maxBudgetIncreasePct ?? 20,
      maxBudgetDecreasePct: dto.maxBudgetDecreasePct ?? 20,
      targetCpa: dto.targetCpa,
      targetCpl: dto.targetCpl,
      targetRoas: dto.targetRoas,
      stopLossDailySpend: dto.stopLossDailySpend,
      minSpendForAction: dto.minSpendForAction,
      minClicksForAction: dto.minClicksForAction,
      minConversionsForAction: dto.minConversionsForAction,
      gracePeriodHours: dto.gracePeriodHours ?? 24,
      maxActionsPerDay: dto.maxActionsPerDay ?? 10,
      emergencyStop: dto.emergencyStop ?? false,
      writeWhitelistEnabled: dto.writeWhitelistEnabled ?? false,
      cooldownMinutes: dto.cooldownMinutes ?? 60,
      allowAutoPause: dto.allowAutoPause ?? true,
      minRoas: dto.minRoas,
    };

    const config = await this.prisma.googleAdsAutopilotConfig.upsert({
      where: { organizationId_customerId: { organizationId: user.organizationId, customerId } },
      create: data,
      update: {
        ...data,
        organizationId: undefined,
        customerId: undefined,
      },
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'GOOGLE_ADS_AUTOPILOT_CONFIG_UPSERT',
      entityType: 'GoogleAdsAutopilotConfig',
      entityId: config.id,
      metadata: { customerId, enabled: config.enabled, mode: config.mode },
    });

    return { config: this.toPublicConfig(config) };
  }

  async listProposals(user: AuthUser, customerIdRaw: string, status?: string) {
    const customerId = normalizeGoogleCustomerId(customerIdRaw);
    if (!customerId) throw new BadRequestException('Customer ID không hợp lệ');
    await this.assertCustomerOwned(user.organizationId, customerId);

    const items = await this.prisma.googleAdsAutopilotProposal.findMany({
      where: {
        organizationId: user.organizationId,
        customerId,
        ...(status ? { status: status as GoogleAdsAutopilotProposalStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { items: items.map((p) => this.toPublicProposal(p)) };
  }

  async listActions(user: AuthUser, customerIdRaw: string) {
    const customerId = normalizeGoogleCustomerId(customerIdRaw);
    if (!customerId) throw new BadRequestException('Customer ID không hợp lệ');
    await this.assertCustomerOwned(user.organizationId, customerId);

    const items = await this.prisma.googleAdsAutopilotAction.findMany({
      where: { organizationId: user.organizationId, customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { outcomes: true },
    });
    return { items: items.map((a) => this.toPublicAction(a)) };
  }

  async approveProposal(user: AuthUser, proposalId: string, dto: ApproveAutopilotProposalDto) {
    const proposal = await this.requireProposal(user, proposalId);
    if (proposal.status !== GoogleAdsAutopilotProposalStatus.PENDING) {
      throw new BadRequestException(`Proposal status ${proposal.status} không thể duyệt`);
    }

    const config = await this.prisma.googleAdsAutopilotConfig.findUnique({
      where: { id: proposal.configId },
    });
    if (!config) throw new NotFoundException('Autopilot config không tồn tại');

    const providerWrite = canAutopilotProviderWrite({
      customerId: config.customerId,
      writeWhitelistEnabled: config.writeWhitelistEnabled,
    });

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.googleAdsAutopilotProposal.updateMany({
        where: {
          id: proposalId,
          organizationId: user.organizationId,
          status: GoogleAdsAutopilotProposalStatus.PENDING,
        },
        data: {
          status: GoogleAdsAutopilotProposalStatus.APPROVED,
          approvedByUserId: user.id,
          approvedAt: now,
        },
      });

      if (claimed.count === 0) {
        const current = await tx.googleAdsAutopilotProposal.findFirst({
          where: { id: proposalId, organizationId: user.organizationId },
          include: { action: true },
        });
        if (current?.status === GoogleAdsAutopilotProposalStatus.APPROVED && current.action) {
          return { actionId: current.action.id, alreadyApproved: true };
        }
        throw new BadRequestException(
          `Proposal status ${current?.status ?? 'unknown'} không thể duyệt (race/conflict)`,
        );
      }

      const action = await tx.googleAdsAutopilotAction.create({
        data: {
          proposalId: proposal.id,
          configId: config.id,
          organizationId: user.organizationId,
          customerId: config.customerId,
          actionType: proposal.actionType,
          status: GoogleAdsAutopilotActionStatus.PENDING,
          idempotencyKey: buildAutopilotActionIdempotencyKey(proposal.id),
          beforeState: proposal.beforeState as Prisma.InputJsonValue,
          afterState: proposal.afterState as Prisma.InputJsonValue,
          payload: proposal.payload as Prisma.InputJsonValue,
          providerWriteEnabled: providerWrite,
        },
      });

      for (const horizon of ['H24', 'D3', 'D7'] as const) {
        await tx.googleAdsAutopilotOutcome.create({
          data: {
            actionId: action.id,
            organizationId: user.organizationId,
            horizon,
            metricsBefore: proposal.evidence as Prisma.InputJsonValue,
            metricsAfter: {},
            scheduledFor: new Date(now.getTime() + AUTOPILOT_OUTCOME_HORIZONS_MS[horizon]),
          },
        });
      }

      return { actionId: action.id, alreadyApproved: false };
    });

    if (!result.alreadyApproved) {
      await this.autopilotQueue.add(
        'execute-autopilot-action',
        { kind: 'execute', organizationId: user.organizationId, actionId: result.actionId },
        { jobId: `autopilot-exec:${result.actionId}`, removeOnComplete: 100 },
      );
    }

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'GOOGLE_ADS_AUTOPILOT_PROPOSAL_APPROVED',
      entityType: 'GoogleAdsAutopilotProposal',
      entityId: proposalId,
      metadata: { actionId: result.actionId, note: dto.note, alreadyApproved: result.alreadyApproved },
    });

    return {
      proposal: this.toPublicProposal({ ...proposal, status: GoogleAdsAutopilotProposalStatus.APPROVED }),
      actionId: result.actionId,
    };
  }

  async rejectProposal(user: AuthUser, proposalId: string, dto: RejectAutopilotProposalDto) {
    const proposal = await this.requireProposal(user, proposalId);
    if (proposal.status !== GoogleAdsAutopilotProposalStatus.PENDING) {
      throw new BadRequestException(`Proposal status ${proposal.status} không thể từ chối`);
    }

    const updated = await this.prisma.googleAdsAutopilotProposal.update({
      where: { id: proposalId },
      data: {
        status: GoogleAdsAutopilotProposalStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
      },
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'GOOGLE_ADS_AUTOPILOT_PROPOSAL_REJECTED',
      entityType: 'GoogleAdsAutopilotProposal',
      entityId: proposalId,
      metadata: { reason: dto.reason },
    });

    return { proposal: this.toPublicProposal(updated) };
  }

  async triggerScan(user: AuthUser, customerIdRaw: string) {
    const customerId = normalizeGoogleCustomerId(customerIdRaw);
    if (!customerId) throw new BadRequestException('Customer ID không hợp lệ');
    const config = await this.prisma.googleAdsAutopilotConfig.findUnique({
      where: { organizationId_customerId: { organizationId: user.organizationId, customerId } },
    });
    if (!config) throw new NotFoundException('Chưa cấu hình Autopilot cho customer này');

    await this.autopilotQueue.add(
      'scan-autopilot-config',
      { kind: 'scan', organizationId: user.organizationId, configId: config.id },
      { jobId: `autopilot-scan:${config.id}:${Date.now()}`, removeOnComplete: 50 },
    );

    return { queued: true, configId: config.id };
  }

  private async requireProposal(user: AuthUser, proposalId: string) {
    const proposal = await this.prisma.googleAdsAutopilotProposal.findFirst({
      where: { id: proposalId, organizationId: user.organizationId },
    });
    if (!proposal) throw new NotFoundException('Proposal không tồn tại');
    return proposal;
  }

  private async assertCustomerOwned(organizationId: string, customerId: string) {
    const account = await this.prisma.adGoogleAdsAccount.findFirst({
      where: { organizationId, customerId, isSelected: true },
    });
    if (!account) {
      throw new ForbiddenException('Tài khoản Google Ads không thuộc tenant hoặc chưa được chọn');
    }
    return account;
  }

  private toPublicConfig(row: {
    id: string;
    customerId: string;
    loginCustomerId: string | null;
    enabled: boolean;
    mode: string;
    maxDailyBudget: Prisma.Decimal | null;
    maxMonthlyBudget: Prisma.Decimal | null;
    maxBudgetIncreasePct: number;
    maxBudgetDecreasePct: number;
    targetCpa: Prisma.Decimal | null;
    targetCpl: Prisma.Decimal | null;
    targetRoas: Prisma.Decimal | null;
    stopLossDailySpend: Prisma.Decimal | null;
    minSpendForAction: Prisma.Decimal | null;
    minClicksForAction: number | null;
    minConversionsForAction: number | null;
    gracePeriodHours: number;
    maxActionsPerDay: number;
    actionsToday: number;
    emergencyStop: boolean;
    writeWhitelistEnabled: boolean;
    cooldownMinutes: number;
    allowAutoPause: boolean;
    minRoas: Prisma.Decimal | null;
    lastActionAt: Date | null;
    lastScanAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      customerId: row.customerId,
      loginCustomerId: row.loginCustomerId,
      enabled: row.enabled,
      mode: row.mode,
      maxDailyBudget: row.maxDailyBudget ? decimalToNumber(row.maxDailyBudget) : null,
      maxMonthlyBudget: row.maxMonthlyBudget ? decimalToNumber(row.maxMonthlyBudget) : null,
      maxBudgetIncreasePct: row.maxBudgetIncreasePct,
      maxBudgetDecreasePct: row.maxBudgetDecreasePct,
      targetCpa: row.targetCpa ? decimalToNumber(row.targetCpa) : null,
      targetCpl: row.targetCpl ? decimalToNumber(row.targetCpl) : null,
      targetRoas: row.targetRoas ? decimalToNumber(row.targetRoas) : null,
      stopLossDailySpend: row.stopLossDailySpend ? decimalToNumber(row.stopLossDailySpend) : null,
      minSpendForAction: row.minSpendForAction ? decimalToNumber(row.minSpendForAction) : null,
      minClicksForAction: row.minClicksForAction,
      minConversionsForAction: row.minConversionsForAction,
      gracePeriodHours: row.gracePeriodHours,
      maxActionsPerDay: row.maxActionsPerDay,
      actionsToday: row.actionsToday,
      emergencyStop: row.emergencyStop,
      writeWhitelistEnabled: row.writeWhitelistEnabled,
      cooldownMinutes: row.cooldownMinutes,
      allowAutoPause: row.allowAutoPause,
      minRoas: row.minRoas ? decimalToNumber(row.minRoas) : null,
      lastActionAt: row.lastActionAt?.toISOString() ?? null,
      lastScanAt: row.lastScanAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toPublicProposal(row: {
    id: string;
    actionType: string;
    status: string;
    riskLevel: string;
    autoEligible: boolean;
    campaignId: string | null;
    externalCampaignId: string | null;
    keywordText: string | null;
    reason: string | null;
    policyDecision: unknown;
    createdAt: Date;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
  }) {
    return {
      id: row.id,
      actionType: row.actionType,
      status: row.status,
      riskLevel: row.riskLevel,
      autoEligible: row.autoEligible,
      campaignId: row.campaignId,
      externalCampaignId: row.externalCampaignId,
      keywordText: row.keywordText,
      reason: row.reason,
      policyDecision: row.policyDecision,
      createdAt: row.createdAt.toISOString(),
      approvedAt: row.approvedAt?.toISOString() ?? null,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
    };
  }

  private toPublicAction(row: {
    id: string;
    actionType: string;
    status: string;
    providerWriteEnabled: boolean;
    providerResult: unknown;
    lastError: string | null;
    executedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    outcomes: Array<{ horizon: string; verdict: string; evaluatedAt: Date | null }>;
  }) {
    return {
      id: row.id,
      actionType: row.actionType,
      status: row.status,
      providerWriteEnabled: row.providerWriteEnabled,
      providerResult: row.providerResult,
      lastError: row.lastError,
      executedAt: row.executedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      outcomes: row.outcomes.map((o) => ({
        horizon: o.horizon,
        verdict: o.verdict,
        evaluatedAt: o.evaluatedAt?.toISOString() ?? null,
      })),
    };
  }
}
