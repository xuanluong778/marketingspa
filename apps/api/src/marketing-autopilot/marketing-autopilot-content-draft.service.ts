import { Injectable, NotFoundException } from '@nestjs/common';
import {
  assertAutopilotContentBundleQuality,
  formatAutopilotContentBundleScript,
  formatAutopilotContentIdeaMarkdown,
  generateAutopilotContentIdeas,
  parseAutopilotContentBundleFromScript,
  type AutopilotContentDraftBundle,
  type AutopilotContentDraftInput,
  type AutopilotContentIdea,
} from '@marketingspa/shared';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { TeleprompterSourceService } from '../content-marketing/teleprompter-source.service';
import { OpenAiService } from '../openai/openai.service';
import { extractMarketingAutopilotPlannerJson } from '@marketingspa/shared';
import type { MarketingAutopilotPlan } from './marketing-autopilot.types';

@Injectable()
export class MarketingAutopilotContentDraftService {
  constructor(
    private readonly teleprompter: TeleprompterSourceService,
    private readonly openai: OpenAiService,
  ) {}

  buildInputFromPlan(
    plan: MarketingAutopilotPlan,
    project: {
      id?: string;
      name?: string;
      productName?: string | null;
      productPrice?: number | null;
      customerProfile?: string | null;
      targetArea?: string | null;
      primaryGoal?: string | null;
    },
  ): AutopilotContentDraftInput {
    return {
      productName: plan.offer?.productName || project.productName || 'Sản phẩm',
      productPrice: plan.offer?.productPrice ?? (project.productPrice != null ? Number(project.productPrice) : undefined),
      customerProfile: plan.customersTarget?.targetProfile || project.customerProfile || '',
      targetArea: plan.customersTarget?.targetArea || project.targetArea || '',
      primaryGoal: plan.offer?.primaryGoal || project.primaryGoal || '',
      valueProps: plan.offer?.valueProps,
      valueProposition: plan.valueProposition,
      icpProfiles: plan.icpProfiles,
    };
  }

  async generateBundle(
    plan: MarketingAutopilotPlan,
    project: {
      id?: string;
      name?: string;
      productName?: string | null;
      productPrice?: number | null;
      customerProfile?: string | null;
      targetArea?: string | null;
      primaryGoal?: string | null;
    },
    opts?: { variantSeed?: number },
  ): Promise<AutopilotContentDraftBundle> {
    const input = this.buildInputFromPlan(plan, project);
    const base = generateAutopilotContentIdeas(input, opts);
    if (!this.openai.isConfigured()) return base;
    try {
      const enriched = await this.tryLlmEnrich(input, base);
      return enriched ?? base;
    } catch {
      return base;
    }
  }

  private async tryLlmEnrich(
    input: AutopilotContentDraftInput,
    base: AutopilotContentDraftBundle,
  ): Promise<AutopilotContentDraftBundle | null> {
    const prompt = [
      'Bạn là copywriter marketing spa/làm đẹp Việt Nam. Cải thiện 5 content ideas sau — giữ format JSON, index 1-5.',
      'Yêu cầu: cụ thể theo sản phẩm/ICP/khu vực; KHÔNG dùng "Angle theo lợi ích", "Short video", "Carousel" làm title.',
      'NGÀNH NHẠY CẢM: không cam kết 100%, không bịa số liệu, dùng "có thể hỗ trợ", "tùy cơ địa".',
      `Sản phẩm: ${input.productName}. ICP: ${input.customerProfile}. Khu vực: ${input.targetArea}. Mục tiêu: ${input.primaryGoal}.`,
      'Trả về JSON object { "ideas": [...] } cùng schema (title, hook, customerInsight, angle, fullContent, offer, cta, channel, format, formatLabel, shortVideo?, carousel?, safetyNotes?).',
      'Draft hiện tại:',
      JSON.stringify(base.ideas).slice(0, 12000),
    ].join('\n');

    const raw = await this.openai.chatCompletion({
      messages: [
        { role: 'system', content: 'Trả về JSON hợp lệ duy nhất, không markdown.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      maxTokens: 4000,
      timeoutMs: 25000,
    });
    const json = extractMarketingAutopilotPlannerJson(raw);
    if (!json || typeof json !== 'object') return null;
    const ideas = (json as { ideas?: AutopilotContentIdea[] }).ideas;
    if (!Array.isArray(ideas) || ideas.length < 5) return null;
    const merged: AutopilotContentDraftBundle = {
      ...base,
      ideas: ideas.slice(0, 5).map((idea, i) => ({ ...base.ideas[i]!, ...idea, index: i + 1 })),
    };
    // Never persist LLM enrichment that fails quality/generic checks — keep deterministic base.
    if (!assertAutopilotContentBundleQuality(merged)) return null;
    return merged;
  }

  async upsertTeleprompterFromBundle(
    user: AuthUser,
    project: { id: string; name: string },
    bundle: AutopilotContentDraftBundle,
    existingContentId?: string | null,
  ) {
    const script = formatAutopilotContentBundleScript(bundle);
    const firstVideo = bundle.ideas.find((i) => i.format === 'short_video') ?? bundle.ideas[0]!;
    return this.teleprompter.upsert(user, {
      id: existingContentId ?? undefined,
      sourceType: 'marketing_autopilot',
      sourceRoute: `/marketing-autopilot/projects/${project.id}`,
      sourceTitle: `Autopilot: ${project.name}`.slice(0, 500),
      originalScript: script,
      editedScript: script,
      clientContentId: `autopilot-content-${project.id}`,
      videoHook: firstVideo.hook?.slice(0, 500),
      facebookPost: firstVideo.hook?.slice(0, 2000),
    });
  }

  async saveIdeaToStudio(
    user: AuthUser,
    project: { id: string; name: string },
    idea: AutopilotContentIdea,
  ) {
    const script = formatAutopilotContentIdeaMarkdown(idea);
    return this.teleprompter.upsert(user, {
      sourceType: 'marketing_autopilot',
      sourceRoute: `/marketing-autopilot/projects/${project.id}`,
      sourceTitle: `${project.name} — Idea ${idea.index}: ${idea.title}`.slice(0, 500),
      originalScript: script,
      editedScript: script,
      clientContentId: `autopilot-content-${project.id}-idea-${idea.index}-${Date.now()}`,
      videoHook: idea.hook?.slice(0, 500),
      facebookPost: idea.hook?.slice(0, 2000),
    });
  }

  parseBundleFromTeleprompter(script: string): AutopilotContentDraftBundle | null {
    return parseAutopilotContentBundleFromScript(script);
  }

  assertTeleprompterFound(row: { id: string } | null): asserts row is { id: string } {
    if (!row) throw new NotFoundException('Không tìm thấy Content Draft');
  }
}
