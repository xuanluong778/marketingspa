import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL,
  isFullAutopilotActive,
  marketingAutopilotGuardrailSchema,
  normalizeMarketingAutopilotMode,
  normalizeGuardrailFromDb,
  type MarketingAutopilotGuardrailConfig,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

export type UpdateMarketingAutopilotGuardrailInput = Partial<
  Pick<
    MarketingAutopilotGuardrailConfig,
    | 'maxDailyAdSpend'
    | 'maxCampaignBudget'
    | 'maxBudgetIncreasePercent'
    | 'allowedChannels'
    | 'allowFacebookPublish'
    | 'allowGoogleAdsPublish'
    | 'allowEmailSend'
    | 'allowZaloSend'
    | 'allowAutomationActivation'
    | 'stopLossCpl'
    | 'stopLossCpa'
    | 'autopilotMode'
    | 'fullAutopilotEnabled'
    | 'cooldownMinutes'
  >
>;

@Injectable()
export class MarketingAutopilotGuardrailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getOrCreate(organizationId: string): Promise<MarketingAutopilotGuardrailConfig> {
    const existing = await this.prisma.marketingAutopilotGuardrail.findUnique({
      where: { organizationId },
    });
    if (existing) return normalizeGuardrailFromDb(existing);

    const created = await this.prisma.marketingAutopilotGuardrail.create({
      data: {
        organizationId,
        maxDailyAdSpend: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.maxDailyAdSpend,
        maxCampaignBudget: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.maxCampaignBudget,
        maxBudgetIncreasePercent: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.maxBudgetIncreasePercent,
        allowedChannels: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.allowedChannels,
        allowFacebookPublish: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.allowFacebookPublish,
        allowGoogleAdsPublish: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.allowGoogleAdsPublish,
        allowEmailSend: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.allowEmailSend,
        allowZaloSend: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.allowZaloSend,
        allowAutomationActivation: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.allowAutomationActivation,
        autopilotMode: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.autopilotMode,
        fullAutopilotEnabled: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.fullAutopilotEnabled,
        cooldownMinutes: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.cooldownMinutes,
      },
    });
    return normalizeGuardrailFromDb(created);
  }

  async update(user: AuthUser, input: UpdateMarketingAutopilotGuardrailInput) {
    if (input.autopilotMode === 'FULL_AUTOPILOT' && input.fullAutopilotEnabled === false) {
      throw new BadRequestException(
        'FULL_AUTOPILOT cần bật fullAutopilotEnabled — hoặc chọn APPROVAL_AUTOPILOT',
      );
    }

    const parsed = marketingAutopilotGuardrailSchema.partial().parse(input);
    const current = await this.getOrCreate(user.organizationId);

    // FULL_AUTOPILOT never auto-enables allowFacebookPublish — only explicit PATCH field.
    if (
      parsed.allowFacebookPublish === undefined &&
      (parsed.fullAutopilotEnabled === true || parsed.autopilotMode === 'FULL_AUTOPILOT')
    ) {
      delete (parsed as { allowFacebookPublish?: boolean }).allowFacebookPublish;
    }

    const row = await this.prisma.marketingAutopilotGuardrail.upsert({
      where: { organizationId: user.organizationId },
      create: {
        organizationId: user.organizationId,
        ...this.toDbFields({ ...current, ...parsed }),
      },
      update: this.toDbFields(parsed),
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'AUTOPILOT_GUARDRAIL_UPDATE',
      entityType: 'MARKETING_AUTOPILOT_GUARDRAIL',
      entityId: row.id,
      metadata: {
        autopilotMode: row.autopilotMode,
        fullAutopilotEnabled: row.fullAutopilotEnabled,
        allowFacebookPublish: row.allowFacebookPublish,
        allowFacebookPublishExplicit: input.allowFacebookPublish !== undefined,
      },
    });

    return normalizeGuardrailFromDb(row);
  }

  async setEmergencyStop(user: AuthUser, emergencyStop: boolean) {
    const row = await this.prisma.marketingAutopilotGuardrail.upsert({
      where: { organizationId: user.organizationId },
      create: {
        organizationId: user.organizationId,
        emergencyStop,
        ...(emergencyStop ? { fullAutopilotEnabled: false } : {}),
      },
      update: {
        emergencyStop,
        ...(emergencyStop ? { fullAutopilotEnabled: false } : {}),
      },
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: emergencyStop ? 'AUTOPILOT_EMERGENCY_STOP_ON' : 'AUTOPILOT_EMERGENCY_STOP_OFF',
      entityType: 'MARKETING_AUTOPILOT_GUARDRAIL',
      entityId: row.id,
      metadata: { emergencyStop },
    });

    const config = normalizeGuardrailFromDb(row);
    return {
      emergencyStop: config.emergencyStop,
      fullAutopilotEnabled: config.fullAutopilotEnabled,
      autopilotMode: config.autopilotMode,
      fullAutopilotActive: isFullAutopilotActive(config),
    };
  }

  resolveEffectiveMode(row: MarketingAutopilotGuardrailConfig) {
    if (row.emergencyStop) return 'APPROVAL_AUTOPILOT' as const;
    if (row.autopilotMode === 'RECOMMEND_ONLY') return 'RECOMMEND_ONLY' as const;
    if (isFullAutopilotActive(row)) return 'FULL_AUTOPILOT' as const;
    return 'APPROVAL_AUTOPILOT' as const;
  }

  private toDbFields(input: Partial<MarketingAutopilotGuardrailConfig>) {
    const data: Record<string, unknown> = {};
    if (input.maxDailyAdSpend !== undefined) data.maxDailyAdSpend = input.maxDailyAdSpend;
    if (input.maxCampaignBudget !== undefined) data.maxCampaignBudget = input.maxCampaignBudget;
    if (input.maxBudgetIncreasePercent !== undefined) {
      data.maxBudgetIncreasePercent = input.maxBudgetIncreasePercent;
    }
    if (input.allowedChannels !== undefined) data.allowedChannels = input.allowedChannels;
    if (input.allowGoogleAdsPublish !== undefined) {
      data.allowGoogleAdsPublish = input.allowGoogleAdsPublish;
    }
    if (input.allowFacebookPublish !== undefined) {
      data.allowFacebookPublish = input.allowFacebookPublish;
    }
    if (input.allowEmailSend !== undefined) data.allowEmailSend = input.allowEmailSend;
    if (input.allowZaloSend !== undefined) data.allowZaloSend = input.allowZaloSend;
    if (input.allowAutomationActivation !== undefined) {
      data.allowAutomationActivation = input.allowAutomationActivation;
    }
    if (input.stopLossCpl !== undefined) data.stopLossCpl = input.stopLossCpl;
    if (input.stopLossCpa !== undefined) data.stopLossCpa = input.stopLossCpa;
    if (input.autopilotMode !== undefined) data.autopilotMode = input.autopilotMode;
    if (input.fullAutopilotEnabled !== undefined) {
      data.fullAutopilotEnabled = input.fullAutopilotEnabled;
    }
    if (input.cooldownMinutes !== undefined) data.cooldownMinutes = input.cooldownMinutes;
    return data;
  }
}
