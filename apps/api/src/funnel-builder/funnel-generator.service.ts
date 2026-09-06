import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LeadPipelineStatus, OrderStatus, Prisma } from '@marketingspa/database';
import {
  DEFAULT_FUNNEL_TEMPLATES,
  FUNNEL_TEMPLATE_SLUGS,
  FunnelCanvasValidationError,
  applyFunnelCanvasDraft,
  assertFunnelCompleteDraft,
  buildFallbackFunnelComplete,
  buildFallbackFunnelRecommendations,
  getDefaultFunnelTemplate,
  parseFunnelCompleteSpec,
  parseFunnelGeneratorResult,
  sanitizeFunnelCompleteSpec,
  sanitizeFunnelUserPrompt,
  type FunnelCompleteSpec,
  type FunnelGeneratorResult,
  type FunnelRecommendationOption,
  type FunnelTemplateSlug,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import { FunnelTemplateService } from './funnel-template.service';
import { FunnelLifecycleService } from './funnel-lifecycle.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type {
  GenerateFunnelRecommendationsDto,
  SaveFunnelCompleteDraftDto,
  SelectFunnelRecommendationDto,
} from './dto/funnel-generator.dto';

const ALLOWED_SLUGS = new Set<string>(FUNNEL_TEMPLATE_SLUGS);

@Injectable()
export class FunnelGeneratorService {
  private readonly logger = new Logger(FunnelGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAi: OpenAiService,
    private readonly templates: FunnelTemplateService,
    private readonly lifecycle: FunnelLifecycleService,
  ) {}

  /**
   * Analyze NL brief → 3–5 template recommendations.
   * Preview only — does NOT apply pipeline/automation.
   */
  async generate(user: AuthUser, dto: GenerateFunnelRecommendationsDto) {
    await this.lifecycle.assertCanCreateFunnel(user.organizationId);
    await this.templates.ensureSystemTemplates();

    dto.prompt = sanitizeFunnelUserPrompt(dto.prompt);

    const composedPrompt = composeFunnelBriefPrompt(dto);
    const hints = {
      ...dto,
      prompt: composedPrompt,
      industryHint: dto.industryHint || dto.productService,
      regionHint: dto.regionHint || dto.region,
      budgetHint: dto.budgetHint || dto.budget,
    };

    const catalog = DEFAULT_FUNNEL_TEMPLATES.map((t) => ({
      slug: t.slug,
      name: t.name,
      category: t.category,
      description: t.description,
      goal: t.goal.label,
      tags: t.tags,
    }));

    let result: FunnelGeneratorResult;
    let source: 'ai' | 'fallback' = 'fallback';

    try {
      if (this.openAi.isConfigured()) {
        result = await this.generateWithAi(hints, catalog);
        source = 'ai';
      } else {
        result = buildFallbackFunnelRecommendations(composedPrompt);
        result = this.enrichWithHints(result, hints);
      }
    } catch (err) {
      this.logger.warn(`AI funnel generator failed, fallback: ${String(err)}`);
      result = this.enrichWithHints(buildFallbackFunnelRecommendations(composedPrompt), hints);
      source = 'fallback';
    }

    result = this.sanitizeResult(result, composedPrompt);

    const row = await this.prisma.funnelRecommendation.create({
      data: {
        organizationId: user.organizationId,
        createdById: user.id,
        prompt: composedPrompt,
        result: result as unknown as Prisma.InputJsonValue,
        source,
      },
    });

    return {
      id: row.id,
      source,
      ...result,
      /** Explicit contract for clients */
      applied: false,
      deployable: false,
    };
  }

  async get(organizationId: string, id: string) {
    const row = await this.prisma.funnelRecommendation.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Recommendation not found');
    const result = parseFunnelGeneratorResult(row.result);
    return {
      id: row.id,
      source: row.source,
      selectedSlug: row.selectedSlug,
      selectedAt: row.selectedAt,
      completeSpec: row.completeSpec,
      completeSource: row.completeSource,
      completeGeneratedAt: row.completeGeneratedAt,
      chatbotBotId: row.chatbotBotId,
      status: row.status,
      publishedVersion: row.publishedVersion,
      publishedAt: row.publishedAt,
      pausedAt: row.pausedAt,
      archivedAt: row.archivedAt,
      clonedFromId: row.clonedFromId,
      liveFrozen: row.status === 'ACTIVE',
      createdAt: row.createdAt,
      ...result,
      applied: false,
      deployable: false,
    };
  }

