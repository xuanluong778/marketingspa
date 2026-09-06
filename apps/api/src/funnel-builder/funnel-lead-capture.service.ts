import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ChatbotBotStatus, ChatbotSourceType } from '@marketingspa/database';
import {
  funnelChatbotGreetingFromFlow,
  mapFunnelFormAnswersToLead,
  parseFunnelCompleteSpec,
  serializeFunnelChatbotFlowToKnowledge,
  validateFunnelFormAnswers,
  type FunnelCompleteSpec,
  type FunnelFormAnswers,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from '../leads/leads.service';
import { ChatbotCskhService } from '../chatbot-cskh/chatbot-cskh.service';
import { FunnelCanvasRuntimeService } from '../crm/funnel-canvas-runtime.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type { SubmitFunnelPublicLeadDto } from './dto/funnel-capture.dto';

const FUNNEL_SOURCE_CODE = 'FUNNEL';
const CHATBOT_SOURCE_CODE = 'CHATBOT';
const FUNNEL_SCRIPT_TITLE_PREFIX = 'Funnel script';

@Injectable()
export class FunnelLeadCaptureService {
  private readonly logger = new Logger(FunnelLeadCaptureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
    private readonly chatbot: ChatbotCskhService,
    private readonly canvasRuntime: FunnelCanvasRuntimeService,
  ) {}

  async ensureLeadSource(organizationId: string, code: string, name: string) {
    const existing = await this.prisma.leadSource.findFirst({
      where: { organizationId, code },
    });
    if (existing) {
      if (!existing.isActive) {
        return this.prisma.leadSource.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
      }
      return existing;
    }
    return this.prisma.leadSource.create({
      data: { organizationId, code, name, isActive: true },
    });
  }

  async getPublicForm(recommendationId: string) {
    const { rec, spec } = await this.requireComplete(recommendationId);
    if (rec.status !== 'ACTIVE') {
      throw new BadRequestException('Funnel chưa ACTIVE — không nhận lead công khai');
    }
    const formId = spec.nodes.find((n) => n.type === 'FORM')?.id ?? rec.id;
    return {
      id: rec.id,
      formId,
      name: spec.name,
      offer: spec.offer,
      cta: spec.cta,
      summary: spec.summary,
      leadForm: spec.leadForm,
      appearance: spec.appearance ?? null,
      chatbotBotId: rec.chatbotBotId,
      mode: spec.mode,
      status: rec.status,
      publishedVersion: rec.publishedVersion,
    };
  }

  async submitPublicLead(recommendationId: string, dto: SubmitFunnelPublicLeadDto) {
    const { rec, spec } = await this.requireComplete(recommendationId);
    if (rec.status !== 'ACTIVE') {
      throw new BadRequestException('Funnel chưa ACTIVE — không nhận lead công khai');
    }
    const answers = (dto.answers ?? {}) as FunnelFormAnswers;
    const valid = validateFunnelFormAnswers(spec, answers);
    if (!valid.ok) {
      throw new BadRequestException({ message: 'Form không hợp lệ', issues: valid.issues });
    }

    const mapped = mapFunnelFormAnswersToLead(spec, answers);
    if (!mapped.phone && spec.leadForm.fields.some((f) => f.required && f.type === 'tel')) {
      throw new BadRequestException('Thiếu số điện thoại');
    }

    const source = await this.ensureLeadSource(
      rec.organizationId,
      FUNNEL_SOURCE_CODE,
      'Funnel Form',
    );

    const attribution = {
      ...(dto.attribution ?? {}),
      utmSource:
        (typeof dto.attribution?.utmSource === 'string' && dto.attribution.utmSource) ||
        'funnel',
      utmMedium:
        (typeof dto.attribution?.utmMedium === 'string' && dto.attribution.utmMedium) ||
        'lead_form',
      utmCampaign:
        (typeof dto.attribution?.utmCampaign === 'string' && dto.attribution.utmCampaign) ||
        spec.templateSlug,
      landingPage: dto.landingPage ?? (dto.attribution?.landingPage as string | undefined),
      referrer: dto.referrer ?? (dto.attribution?.referrer as string | undefined),
    };

    const formId =
      (typeof dto.formId === 'string' && dto.formId.trim()) ||
      spec.nodes.find((n) => n.type === 'FORM')?.id ||
      rec.id;

    const lead = await this.leads.create(rec.organizationId, {
      name: mapped.name,
      phone: mapped.phone,
      email: mapped.email,
      note: mapped.note,
      leadSourceId: source.id,
      funnelRecommendationId: rec.id,
      tags: ['funnel', spec.templateSlug],
      attribution,
      captureMeta: {
        formId,
        funnelId: rec.id,
        name: mapped.name,
        phone: mapped.phone,
        email: mapped.email,
        extra: mapped.extra,
        source: source.code,
      },
    });

    await this.leads.applyScoringEvent({
      organizationId: rec.organizationId,
      leadId: lead.id,
      eventType: 'FORM_SUBMITTED',
      source: 'funnel_form',
    });
    await this.canvasRuntime.advance({
      organizationId: rec.organizationId,
      leadId: lead.id,
      event: 'FORM_SUBMITTED',
      funnelId: rec.id,
    });

    return {
      ok: true,
      leadId: lead.id,
      updated: lead.updatedAt.getTime() - lead.createdAt.getTime() > 2_000,
      message: 'Cảm ơn bạn! Spa sẽ liên hệ sớm qua số điện thoại vừa để lại.',
    };
  }

  async bindChatbot(user: AuthUser, recommendationId: string, botId?: string) {
    const { rec, spec } = await this.requireComplete(recommendationId, user.organizationId);
    await this.ensureLeadSource(user.organizationId, CHATBOT_SOURCE_CODE, 'Chatbot CSKH');

    const greeting = funnelChatbotGreetingFromFlow(spec);
    const knowledge = serializeFunnelChatbotFlowToKnowledge(spec);
    const mainServices = [spec.offer, spec.cta].filter(Boolean).join(' · ').slice(0, 4000);

    let bot;
    const existingId = botId || rec.chatbotBotId;
    if (existingId) {
      bot = await this.chatbot.updateBot(user.organizationId, existingId, {
        botName: spec.chatbotFlow.name.slice(0, 120),
        businessName: spec.name.slice(0, 160),
        industry: spec.templateSlug,
        mainServices,
        greeting,
        consultationTone: 'friendly',
        status: ChatbotBotStatus.ACTIVE,
      });
    } else {
      bot = await this.chatbot.createBot(user.organizationId, {
        botName: spec.chatbotFlow.name.slice(0, 120),
        businessName: spec.name.slice(0, 160),
        industry: spec.templateSlug,
        mainServices,
        greeting,
        consultationTone: 'friendly',
        status: ChatbotBotStatus.ACTIVE,
      });
    }

    const title = `${FUNNEL_SCRIPT_TITLE_PREFIX} ${spec.templateSlug}`.slice(0, 160);
    const existingKb = await this.prisma.chatbotKnowledgeSource.findFirst({
      where: { organizationId: user.organizationId, botId: bot.id, title },
    });
    if (existingKb) {
      await this.prisma.chatbotKnowledgeSource.update({
        where: { id: existingKb.id },
        data: { content: knowledge, status: 'active', sourceType: ChatbotSourceType.MANUAL },
      });
    } else {
      await this.chatbot.createKnowledge(user.organizationId, {
        botId: bot.id,
        title,
        sourceType: ChatbotSourceType.MANUAL,
        content: knowledge,
      });
    }

    await this.prisma.funnelRecommendation.update({
      where: { id: rec.id },
      data: { chatbotBotId: bot.id },
    });

    const embed = await this.chatbot.getEmbedCode(user.organizationId, bot.id);
    this.logger.log(`Bound funnel ${rec.id} → chatbot ${bot.id}`);
    return {
      recommendationId: rec.id,
      botId: bot.id,
      botName: bot.botName,
      greeting,
      embed,
      applied: false,
      deployable: false,
    };
  }

  private async requireComplete(recommendationId: string, organizationId?: string) {
    const rec = await this.prisma.funnelRecommendation.findFirst({
      where: {
        id: recommendationId,
        ...(organizationId ? { organizationId } : {}),
      },
    });
    if (!rec) throw new NotFoundException('Funnel không tồn tại');
    if (!rec.completeSpec && !rec.publishedSpec) {
      throw new BadRequestException('Funnel chưa có completeSpec');
    }
    const liveJson =
      rec.status === 'ACTIVE' && rec.publishedSpec ? rec.publishedSpec : rec.completeSpec;
    if (!liveJson) {
      throw new BadRequestException('Funnel chưa có spec');
    }
    let spec: FunnelCompleteSpec;
    try {
      spec = parseFunnelCompleteSpec(liveJson);
    } catch {
      throw new BadRequestException('completeSpec không hợp lệ');
    }
    return { rec, spec };
  }
}
