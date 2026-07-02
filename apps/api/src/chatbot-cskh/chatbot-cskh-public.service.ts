import { Injectable } from '@nestjs/common';
import { ChatbotBotStatus } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import { ChatbotCskhService } from './chatbot-cskh.service';
import { PublicLeadDto, PublicMessageDto } from './dto/chatbot-cskh.dto';
import { generateAiReply } from './utils/chatbot-ai.util';
import { CREDIT_EXHAUSTED_MESSAGE, defaultGreeting } from './utils/chatbot-constants';

interface RateBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class ChatbotCskhPublicService {
  private readonly rateLimits = new Map<string, RateBucket>();
  private readonly minIntervalMs = 2000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatbot: ChatbotCskhService,
    private readonly openAi: OpenAiService,
  ) {}

  async getPublicConfig(botId: string, pageUrl = '', origin = '') {
    const evalResult = await this.evaluateBot(botId, pageUrl, origin);
    if (!evalResult.allowed) {
      return { ok: true, blocked: true, ...evalResult };
    }
    return { ok: true, blocked: false, ...evalResult };
  }

  async processMessage(dto: PublicMessageDto, origin = '', referer = '') {
    const evalResult = await this.evaluateBot(dto.botId, dto.pageUrl ?? '', origin, referer);
    if (!evalResult.allowed) {
      return {
        ok: false,
        message: evalResult.message,
        reply: evalResult.message,
        code: evalResult.code,
      };
    }

    const rateKey = `${dto.botId}:${dto.sessionId ?? 'anon'}`;
    if (!this.checkRateLimit(rateKey)) {
      return {
        ok: false,
        code: 'rate_limited',
        message: 'Bạn gửi tin nhắn quá nhanh. Vui lòng đợi vài giây rồi thử lại.',
        reply: 'Bạn gửi tin nhắn quá nhanh. Vui lòng đợi vài giây rồi thử lại.',
      };
    }

    const bot = await this.chatbot.findBotPublic(dto.botId);
    if (!bot) {
      return { ok: false, message: 'Chatbot không hợp lệ.', reply: 'Chatbot không hợp lệ.' };
    }

    const sessionId = this.normalizeSession(dto.sessionId);
    const conversation = await this.getOrCreateConversation(bot.organizationId, bot.id, sessionId);

    await this.prisma.chatbotMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        message: dto.message.trim(),
      },
    });

    const [sources, history, settings, usage] = await Promise.all([
      this.prisma.chatbotKnowledgeSource.findMany({
        where: { botId: bot.id, status: { in: ['active', 'ready'] } },
      }),
      this.prisma.chatbotMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
      this.chatbot.getSettings(bot.organizationId),
      this.chatbot.getUsageSnapshot(bot.organizationId),
    ]);

    const openAiChat = this.openAi.isConfigured()
      ? async (input: {
          model: string;
          systemPrompt: string;
          history: Array<{ role: string; content: string }>;
          userText: string;
          temperature: number;
        }) =>
          this.openAi.chatCompletion({
            model: input.model,
            temperature: input.temperature,
            maxTokens: 500,
            messages: [
              { role: 'system', content: input.systemPrompt },
              ...input.history.slice(-8),
              { role: 'user', content: input.userText },
            ],
          })
      : undefined;

    const aiResult = await generateAiReply({
      bot,
      userText: dto.message,
      sources,
      history,
      settings,
      usageAllowed: usage.allowed,
      openAiChat,
    });

    await this.prisma.chatbotMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        message: aiResult.reply,
      },
    });

    await this.prisma.chatbotConversation.update({
      where: { id: conversation.id },
      data: { lastUserMessageAt: new Date(), updatedAt: new Date() },
    });

    if (aiResult.usedAi) {
      await this.incrementUsage(bot.organizationId, bot.id);
    }

    return {
      ok: true,
      reply: aiResult.reply,
      session_id: sessionId,
      show_lead: aiResult.showLead,
      no_data: aiResult.noData,
      used_ai: aiResult.usedAi,
    };
  }

  async submitLead(dto: PublicLeadDto) {
    const evalResult = await this.evaluateBot(dto.botId, dto.pageUrl ?? '');
    if (!evalResult.allowed) {
      return { ok: false, message: evalResult.message, code: evalResult.code };
    }

    const bot = await this.chatbot.findBotPublic(dto.botId);
    if (!bot) {
      return { ok: false, message: 'Chatbot không hợp lệ.' };
    }

    const sessionId = this.normalizeSession(dto.sessionId);
    const conversation = await this.getOrCreateConversation(bot.organizationId, bot.id, sessionId);

    const lead = await this.prisma.chatbotLead.create({
      data: {
        organizationId: bot.organizationId,
        botId: bot.id,
        conversationId: conversation.id,
        name: dto.name,
        phone: dto.phone,
        need: dto.need,
        pageUrl: dto.pageUrl,
      },
    });

    await this.prisma.chatbotConversation.update({
      where: { id: conversation.id },
      data: {
        visitorName: dto.name || conversation.visitorName,
        visitorPhone: dto.phone,
        status: 'NEEDS_STAFF',
      },
    });

    const leadSource = await this.prisma.leadSource.findFirst({
      where: { organizationId: bot.organizationId, code: 'CHATBOT' },
    });

    if (leadSource) {
      await this.prisma.lead.create({
        data: {
          organizationId: bot.organizationId,
          leadSourceId: leadSource.id,
          name: dto.name || 'Khách chatbot',
          phone: dto.phone,
          note: dto.need || 'Lead từ Chatbot CSKH',
          pipelineStatus: 'NEW',
        },
      });
    }

    return {
      ok: true,
      message: 'Cảm ơn bạn! Nhân viên sẽ liên hệ sớm nhất.',
      lead_id: lead.id,
    };
  }

  private async evaluateBot(botId: string, pageUrl = '', origin = '', referer = '') {
    const bot = await this.chatbot.findBotPublic(botId);
    if (!bot) {
      return { allowed: false, code: 'not_found', message: 'Chatbot không khả dụng.' };
    }

    if (!this.validateOrigin(bot.allowedDomains, origin, referer, pageUrl)) {
      return {
        allowed: false,
        code: 'origin_denied',
        message: 'Chatbot không khả dụng trên website này.',
      };
    }

    if (bot.status !== ChatbotBotStatus.ACTIVE) {
      const code = bot.status === 'PAUSED' ? 'bot_paused' : 'bot_inactive';
      return {
        allowed: false,
        code,
        message:
          code === 'bot_paused'
            ? 'Chatbot đang bảo trì. Bạn có thể gọi hotline trên website.'
            : 'Chatbot đang tạm dừng. Vui lòng liên hệ trực tiếp qua website.',
      };
    }

    const usage = await this.chatbot.getUsageSnapshot(bot.organizationId);
    if (!usage.allowed) {
      return {
        allowed: false,
        code: 'limit_exceeded',
        message: CREDIT_EXHAUSTED_MESSAGE,
        usage: { used: usage.used, limit: usage.limit, remaining: usage.remaining },
      };
    }

    const greeting =
      bot.greeting?.trim() ||
      defaultGreeting(bot.botName, bot.businessName ?? '', bot.consultationTone);

    return {
      allowed: true,
      code: 'ok',
      bot_id: bot.id,
      bot_name: bot.botName,
      business_name: bot.businessName ?? '',
      hotline: bot.hotline ?? '',
      greeting,
      avatar_url: '/chatbot/cskh-launcher.png',
    };
  }

  private validateOrigin(
    allowedDomains: string | null | undefined,
    origin: string,
    referer: string,
    pageUrl: string,
  ): boolean {
    const allowed = (allowedDomains ?? '')
      .split(/[,\s;]+/)
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    if (!allowed.length) return true;

    const candidates = [origin, referer, pageUrl].filter(Boolean);
    for (const url of candidates) {
      try {
        const host = new URL(url).hostname.toLowerCase();
        if (allowed.some((d) => host === d || host.endsWith(`.${d}`))) return true;
      } catch {
        /* skip invalid url */
      }
    }
    return false;
  }

  private checkRateLimit(key: string): boolean {
    const now = Date.now();
    const bucket = this.rateLimits.get(key);
    if (!bucket || now > bucket.resetAt) {
      this.rateLimits.set(key, { count: 1, resetAt: now + this.minIntervalMs });
      return true;
    }
    if (bucket.count >= 3) return false;
    bucket.count += 1;
    return true;
  }

  private normalizeSession(sessionId?: string): string {
    const s = (sessionId ?? '').trim();
    if (s.length >= 8 && s.length <= 64) return s;
    return this.chatbot.newSessionId();
  }

  private async getOrCreateConversation(organizationId: string, botId: string, sessionId: string) {
    const existing = await this.prisma.chatbotConversation.findUnique({
      where: { botId_sessionId: { botId, sessionId } },
    });
    if (existing) return existing;

    return this.prisma.chatbotConversation.create({
      data: {
        organizationId,
        botId,
        sessionId,
        channel: 'website',
        status: 'OPEN',
      },
    });
  }

  private async incrementUsage(organizationId: string, botId: string) {
    const month = new Date().toISOString().slice(0, 7);
    await this.prisma.chatbotUsage.upsert({
      where: {
        organizationId_month_botId: { organizationId, month, botId },
      },
      create: { organizationId, botId, month, aiReplies: 1 },
      update: { aiReplies: { increment: 1 } },
    });
  }
}
