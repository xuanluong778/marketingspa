import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LeadPipelineStatus } from '@marketingspa/database';
import {
  FunnelCanvasValidationError,
  assertFunnelCompleteDraft,
  buildConsultantProposal,
  compactSpecForAi,
  detectConsultantIntents,
  hashFunnelSpec,
  mergeConsultantPatch,
  parseFunnelCompleteSpec,
  pctRate,
  dropOffFromPrevious,
  sanitizeFunnelUserPrompt,
  type FunnelCompleteSpec,
  type FunnelConsultantIntent,
  type FunnelConsultantMetrics,
  type FunnelConsultantProposal,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import { FunnelGeneratorService } from './funnel-generator.service';
import { FunnelAnalyticsService } from '../leads/funnel-analytics.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type { FunnelConsultantProposeDto } from './dto/funnel-consultant.dto';

@Injectable()
export class FunnelConsultantService {
  private readonly logger = new Logger(FunnelConsultantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAi: OpenAiService,
    private readonly generator: FunnelGeneratorService,
    private readonly analytics: FunnelAnalyticsService,
  ) {}

  async propose(
    user: AuthUser,
    recommendationId: string,
    dto: FunnelConsultantProposeDto,
  ): Promise<FunnelConsultantProposal> {
    const current = await this.loadDraft(user.organizationId, recommendationId);
    const prompt = sanitizeFunnelUserPrompt(dto.prompt?.trim() ?? '');
    const intents: FunnelConsultantIntent[] = dto.intent
      ? [dto.intent]
      : prompt
        ? detectConsultantIntents(prompt)
        : ['OPTIMIZE_FROM_DATA'];

    const includeAnalytics = dto.includeAnalytics !== false;
    const metrics = includeAnalytics
      ? await this.loadFunnelMetrics(user.organizationId, recommendationId)
      : null;

    let source: 'ai' | 'rules' = 'rules';
    let patched: FunnelCompleteSpec | undefined;
    let rationale: string | undefined;

    if (this.openAi.isConfigured() && (prompt.length >= 3 || intents[0] === 'OPTIMIZE_FROM_DATA')) {
      try {
        const ai = await this.proposeWithAi(current, intents, prompt, metrics);
        if (ai) {
          const changed = hashFunnelSpec(ai.spec) !== hashFunnelSpec(current);
          patched = changed ? ai.spec : undefined;
          rationale = ai.rationale;
          source = changed ? 'ai' : 'rules';
        }
      } catch (err) {
        this.logger.warn(`Consultant AI failed, using rules: ${String(err)}`);
      }
    }

    try {
      return buildConsultantProposal({
        current,
        intents,
        prompt,
        source,
        rationale,
        metrics,
        patched,
      });
    } catch (err) {
      this.logger.warn(`Consultant proposal invalid: ${String(err)}`);
      throw new BadRequestException('Không tạo được đề xuất hợp lệ — schema/graph không pass');
    }
  }

  async apply(
    user: AuthUser,
    recommendationId: string,
    body: { confirm: boolean; complete: unknown; specHash?: string },
  ) {
    if (body.confirm !== true) {
      throw new BadRequestException(
        'Cần xác nhận (confirm=true) — AI không tự thay Funnel/ngân sách',
      );
    }

    let spec: FunnelCompleteSpec;
    try {
      spec = assertFunnelCompleteDraft(body.complete);
    } catch (err) {
      if (err instanceof FunnelCanvasValidationError) {
        throw new BadRequestException({ message: err.message, issues: err.issues });
      }
      throw new BadRequestException('Proposed spec không qua schema validator');
    }

    if (body.specHash && body.specHash !== hashFunnelSpec(spec)) {
      throw new BadRequestException('specHash không khớp — hãy propose lại rồi xác nhận');
    }

    const saved = await this.generator.saveCompleteDraft(user, recommendationId, {
      complete: spec as unknown as Record<string, unknown>,
    });

    return {
      ...saved,
      applied: false as const,
      deployable: false as const,
      budgetChanged: false as const,
      mode: 'draft' as const,
    };
  }

  private async loadDraft(organizationId: string, id: string): Promise<FunnelCompleteSpec> {
    const row = await this.prisma.funnelRecommendation.findFirst({
      where: { id, organizationId },
      select: { completeSpec: true },
    });
    if (!row) throw new NotFoundException('Funnel không tồn tại');
    if (!row.completeSpec) {
      throw new BadRequestException('Chưa có complete spec — generate complete trước');
    }
    try {
      return parseFunnelCompleteSpec(row.completeSpec);
    } catch {
      throw new BadRequestException('completeSpec hiện tại không hợp lệ');
    }
  }

  private async loadFunnelMetrics(
    organizationId: string,
    funnelId: string,
  ): Promise<FunnelConsultantMetrics> {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const where = {
      organizationId,
      funnelRecommendationId: funnelId,
      createdAt: { gte: from, lte: to },
    };

    const [leads, booking, purchased, slaBreached, orgAnalytics] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({
        where: {
          ...where,
          pipelineStatus: {
            in: [
              LeadPipelineStatus.BOOKED,
              LeadPipelineStatus.CONFIRMED,
              LeadPipelineStatus.VISITED,
              LeadPipelineStatus.PURCHASED,
            ],
          },
        },
      }),
      this.prisma.lead.count({
        where: { ...where, pipelineStatus: LeadPipelineStatus.PURCHASED },
      }),
      this.prisma.lead.count({ where: { ...where, slaBreached: true } }),
      this.analytics.getAnalytics(organizationId, {}).catch(() => null),
    ]);

    const mql = await this.prisma.lead.count({
      where: {
        ...where,
        OR: [{ qualification: { in: ['MQL', 'SQL'] } }, { mqlReachedAt: { not: null } }],
      },
    });
    const sql = await this.prisma.lead.count({
      where: {
        ...where,
        OR: [{ qualification: 'SQL' }, { sqlReachedAt: { not: null } }],
      },
    });

    const dropOff = [
      { stage: 'LEAD', count: leads, dropOffFromPrevious: null as number | null },
      { stage: 'MQL', count: mql, dropOffFromPrevious: dropOffFromPrevious(mql, leads) },
      { stage: 'SQL', count: sql, dropOffFromPrevious: dropOffFromPrevious(sql, mql) },
      {
        stage: 'BOOKING',
        count: booking,
        dropOffFromPrevious: dropOffFromPrevious(booking, sql || leads),
      },
      {
        stage: 'PURCHASED',
        count: purchased,
        dropOffFromPrevious: dropOffFromPrevious(purchased, booking),
      },
    ];

    return {
      hasRealData: leads > 0,
      scope: leads > 0 ? 'funnel' : 'none',
      leads,
      booking,
      purchased,
      conversionRate: pctRate(purchased, leads),
      bookingRate: pctRate(booking, leads),
      cpl: leads > 0 ? orgAnalytics?.kpis.cpl ?? null : null,
      spend: leads > 0 ? orgAnalytics?.kpis.spend ?? null : null,
      slaBreached,
      slaRate: pctRate(slaBreached, leads),
      avgConversionTimeHours: leads > 0 ? orgAnalytics?.kpis.avgConversionTimeHours ?? null : null,
      dropOff,
    };
  }

  private async proposeWithAi(
    current: FunnelCompleteSpec,
    intents: FunnelConsultantIntent[],
    prompt: string,
    metrics: FunnelConsultantMetrics | null,
  ): Promise<{ spec: FunnelCompleteSpec; rationale: string } | null> {
    const raw = await this.openAi.chatCompletion({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 1800,
      timeoutMs: 45_000,
      messages: [
        {
          role: 'system',
          content: `Bạn là Funnel Consultant spa. Trả về ĐÚNG 1 JSON:
{"rationale":"string tiếng Việt","patch":{...optional funnel-complete fields...}}
QUY TẮC:
- Chỉ sửa draft qua các field schema funnel-complete.v1 (offer, cta, nodes, connections, followUp, automations, remarketing, chatbotFlow, leadForm, booking, salesHandoff, kpis, strategy, summary)
- KHÔNG invent key mới, KHÔNG đổi templateSlug/schemaVersion/mode
- KHÔNG đổi ngân sách ads, KHÔNG pause campaign, KHÔNG bịa KPI
- Nếu metrics.hasRealData=false: không nêu số conversion/CPL giả
- patch có thể rỗng nếu không nên sửa
- nodes/connections nếu có phải là FULL arrays thay thế, không delta`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            request: prompt,
            intents,
            spec: compactSpecForAi(current),
            metrics: metrics
              ? {
                  hasRealData: metrics.hasRealData,
                  leads: metrics.leads,
                  booking: metrics.booking,
                  purchased: metrics.purchased,
                  conversionRate: metrics.conversionRate,
                  bookingRate: metrics.bookingRate,
                  cpl: metrics.cpl,
                  slaBreached: metrics.slaBreached,
                  slaRate: metrics.slaRate,
                  dropOff: metrics.dropOff,
                }
              : null,
          }),
        },
      ],
    });

    const jsonText = extractJsonObject(raw);
    const parsed = JSON.parse(jsonText) as { rationale?: string; patch?: Record<string, unknown> };
    const rationale =
      typeof parsed.rationale === 'string' && parsed.rationale.trim()
        ? parsed.rationale.trim().slice(0, 1200)
        : undefined;
    if (!parsed.patch || typeof parsed.patch !== 'object' || Array.isArray(parsed.patch)) {
      return rationale ? { spec: current, rationale } : null;
    }

    try {
      const spec = mergeConsultantPatch(current, parsed.patch);
      assertFunnelCompleteDraft(spec);
      return { spec, rationale: rationale ?? 'AI đề xuất chỉnh draft (chờ xác nhận).' };
    } catch (err) {
      this.logger.warn(`AI patch failed schema: ${String(err)}`);
      return null;
    }
  }
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error('AI response is not JSON');
}
