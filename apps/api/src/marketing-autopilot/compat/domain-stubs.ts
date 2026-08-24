/**
 * Minimum Autopilot integrations for origin/main (no Funnel Builder / Email Marketing / Lead Scoring modules).
 * Stores drafts in Autopilot-owned tables. Never publishes ads/email/funnel live.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import {
  buildFallbackFunnelComplete,
  buildFallbackFunnelRecommendations,
} from '@marketingspa/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FunnelBuilderService {
  private readonly logger = new Logger(FunnelBuilderService.name);

  async generate(
    _user?: unknown,
    _dto?: unknown,
  ): Promise<{ id: string }> {
    throw new Error('FunnelBuilder CRM seed not available on this baseline');
  }

  async apply(
    _user?: unknown,
    _dto?: unknown,
    _canActivateFlows?: boolean,
  ): Promise<void> {
    throw new Error('FunnelBuilder apply not available on this baseline');
  }
}

@Injectable()
export class FunnelGeneratorService {
  private readonly logger = new Logger(FunnelGeneratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generate(
    user: { id: string; organizationId: string },
    dto: { prompt: string; productService?: string; region?: string; budget?: string },
    _opts?: { skipQuota?: boolean },
  ) {
    const preview = buildFallbackFunnelRecommendations(dto.prompt || 'Autopilot Funnel');
    const row = await this.prisma.marketingAutopilotFunnelSpec.create({
      data: {
        organizationId: user.organizationId,
        createdById: user.id,
        prompt: preview.prompt,
        source: 'fallback',
        status: 'DRAFT',
        result: preview as unknown as Prisma.InputJsonValue,
        selectedSlug: preview.recommendations[0]?.templateSlug ?? 'consultation',
        selectedAt: new Date(),
      },
    });
    this.logger.debug(`Autopilot funnel spec ${row.id} created (fallback)`);
    return {
      id: row.id,
      recommendations: preview.recommendations,
    };
  }

  async generateComplete(_user: { id: string; organizationId: string }, id: string) {
    const complete = buildFallbackFunnelComplete({ templateSlug: 'consultation' });
    await this.prisma.marketingAutopilotFunnelSpec.update({
      where: { id },
      data: {
        selectedSlug: 'consultation',
        selectedAt: new Date(),
        completeSpec: complete as unknown as Prisma.InputJsonValue,
        completeSource: 'fallback',
        completeGeneratedAt: new Date(),
      },
    });
    return { recommendationId: id, mode: 'draft' as const };
  }
}

@Injectable()
export class FunnelLifecycleService {
  async publish(
    _user?: unknown,
    _id?: string,
    _summary?: string,
    _canActivateFlows?: boolean,
  ): Promise<{ status: string }> {
    throw new Error('Funnel publish not available on this baseline — kept DRAFT');
  }

  async pause(_user?: unknown, _id?: string): Promise<{ status: string }> {
    throw new Error('Funnel pause not available on this baseline');
  }
}

@Injectable()
export class EmailMarketingService {
  constructor(private readonly prisma: PrismaService) {}

  async createCampaign(
    organizationId: string,
    dto: { name: string; subject?: string | null },
    userId?: string,
  ) {
    return this.prisma.marketingAutopilotEmailDraft.create({
      data: {
        organizationId,
        name: dto.name,
        subject: dto.subject ?? null,
        createdByUserId: userId ?? null,
        status: 'DRAFT',
      },
    });
  }

  async sendCampaign(_organizationId?: string, _campaignId?: string): Promise<void> {
    throw new Error('Email send not available on this baseline');
  }
}

@Injectable()
export class LeadScoringService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertConfig(
    organizationId: string,
    funnelId: string,
    dto: {
      maxScore?: number;
      mqlThreshold?: number;
      sqlThreshold?: number;
      isActive?: boolean;
      source?: string;
      rules?: unknown;
    },
  ) {
    return this.prisma.marketingAutopilotScoringConfig.upsert({
      where: { funnelId },
      create: {
        organizationId,
        funnelId,
        maxScore: dto.maxScore ?? 100,
        mqlThreshold: dto.mqlThreshold ?? 50,
        sqlThreshold: dto.sqlThreshold ?? 80,
        isActive: dto.isActive ?? true,
        source: dto.source ?? 'executor',
      },
      update: { source: dto.source ?? 'executor' },
    });
  }
}
