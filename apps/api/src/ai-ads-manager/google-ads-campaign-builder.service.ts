import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  AdConnectionProvider,
  AdConnectionStatus,
  GoogleAdsCampaignDeployStatus,
  GoogleAdsCampaignDraftStatus,
  Prisma,
} from '@marketingspa/database';
import {
  CREDIT_FEATURE_CODES,
  QUEUE_NAMES,
  campaignBuilderIdempotencyKey,
  createDryRunMutatePort,
  deploymentIdempotencyKey,
  executeGoogleAdsCampaignPlan,
  googleAdsCampaignBriefSchema,
  googleAdsStructuredDraftSchema,
  isAdsActionsLive,
  mergeStructuredDraft,
  normalizeGoogleCustomerId,
  parsePublicHttpUrl,
  resolveDailyBudget,
  validateCampaignBudgetLimit,
  validateStructuredDraftForPublish,
  type CreatedGoogleAdsResources,
  type GoogleAdsCampaignBrief,
  type GoogleAdsStructuredDraft,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AdConnectionFacade } from '../ad-performance/ad-connection.facade';
import { GoogleAdsApiService } from '../ad-performance/google-ads/google-ads-api.service';
import { OpenAiService } from '../openai/openai.service';
import { CreditService } from '../credit/credit.service';
import { decimalToNumber } from './ads-efficiency.util';
import { ADS_CAMPAIGN_DEPLOY_QUEUE } from '../queue/queue.constants';
import type { CreateGoogleAdsCampaignDraftDto } from './dto/google-ads-campaign-builder.dto';
import { randomUUID } from 'crypto';

/**
 * LLM / draft / approval / preflight only.
 * Does not call Google Ads mutate endpoints — worker executes deploy.
 */
@Injectable()
export class GoogleAdsCampaignBuilderService {
  private readonly logger = new Logger(GoogleAdsCampaignBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly connections: AdConnectionFacade,
    private readonly googleApi: GoogleAdsApiService,
    private readonly openAi: OpenAiService,
    private readonly credit: CreditService,
    private readonly audit: AuditService,
    @Inject(ADS_CAMPAIGN_DEPLOY_QUEUE) private readonly deployQueue: Queue,
  ) {}