  async list(organizationId: string, take = 50) {
    const rows = await this.prisma.funnelRecommendation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        prompt: true,
        source: true,
        selectedSlug: true,
        selectedAt: true,
        completeGeneratedAt: true,
        completeSource: true,
        chatbotBotId: true,
        status: true,
        publishedVersion: true,
        clonedFromId: true,
        createdAt: true,
        completeSpec: true,
        publishedSpec: true,
      },
    });

    const ids = rows.map((r) => r.id);
    const BOOKING_STATUSES: LeadPipelineStatus[] = [
      LeadPipelineStatus.BOOKED,
      LeadPipelineStatus.CONFIRMED,
      LeadPipelineStatus.VISITED,
      LeadPipelineStatus.PURCHASED,
    ];

    const [statusGroups, paidOrders] = ids.length
      ? await Promise.all([
          this.prisma.lead.groupBy({
            by: ['funnelRecommendationId', 'pipelineStatus'],
            where: { organizationId, funnelRecommendationId: { in: ids } },
            _count: { _all: true },
          }),
          this.prisma.order.findMany({
            where: {
              organizationId,
              status: { in: [OrderStatus.PAID, OrderStatus.PARTIALLY_PAID] },
              lead: { funnelRecommendationId: { in: ids } },
            },
            select: {
              total: true,
              lead: { select: { funnelRecommendationId: true } },
            },
          }),
        ])
      : [[], []];

    const stats = new Map<
      string,
      { leads: number; booking: number; purchase: number; revenue: number }
    >();
    for (const id of ids) {
      stats.set(id, { leads: 0, booking: 0, purchase: 0, revenue: 0 });
    }
    for (const g of statusGroups) {
      const id = g.funnelRecommendationId;
      if (!id) continue;
      const row = stats.get(id) ?? { leads: 0, booking: 0, purchase: 0, revenue: 0 };
      row.leads += g._count._all;
      if (BOOKING_STATUSES.includes(g.pipelineStatus)) row.booking += g._count._all;
      if (g.pipelineStatus === LeadPipelineStatus.PURCHASED) row.purchase += g._count._all;
      stats.set(id, row);
    }
    for (const order of paidOrders) {
      const id = order.lead?.funnelRecommendationId;
      if (!id) continue;
      const row = stats.get(id) ?? { leads: 0, booking: 0, purchase: 0, revenue: 0 };
      row.revenue += Number(order.total ?? 0);
      stats.set(id, row);
    }

    return rows.map(({ completeSpec, publishedSpec, ...row }) => {
      const live = row.status === 'ACTIVE' ? publishedSpec : completeSpec;
      return {
        ...row,
        name: funnelSpecField(live, 'name') ?? funnelSpecField(completeSpec, 'name'),
        offer: funnelSpecField(live, 'offer') ?? funnelSpecField(completeSpec, 'offer'),
        kpis: stats.get(row.id) ?? { leads: 0, booking: 0, purchase: 0, revenue: 0 },
      };
    });
  }

  /**
   * Record user choice of a recommended template — still NO apply/deploy.
   */
  async select(
    organizationId: string,
    id: string,
    dto: SelectFunnelRecommendationDto,
  ) {
    if (!ALLOWED_SLUGS.has(dto.templateSlug)) {
      throw new BadRequestException('templateSlug không thuộc Funnel Template Engine');
    }
    const row = await this.prisma.funnelRecommendation.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Recommendation not found');

    const result = parseFunnelGeneratorResult(row.result);
    const allowed = new Set(result.recommendations.map((r) => r.templateSlug));
    if (!allowed.has(dto.templateSlug as FunnelTemplateSlug)) {
      throw new BadRequestException('Chỉ được chọn slug nằm trong danh sách đề xuất');
    }

    const updated = await this.prisma.funnelRecommendation.update({
      where: { id },
      data: {
        selectedSlug: dto.templateSlug,
        selectedAt: new Date(),
      },
    });

    return {
      id: updated.id,
      selectedSlug: updated.selectedSlug,
      selectedAt: updated.selectedAt,
      applied: false,
      deployable: false,
      nextStep:
        'Gọi POST /funnel-builder/recommendations/:id/generate-complete để tạo Funnel JSON đầy đủ (draft).',
    };
  }

  /**
   * After strategy selected — generate complete funnel JSON (fixed schema).
   * Validates before DB save. Does NOT apply/deploy live pipeline.
   */
  async generateComplete(user: AuthUser, recommendationId: string) {
    await this.templates.ensureSystemTemplates();

    const row = await this.prisma.funnelRecommendation.findFirst({
      where: { id: recommendationId, organizationId: user.organizationId },
    });
    if (!row) throw new NotFoundException('Recommendation not found');
    if (!row.selectedSlug) {
      throw new BadRequestException('Cần chọn chiến lược Funnel trước khi generate complete');
    }
    if (!ALLOWED_SLUGS.has(row.selectedSlug)) {
      throw new BadRequestException('selectedSlug không hợp lệ');
    }

    const templateSlug = row.selectedSlug as FunnelTemplateSlug;
    const template =
      getDefaultFunnelTemplate(templateSlug) ??
      DEFAULT_FUNNEL_TEMPLATES.find((t) => t.slug === templateSlug);
    if (!template) {
      throw new BadRequestException('Không tìm thấy template trong catalog');
    }

    const preview = parseFunnelGeneratorResult(row.result);
    const option = preview.recommendations.find((r) => r.templateSlug === templateSlug);

    let complete: FunnelCompleteSpec;
    let source: 'ai' | 'fallback' = 'fallback';

    try {
      if (this.openAi.isConfigured()) {
        const raw = await this.generateCompleteWithAi({
          prompt: row.prompt,
          analysis: preview.analysis,
          option,
          template,
        });
        complete = sanitizeFunnelCompleteSpec(raw, {
          templateSlug,
          template,
          option,
          analysis: preview.analysis,
        });
        source = 'ai';
      } else {
        complete = buildFallbackFunnelComplete({
          templateSlug,
          option,
          analysis: preview.analysis,
        });
      }
    } catch (err) {
      this.logger.warn(`Complete funnel AI failed, fallback: ${String(err)}`);
      complete = buildFallbackFunnelComplete({
        templateSlug,
        option,
        analysis: preview.analysis,
      });
      source = 'fallback';
    }

    // Final validate before persist
    complete = sanitizeFunnelCompleteSpec(complete, {
      templateSlug,
      template,
      option,
      analysis: preview.analysis,
    });

    const updated = await this.prisma.funnelRecommendation.update({
      where: { id: row.id },
      data: {
        completeSpec: complete as unknown as Prisma.InputJsonValue,
        completeSource: source,
        completeGeneratedAt: new Date(),
      },
    });

    return {
      recommendationId: updated.id,
      templateSlug,
      source,
      complete,
      applied: false,
      deployable: false,
      mode: 'draft' as const,
    };
  }

  /**
   * Save Funnel Canvas draft — validates funnel-complete.v1 + graph before persist.
   */
  async saveCompleteDraft(
    user: AuthUser,
    recommendationId: string,
    dto: SaveFunnelCompleteDraftDto,
  ) {
    const row = await this.prisma.funnelRecommendation.findFirst({
      where: { id: recommendationId, organizationId: user.organizationId },
    });
    if (!row) throw new NotFoundException('Recommendation not found');
    if (row.status === 'ARCHIVED') {
      throw new BadRequestException('Funnel ARCHIVED — không sửa draft, hãy clone');
    }
    if (!row.completeSpec) {
      throw new BadRequestException('Chưa có completeSpec — hãy generate-complete trước');
    }

    let current: FunnelCompleteSpec;
    try {
      current = parseFunnelCompleteSpec(row.completeSpec);
    } catch {
      throw new BadRequestException('completeSpec hiện tại không hợp lệ');
    }

    const incoming = dto.complete;
    if (!incoming || typeof incoming !== 'object') {
      throw new BadRequestException('complete phải là object');
    }

    try {
      const nodes = Array.isArray((incoming as { nodes?: unknown }).nodes)
        ? ((incoming as { nodes: FunnelCompleteSpec['nodes'] }).nodes)
        : current.nodes;
      const connections = Array.isArray((incoming as { connections?: unknown }).connections)
        ? ((incoming as { connections: FunnelCompleteSpec['connections'] }).connections)
        : current.connections;

      const graphOnly = applyFunnelCanvasDraft(current, {
        name:
          typeof (incoming as { name?: unknown }).name === 'string'
            ? (incoming as { name: string }).name
            : current.name,
        offer:
          typeof (incoming as { offer?: unknown }).offer === 'string'
            ? (incoming as { offer: string }).offer
            : current.offer,
        cta:
          typeof (incoming as { cta?: unknown }).cta === 'string'
            ? (incoming as { cta: string }).cta
            : current.cta,
        strategy:
          typeof (incoming as { strategy?: unknown }).strategy === 'string'
            ? (incoming as { strategy: string }).strategy
            : current.strategy,
        summary:
          typeof (incoming as { summary?: unknown }).summary === 'string'
            ? (incoming as { summary: string }).summary
            : current.summary,
        nodes,
        connections,
      });

      const contentMerged = parseFunnelCompleteSpec({
        ...current,
        ...graphOnly,
        leadForm: (incoming as { leadForm?: unknown }).leadForm ?? current.leadForm,
        chatbotFlow: (incoming as { chatbotFlow?: unknown }).chatbotFlow ?? current.chatbotFlow,
        followUp: (incoming as { followUp?: unknown }).followUp ?? current.followUp,
        automations: (incoming as { automations?: unknown }).automations ?? current.automations,
        leadScoring: (incoming as { leadScoring?: unknown }).leadScoring ?? current.leadScoring,
        salesHandoff: (incoming as { salesHandoff?: unknown }).salesHandoff ?? current.salesHandoff,
        booking: (incoming as { booking?: unknown }).booking ?? current.booking,
        remarketing: (incoming as { remarketing?: unknown }).remarketing ?? current.remarketing,
        conversionGoal:
          (incoming as { conversionGoal?: unknown }).conversionGoal ?? current.conversionGoal,
        kpis: (incoming as { kpis?: unknown }).kpis ?? current.kpis,
        schemaVersion: 'funnel-complete.v1',
        mode: 'draft',
        templateSlug: current.templateSlug,
      });

      assertFunnelCompleteDraft(contentMerged);

      const updated = await this.prisma.funnelRecommendation.update({
        where: { id: row.id },
        data: {
          completeSpec: contentMerged as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        recommendationId: updated.id,
        complete: contentMerged,
        applied: false,
        deployable: false,
        mode: 'draft' as const,
        liveFrozen: row.status === 'ACTIVE',
        publishedVersion: row.publishedVersion,
      };
    } catch (err) {
      if (err instanceof FunnelCanvasValidationError) {
        throw new BadRequestException({
          message: err.message,
          issues: err.issues,
        });
      }
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`saveCompleteDraft failed: ${String(err)}`);
      throw new BadRequestException('Không lưu được draft — schema/graph không hợp lệ');
    }
  }

  private async generateCompleteWithAi(input: {
    prompt: string;
    analysis: FunnelGeneratorResult['analysis'];
    option?: FunnelRecommendationOption;
    template: (typeof DEFAULT_FUNNEL_TEMPLATES)[number];
  }): Promise<unknown> {
    const system = `Bạn là kiến trúc sư funnel spa/beauty. Điền nội dung Funnel hoàn chỉnh.
Trả về ĐÚNG 1 JSON object (không markdown) theo schema funnel-complete.v1.
Chỉ được dùng các field trong schema. Không invent key mới.
templateSlug BẮT BUỘC = "${input.template.slug}".
nodes.id nên khớp template nodes khi có thể: ${JSON.stringify(input.template.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label })))}.
schemaVersion = "funnel-complete.v1", mode = "draft".
Bắt buộc có: offer, cta, stages, nodes, connections, leadForm, chatbotFlow, followUp, leadScoring, salesHandoff, booking, remarketing, conversionGoal, kpis.
Ngôn ngữ tiếng Việt.`;

    const userMsg = JSON.stringify({
      prompt: input.prompt,
      analysis: input.analysis,
      selectedOption: input.option,
      templateGoal: input.template.goal,
      templateAutomations: input.template.recommendedAutomation,
    });

    const raw = await this.openAi.chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.3,
      maxTokens: 3500,
      timeoutMs: 60_000,
    });

    const jsonText = extractJsonObject(raw);
    return JSON.parse(jsonText);
  }

  private enrichWithHints(
    result: FunnelGeneratorResult,
    dto: GenerateFunnelRecommendationsDto,
  ): FunnelGeneratorResult {
    const channels =
      dto.channels && dto.channels.length > 0
        ? dto.channels
        : result.analysis.channels;
    return parseFunnelGeneratorResult({
      ...result,
      analysis: {
        ...result.analysis,
        industry: dto.industryHint || result.analysis.industry,
        service: dto.productService || result.analysis.service,
        goal: dto.goal || result.analysis.goal,
        targetAudience: dto.audience || result.analysis.targetAudience,
        offer: dto.price
          ? `${result.analysis.offer || dto.productService || 'Ưu đãi'} — giá ${dto.price}`
          : result.analysis.offer,
        channels,
        regionHint: dto.regionHint ?? dto.region ?? result.analysis.regionHint ?? null,
        budgetHint: dto.budgetHint ?? dto.budget ?? result.analysis.budgetHint ?? null,
      },
    });
  }

  private sanitizeResult(raw: FunnelGeneratorResult, prompt: string): FunnelGeneratorResult {
    // Drop any hallucinated slugs; re-validate length 3–5
    const filtered = raw.recommendations.filter((r) => ALLOWED_SLUGS.has(r.templateSlug));
    const dedup = new Map<string, FunnelRecommendationOption>();
    for (const r of filtered.sort((a, b) => b.fitScore - a.fitScore)) {
      if (!dedup.has(r.templateSlug)) dedup.set(r.templateSlug, r);
    }
    let recommendations = [...dedup.values()].slice(0, 5);

    if (recommendations.length < 3) {
      const fallback = buildFallbackFunnelRecommendations(prompt).recommendations;
      for (const f of fallback) {
        if (recommendations.length >= 5) break;
        if (!recommendations.some((r) => r.templateSlug === f.templateSlug)) {
          recommendations.push(f);
        }
      }
      recommendations = recommendations.slice(0, 5);
    }

    if (recommendations.length < 3) {
      throw new BadRequestException('Không đủ recommendation hợp lệ từ template catalog');
    }

    return parseFunnelGeneratorResult({
      ...raw,
      prompt,
      schemaVersion: 'funnel-generator.v1',
      mode: 'preview',
      recommendations,
      disclaimers: [
        'Chỉ đề xuất preview — chưa apply/deploy pipeline hoặc automation.',
        'Chỉ dùng templateSlug thuộc Funnel Template Engine.',
        ...(raw.disclaimers ?? []).slice(0, 3),
      ].slice(0, 5),
    });
  }

  private async generateWithAi(
    dto: GenerateFunnelRecommendationsDto,
    catalog: Array<{
      slug: string;
      name: string;
      category?: string;
      description?: string;
      goal: string;
      tags?: string[];
    }>,
  ): Promise<FunnelGeneratorResult> {
    const system = `Bạn là chuyên gia funnel marketing spa/beauty SaaS multi-tenant.
Nhiệm vụ: phân tích brief tiếng Việt và đề xuất 3–5 funnel CHỈ từ catalog template cho trước.
Trả về ĐÚNG 1 JSON object (không markdown) theo schema:
{
  "schemaVersion": "funnel-generator.v1",
  "prompt": string,
  "analysis": {
    "industry": string,
    "service": string,
    "goal": string,
    "targetAudience": string,
    "painPoints": string[],
    "offer": string,
    "leadMagnet": string,
    "channels": string[],
    "budgetHint": string|null,
    "regionHint": string|null,
    "confidence": number
  },
  "recommendations": [{
    "templateSlug": string, // BẮT BUỘC một trong catalog.slug
    "funnelName": string,
    "strategy": string,
    "fitReason": string,
    "offer": string,
    "customerJourney": [{ "step": number, "label": string, "description"?: string }],
    "channels": string[],
    "cta": string,
    "fitScore": number // 0-100
  }],
  "mode": "preview",
  "disclaimers": string[]
}
Quy tắc cứng:
- KHÔNG invent templateSlug ngoài catalog.
- KHÔNG apply/deploy — mode luôn "preview".
- recommendations.length từ 3 đến 5, mỗi slug tối đa 1 lần.
- fitScore phản ánh độ phù hợp với brief.
- Ngôn ngữ tiếng Việt.`;

    const userMsg = [
      `Brief: ${dto.prompt}`,
      dto.productService ? `Sản phẩm/dịch vụ: ${dto.productService}` : null,
      dto.goal ? `Mục tiêu: ${dto.goal}` : null,
      dto.price ? `Giá bán: ${dto.price}` : null,
      dto.audience ? `Đối tượng: ${dto.audience}` : null,
      dto.channels?.length ? `Kênh marketing: ${dto.channels.join(', ')}` : null,
      dto.notes ? `Mô tả thêm: ${dto.notes}` : null,
      dto.industryHint ? `Gợi ý ngành: ${dto.industryHint}` : null,
      dto.regionHint || dto.region ? `Khu vực: ${dto.regionHint || dto.region}` : null,
      dto.budgetHint || dto.budget ? `Ngân sách: ${dto.budgetHint || dto.budget}` : null,
      `Catalog templates: ${JSON.stringify(catalog)}`,
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await this.openAi.chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.35,
      maxTokens: 2500,
      timeoutMs: 45_000,
    });

    const jsonText = extractJsonObject(raw);
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return parseFunnelGeneratorResult({
      ...parsed,
      schemaVersion: 'funnel-generator.v1',
      prompt: dto.prompt,
      mode: 'preview',
    });
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

function funnelSpecField(raw: unknown, key: 'name' | 'offer'): string | null {
  let obj: unknown = raw;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj) as unknown;
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : null;
}

/** Compose structured create-funnel form into one brief for AI + storage */
export function composeFunnelBriefPrompt(dto: GenerateFunnelRecommendationsDto): string {
  const lines = [
    dto.productService ? `Sản phẩm/dịch vụ: ${dto.productService.trim()}` : null,
    dto.goal ? `Mục tiêu: ${dto.goal.trim()}` : null,
    dto.price ? `Giá bán: ${dto.price.trim()}` : null,
    dto.budget || dto.budgetHint
      ? `Ngân sách: ${(dto.budget || dto.budgetHint || '').trim()}`
      : null,
    dto.region || dto.regionHint
      ? `Khu vực: ${(dto.region || dto.regionHint || '').trim()}`
      : null,
    dto.audience ? `Đối tượng: ${dto.audience.trim()}` : null,
    dto.channels?.length ? `Kênh marketing: ${dto.channels.map((c) => c.trim()).filter(Boolean).join(', ')}` : null,
    dto.notes ? `Mô tả thêm: ${dto.notes.trim()}` : null,
    `Bạn muốn AI tạo phễu như thế nào?: ${dto.prompt.trim()}`,
  ].filter(Boolean);

  const composed = lines.join('\n');
  return composed.length >= 8 ? composed : dto.prompt.trim();
}