  async listDrafts(user: AuthUser) {
    const items = await this.prisma.googleAdsCampaignDraft.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { deployments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return { items: items.map((d) => this.toPublic(d)) };
  }

  async getDraft(user: AuthUser, id: string) {
    return this.toPublic(await this.requireDraft(user, id));
  }

  async createDraft(user: AuthUser, dto: CreateGoogleAdsCampaignDraftDto) {
    const brief = googleAdsCampaignBriefSchema.parse(dto.brief);
    const customerId = normalizeGoogleCustomerId(dto.customerId);
    if (!customerId) throw new BadRequestException('Customer ID không hợp lệ');
    const loginCustomerId = normalizeGoogleCustomerId(dto.loginCustomerId) || null;

    const url = parsePublicHttpUrl(brief.landingPage);
    if (!url) {
      throw new BadRequestException(
        'Website/Landing page phải là URL http(s) công khai, không dùng localhost',
      );
    }

    const budget = resolveDailyBudget(brief);
    if (!budget.ok) throw new BadRequestException(budget.errors.join('; '));

    const settings = await this.prisma.adManagerSettings.findUnique({
      where: { userId: user.id },
    });
    const limit = settings?.dailyBudgetLimit ? decimalToNumber(settings.dailyBudgetLimit) : null;
    const limitError = validateCampaignBudgetLimit(budget.dailyAmount, limit);
    if (limitError) throw new BadRequestException(limitError);

    const account = await this.prisma.adGoogleAdsAccount.findFirst({
      where: { organizationId: user.organizationId, customerId, isSelected: true },
    });
    if (!account) {
      throw new BadRequestException('Chọn tài khoản Google Ads trước khi tạo chiến dịch');
    }

    const idempotencyKey = campaignBuilderIdempotencyKey({
      organizationId: user.organizationId,
      customerId,
      brief,
    });
    const existing = await this.prisma.googleAdsCampaignDraft.findUnique({
      where: { idempotencyKey },
      include: { deployments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (existing && existing.organizationId === user.organizationId) {
      return this.toPublic(existing);
    }

    const structured = await this.generateStructuredDraft(user, brief, budget);

    const row = await this.prisma.googleAdsCampaignDraft.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        customerId,
        loginCustomerId: loginCustomerId || account.loginCustomerId,
        status: GoogleAdsCampaignDraftStatus.DRAFT,
        brief: brief as unknown as Prisma.InputJsonValue,
        structuredDraft: structured as unknown as Prisma.InputJsonValue,
        validation: {
          budget,
          url: url.toString(),
        } as Prisma.InputJsonValue,
        dailyBudget: budget.dailyAmount,
        monthlyEstimate: budget.monthlyEstimate,
        currency: budget.currency,
        idempotencyKey,
      },
      include: { deployments: true },
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'GOOGLE_ADS_CAMPAIGN_DRAFT_CREATED',
      entityType: 'GoogleAdsCampaignDraft',
      entityId: row.id,
      metadata: { customerId, campaignName: structured.campaignName },
    });

    return this.toPublic(row);
  }

  async preview(user: AuthUser, id: string) {
    const draft = await this.requireDraft(user, id);
    const structured = googleAdsStructuredDraftSchema.parse(draft.structuredDraft);
    const brief = googleAdsCampaignBriefSchema.parse(draft.brief);
    const budget = {
      dailyAmount: decimalToNumber(draft.dailyBudget),
      monthlyEstimate: decimalToNumber(draft.monthlyEstimate),
      currency: draft.currency,
    };
    const updated = await this.prisma.googleAdsCampaignDraft.update({
      where: { id: draft.id },
      data: {
        status:
          draft.status === GoogleAdsCampaignDraftStatus.DRAFT
            ? GoogleAdsCampaignDraftStatus.PREVIEWED
            : draft.status,
        previewedAt: draft.previewedAt ?? new Date(),
      },
      include: { deployments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return {
      ...this.toPublic(updated),
      preview: {
        ...structured,
        budget,
        briefing: brief,
        steps: [
          'CampaignBudget',
          'Campaign',
          'Locations/Languages',
          'AdGroups',
          'Keywords',
          'Responsive Search Ads',
        ],
      },
    };
  }

  async preflight(user: AuthUser, id: string) {
    const draft = await this.requireDraft(user, id);
    const structured = googleAdsStructuredDraftSchema.parse(draft.structuredDraft);
    const brief = googleAdsCampaignBriefSchema.parse(draft.brief);
    const settings = await this.prisma.adManagerSettings.findUnique({
      where: { userId: user.id },
    });
    const limit = settings?.dailyBudgetLimit ? decimalToNumber(settings.dailyBudgetLimit) : null;
    const publish = validateStructuredDraftForPublish(structured, brief, limit);

    const conn = await this.prisma.adConnection.findUnique({
      where: {
        organizationId_provider: {
          organizationId: user.organizationId,
          provider: AdConnectionProvider.GOOGLE,
        },
      },
    });
    const account = await this.prisma.adGoogleAdsAccount.findFirst({
      where: {
        organizationId: user.organizationId,
        customerId: draft.customerId,
        isSelected: true,
      },
    });
    const scopes = Array.isArray(conn?.scopes) ? conn!.scopes : [];
    const hasAdwords = scopes.some((s) => String(s).includes('adwords'));
    const checks = [
      ...publish.checks,
      {
        id: 'account',
        ok: Boolean(account && conn?.status === AdConnectionStatus.CONNECTED),
        message:
          account && conn?.status === AdConnectionStatus.CONNECTED
            ? `Tài khoản ${draft.customerId} đã chọn và OAuth CONNECTED`
            : 'Thiếu kết nối Google hoặc chưa chọn customer',
      },
      {
        id: 'permission',
        ok: Boolean(hasAdwords && this.config.get('GOOGLE_ADS_DEVELOPER_TOKEN')),
        message: hasAdwords
          ? 'OAuth có scope adwords · developer token đã cấu hình'
          : 'Thiếu scope adwords hoặc developer token — Kết nối lại Google',
      },
    ];

    try {
      const refresh = await this.connections.getGoogleRefreshToken(user.organizationId);
      const access = await this.googleApi.refreshAccessToken(refresh);
      await this.googleApi.getCustomerDetail(access, draft.customerId, draft.loginCustomerId);
      checks.push({
        id: 'google_read',
        ok: true,
        message: 'Đọc được customer trên Google Ads API',
      });
    } catch (e) {
      checks.push({
        id: 'google_read',
        ok: false,
        message: e instanceof Error ? e.message.slice(0, 240) : 'Không đọc được Google Ads customer',
      });
    }

    const requiredIds = new Set(['url', 'budget', 'rsa', 'keywords', 'account', 'permission']);
    if (this.providerWriteEnabled()) requiredIds.add('google_read');
    const ok = checks.filter((c) => requiredIds.has(c.id)).every((c) => c.ok);
    const validation = { checks, ok, ranAt: new Date().toISOString() };
    const updated = await this.prisma.googleAdsCampaignDraft.update({
      where: { id: draft.id },
      data: { validation: validation as Prisma.InputJsonValue },
      include: { deployments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return { ...this.toPublic(updated), preflight: validation };
  }

  async approve(user: AuthUser, id: string, confirm: boolean) {
    if (confirm !== true) {
      throw new BadRequestException('Cần bấm xác nhận (confirm=true) trước khi chạy quảng cáo');
    }
    const draft = await this.requireDraft(user, id);
    if (!draft.previewedAt) {
      throw new BadRequestException('Xem preview chiến dịch trước khi xác nhận');
    }
    const validation = (draft.validation ?? {}) as { ok?: boolean; checks?: Array<{ ok: boolean }> };
    if (validation.ok !== true) {
      throw new BadRequestException('Chạy kiểm tra (preflight) và sửa lỗi trước khi xác nhận');
    }
    if (
      draft.status === GoogleAdsCampaignDraftStatus.DEPLOYED ||
      draft.status === GoogleAdsCampaignDraftStatus.DEPLOYING
    ) {
      throw new BadRequestException('Chiến dịch đang triển khai hoặc đã chạy');
    }

    const updated = await this.prisma.googleAdsCampaignDraft.update({
      where: { id: draft.id },
      data: {
        status: GoogleAdsCampaignDraftStatus.APPROVED,
        approvedAt: new Date(),
        approvedByUserId: user.id,
      },
      include: { deployments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'GOOGLE_ADS_CAMPAIGN_DRAFT_APPROVED',
      entityType: 'GoogleAdsCampaignDraft',
      entityId: draft.id,
      metadata: { customerId: draft.customerId },
    });
    return this.toPublic(updated);
  }

  private providerWriteEnabled(): boolean {
    return (
      isAdsActionsLive({ ADS_ACTIONS_LIVE: this.config.get('ADS_ACTIONS_LIVE') }) &&
      String(this.config.get('ADS_ACTIONS_PROVIDER_WRITE') ?? 'false').toLowerCase() === 'true'
    );
  }

  async deploy(user: AuthUser, id: string) {
    const draft = await this.requireDraft(user, id);
    if (
      draft.status !== GoogleAdsCampaignDraftStatus.APPROVED &&
      draft.status !== GoogleAdsCampaignDraftStatus.PARTIAL &&
      draft.status !== GoogleAdsCampaignDraftStatus.DEPLOYED &&
      draft.status !== GoogleAdsCampaignDraftStatus.DEPLOYING
    ) {
      throw new ForbiddenException(
        'Chỉ triển khai sau khi bạn bấm Xác nhận chạy quảng cáo (USER_APPROVAL)',
      );
    }

    const providerWrite =
      isAdsActionsLive({ ADS_ACTIONS_LIVE: this.config.get('ADS_ACTIONS_LIVE') }) &&
      String(this.config.get('ADS_ACTIONS_PROVIDER_WRITE') ?? 'false').toLowerCase() === 'true';

    const key = deploymentIdempotencyKey(draft.id);
    let deployment = await this.prisma.googleAdsCampaignDeployment.findUnique({
      where: { idempotencyKey: key },
    });
    if (!deployment) {
      deployment = await this.prisma.googleAdsCampaignDeployment.create({
        data: {
          draftId: draft.id,
          organizationId: user.organizationId,
          status: GoogleAdsCampaignDeployStatus.PENDING,
          idempotencyKey: key,
          providerWriteEnabled: providerWrite,
        },
      });
    } else if (deployment.status === GoogleAdsCampaignDeployStatus.SUCCEEDED) {
      return {
        reused: true,
        message: 'Đã triển khai — không tạo campaign trùng',
        deployment: this.toPublicDeployment(deployment),
        draft: this.toPublic(await this.requireDraft(user, id)),
      };
    }

    await this.prisma.googleAdsCampaignDraft.update({
      where: { id: draft.id },
      data: { status: GoogleAdsCampaignDraftStatus.DEPLOYING },
    });

    if (providerWrite) {
      const job = await this.deployQueue.add(
        QUEUE_NAMES.ADS_CAMPAIGN_DEPLOY,
        { organizationId: user.organizationId, deploymentId: deployment.id },
        { jobId: key, removeOnComplete: 50, attempts: 3, backoff: { type: 'exponential', delay: 15_000 } },
      );
      await this.prisma.googleAdsCampaignDeployment.update({
        where: { id: deployment.id },
        data: { status: GoogleAdsCampaignDeployStatus.DEPLOYING, startedAt: new Date() },
      });
      return {
        queued: true,
        jobId: String(job.id),
        deployment: this.toPublicDeployment({
          ...deployment,
          status: GoogleAdsCampaignDeployStatus.DEPLOYING,
        }),
      };
    }

    const structured = googleAdsStructuredDraftSchema.parse(draft.structuredDraft);
    const existing = (deployment.createdResources ?? {}) as CreatedGoogleAdsResources;
    const result = await executeGoogleAdsCampaignPlan({
      draft: structured,
      resources: existing,
      mutate: createDryRunMutatePort(draft.customerId),
    });

    const nextStatus = result.completed
      ? GoogleAdsCampaignDeployStatus.SUCCEEDED
      : result.resources.budgetResourceName
        ? GoogleAdsCampaignDeployStatus.PARTIAL
        : GoogleAdsCampaignDeployStatus.FAILED;

    const saved = await this.prisma.googleAdsCampaignDeployment.update({
      where: { id: deployment.id },
      data: {
        status: nextStatus,
        createdResources: result.resources as Prisma.InputJsonValue,
        lastCompletedStep: result.completed ? 'ads' : result.failedStep ?? null,
        lastError: result.error ?? null,
        attemptCount: { increment: 1 },
        providerWriteEnabled: false,
        startedAt: deployment.startedAt ?? new Date(),
        completedAt: result.completed ? new Date() : null,
      },
    });

    await this.prisma.googleAdsCampaignDraft.update({
      where: { id: draft.id },
      data: {
        status: result.completed
          ? GoogleAdsCampaignDraftStatus.DEPLOYED
          : nextStatus === GoogleAdsCampaignDeployStatus.PARTIAL
            ? GoogleAdsCampaignDraftStatus.PARTIAL
            : GoogleAdsCampaignDraftStatus.FAILED,
        lastError: result.error ?? null,
      },
    });

    return {
      reused: false,
      dryRun: true,
      message: result.completed
        ? 'Đã tạo campaign (dry-run — bật ADS_ACTIONS_LIVE + ADS_ACTIONS_PROVIDER_WRITE để ghi Google Ads thật)'
        : 'Triển khai dở — trạng thái PARTIAL, bấm triển khai lại để tiếp tục',
      deployment: this.toPublicDeployment(saved),
    };
  }

  async getDeployment(user: AuthUser, id: string) {
    const row = await this.prisma.googleAdsCampaignDeployment.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy lần triển khai');
    return this.toPublicDeployment(row);
  }

  async retry(user: AuthUser, deploymentId: string) {
    const row = await this.prisma.googleAdsCampaignDeployment.findFirst({
      where: { id: deploymentId, organizationId: user.organizationId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy lần triển khai');
    if (row.status === GoogleAdsCampaignDeployStatus.SUCCEEDED) {
      return { reused: true, deployment: this.toPublicDeployment(row) };
    }
    await this.prisma.googleAdsCampaignDraft.update({
      where: { id: row.draftId },
      data: { status: GoogleAdsCampaignDraftStatus.APPROVED },
    });
    return this.deploy(user, row.draftId);
  }

  private async generateStructuredDraft(
    user: AuthUser,
    brief: GoogleAdsCampaignBrief,
    budget: ReturnType<typeof resolveDailyBudget>,
  ): Promise<GoogleAdsStructuredDraft> {
    let ai: Partial<GoogleAdsStructuredDraft> | null = null;
    if (this.openAi.isConfigured()) {
      try {
        ai = await this.credit.runPaidFeature({
          organizationId: user.organizationId,
          featureCode: CREDIT_FEATURE_CODES.ADS_AI_CREATIVE,
          referenceId: `ads.campaign-draft:${user.organizationId}:${randomUUID()}`,
          reason: 'Google Ads AI campaign draft',
          fn: async (ctx) => {
            ctx.markProviderStarted();
            const raw = await this.openAi.chatCompletion({
              messages: [
                {
                  role: 'system',
                  content:
                    'Bạn là chuyên gia Google Ads Search cho người mới. Chỉ trả JSON (không markdown) với: campaignType (SEARCH), objective, campaignName, budget {dailyAmount,currency}, locations[], languages[], biddingStrategy, adGroups[{name,keywords[]}], keywords[], negativeKeywords[], headlines[] (3-15, mỗi cái ≤30 ký tự), descriptions[] (2-4, ≤90 ký tự), finalUrl. Không bịa giá. Không gọi API Google.',
                },
                {
                  role: 'user',
                  content: JSON.stringify({
                    product: brief.product,
                    landingPage: brief.landingPage,
                    objective: brief.objective,
                    location: brief.location,
                    audience: brief.audience,
                    dailyBudget: budget.dailyAmount,
                    currency: budget.currency,
                  }),
                },
              ],
              temperature: 0.4,
            });
            return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()) as Partial<GoogleAdsStructuredDraft>;
          },
        });
      } catch (err) {
        this.logger.warn(
          `AI campaign draft fallback: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return mergeStructuredDraft(brief, budget, ai);
  }

  private async requireDraft(user: AuthUser, id: string) {
    const row = await this.prisma.googleAdsCampaignDraft.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { deployments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!row) throw new NotFoundException('Không tìm thấy bản nháp chiến dịch Google Ads');
    return row;
  }

  private toPublic(
    row: {
      id: string;
      organizationId: string;
      customerId: string;
      loginCustomerId: string | null;
      status: GoogleAdsCampaignDraftStatus;
      brief: Prisma.JsonValue;
      structuredDraft: Prisma.JsonValue;
      validation: Prisma.JsonValue;
      dailyBudget: Prisma.Decimal;
      monthlyEstimate: Prisma.Decimal;
      currency: string;
      approvedAt: Date | null;
      previewedAt: Date | null;
      idempotencyKey: string;
      lastError: string | null;
      createdAt: Date;
      deployments?: Array<{
        id: string;
        status: GoogleAdsCampaignDeployStatus;
        createdResources: Prisma.JsonValue;
        lastError: string | null;
        attemptCount: number;
        providerWriteEnabled: boolean;
      }>;
    },
  ) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      customerId: row.customerId,
      loginCustomerId: row.loginCustomerId,
      status: row.status,
      brief: row.brief,
      structuredDraft: row.structuredDraft,
      validation: row.validation,
      dailyBudget: decimalToNumber(row.dailyBudget),
      monthlyEstimate: decimalToNumber(row.monthlyEstimate),
      currency: row.currency,
      approvedAt: row.approvedAt,
      previewedAt: row.previewedAt,
      idempotencyKey: row.idempotencyKey,
      lastError: row.lastError,
      createdAt: row.createdAt,
      latestDeployment: row.deployments?.[0]
        ? {
            id: row.deployments[0].id,
            status: row.deployments[0].status,
            createdResources: row.deployments[0].createdResources,
            lastError: row.deployments[0].lastError,
            attemptCount: row.deployments[0].attemptCount,
            providerWriteEnabled: row.deployments[0].providerWriteEnabled,
          }
        : null,
    };
  }

  private toPublicDeployment(row: {
    id: string;
    draftId: string;
    status: GoogleAdsCampaignDeployStatus;
    idempotencyKey: string;
    createdResources: Prisma.JsonValue;
    lastCompletedStep: string | null;
    lastError: string | null;
    attemptCount: number;
    providerWriteEnabled: boolean;
  }) {
    return {
      id: row.id,
      draftId: row.draftId,
      status: row.status,
      idempotencyKey: row.idempotencyKey,
      createdResources: row.createdResources,
      lastCompletedStep: row.lastCompletedStep,
      lastError: row.lastError,
      attemptCount: row.attemptCount,
      providerWriteEnabled: row.providerWriteEnabled,
    };
  }
}
