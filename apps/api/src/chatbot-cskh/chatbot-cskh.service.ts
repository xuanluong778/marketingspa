import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatbotBotStatus, Prisma } from '@marketingspa/database';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  ConnectFacebookPageDto,
  CreateChannelDto,
  CreateChatbotBotDto,
  CreateKnowledgeSourceDto,
  UpdateChatbotBotDto,
  UpdateSettingsDto,
} from './dto/chatbot-cskh.dto';
import { buildEmbedCode, defaultGreeting, resolveEmbedApiUrl } from './utils/chatbot-constants';
import { ChatbotFacebookWebhookService } from './chatbot-facebook-webhook.service';

const MAX_BOTS = 10;
const MAX_SOURCES = 50;
const MAX_CHANNELS = 30;

@Injectable()
export class ChatbotCskhService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => ChatbotFacebookWebhookService))
    private readonly facebookWebhook: ChatbotFacebookWebhookService,
  ) {}

  private appBaseUrl(): string {
    return (
      this.config.get<string>('NEXT_PUBLIC_APP_URL') ??
      this.config.get<string>('APP_BASE_URL') ??
      'http://localhost:3000'
    );
  }

  private apiBaseUrl(): string {
    return (
      this.config.get<string>('CHATBOT_PUBLIC_API_URL') ??
      this.config.get<string>('NEXT_PUBLIC_API_URL') ??
      this.config.get<string>('API_BASE_URL') ??
      'http://localhost:4000'
    );
  }

  private embedApiUrl(websiteUrl?: string | null): string {
    const tunnel = this.config.get<string>('CHATBOT_TUNNEL_URL')?.trim();
    if (tunnel) return tunnel.replace(/\/$/, '');

    return resolveEmbedApiUrl(websiteUrl, {
      explicitUrl: this.config.get<string>('CHATBOT_PUBLIC_API_URL'),
      fallbackUrl: this.apiBaseUrl(),
      proxyPath: this.config.get<string>('CHATBOT_PROXY_PATH') ?? 'chatbot-api',
    });
  }

  async getOverview(organizationId: string) {
    const [bots, sources, channels, conversations, leadsToday, usage] = await Promise.all([
      this.prisma.chatbotBot.findMany({ where: { organizationId } }),
      this.prisma.chatbotKnowledgeSource.count({ where: { organizationId } }),
      this.prisma.chatbotChannel.count({ where: { organizationId } }),
      this.prisma.chatbotConversation.count({ where: { organizationId } }),
      this.prisma.chatbotLead.count({
        where: {
          organizationId,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      this.getUsageSnapshot(organizationId),
    ]);

    return {
      botsTotal: bots.length,
      botsActive: bots.filter((b) => b.status === ChatbotBotStatus.ACTIVE).length,
      sourcesTotal: sources,
      channelsTotal: channels,
      conversationsTotal: conversations,
      leadsToday,
      monthlyRepliesUsed: usage.used,
      monthlyReplyLimit: usage.limit,
      repliesRemaining: usage.remaining,
    };
  }

  async listBots(organizationId: string) {
    const bots = await this.prisma.chatbotBot.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });
    return bots.map((b) => this.enrichBot(b));
  }

  async getBot(organizationId: string, id: string) {
    const bot = await this.findBotOrThrow(organizationId, id);
    return this.enrichBot(bot);
  }

  async createBot(organizationId: string, dto: CreateChatbotBotDto) {
    const count = await this.prisma.chatbotBot.count({ where: { organizationId } });
    if (count >= MAX_BOTS) {
      throw new BadRequestException(`Tối đa ${MAX_BOTS} chatbot.`);
    }

    const bot = await this.prisma.chatbotBot.create({
      data: {
        organizationId,
        botName: dto.botName,
        websiteUrl: dto.websiteUrl,
        businessName: dto.businessName,
        industry: dto.industry,
        hotline: dto.hotline,
        mainServices: dto.mainServices,
        consultationTone: dto.consultationTone ?? 'friendly',
        greeting: dto.greeting,
        allowedDomains: dto.allowedDomains,
        status: dto.status ?? ChatbotBotStatus.DRAFT,
      },
    });

    await this.prisma.chatbotChannel.create({
      data: {
        organizationId,
        botId: bot.id,
        name: 'Website Widget',
        channelType: 'WEBSITE_WIDGET',
        status: 'PENDING',
      },
    });

    return this.enrichBot(bot);
  }

  async updateBot(organizationId: string, id: string, dto: UpdateChatbotBotDto) {
    await this.findBotOrThrow(organizationId, id);
    const bot = await this.prisma.chatbotBot.update({
      where: { id },
      data: dto,
    });
    return this.enrichBot(bot);
  }

  async deleteBot(organizationId: string, id: string) {
    await this.findBotOrThrow(organizationId, id);
    await this.prisma.chatbotBot.delete({ where: { id } });
    return { success: true };
  }

  async getEmbedCode(organizationId: string, id: string) {
    const bot = await this.findBotOrThrow(organizationId, id);
    const apiUrl = this.embedApiUrl(bot.websiteUrl);
    return {
      botId: bot.id,
      embedCode: buildEmbedCode(bot.id, apiUrl),
      widgetUrl: `${apiUrl}/chatbot/widget.js`,
      publicApiUrl: `${apiUrl}/api/v1/chatbot-cskh/public`,
      proxyRequired: (() => {
        try {
          return new URL(apiUrl).protocol === 'https:';
        } catch {
          return false;
        }
      })(),
    };
  }

  async listKnowledge(organizationId: string, botId?: string) {
    return this.prisma.chatbotKnowledgeSource.findMany({
      where: {
        organizationId,
        ...(botId ? { botId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createKnowledge(organizationId: string, dto: CreateKnowledgeSourceDto) {
    await this.findBotOrThrow(organizationId, dto.botId);
    const count = await this.prisma.chatbotKnowledgeSource.count({
      where: { organizationId, botId: dto.botId },
    });
    if (count >= MAX_SOURCES) {
      throw new BadRequestException(`Tối đa ${MAX_SOURCES} nguồn dữ liệu.`);
    }

    return this.prisma.chatbotKnowledgeSource.create({
      data: {
        organizationId,
        botId: dto.botId,
        title: dto.title,
        sourceType: dto.sourceType,
        content: dto.content,
        url: dto.url,
        status: 'active',
      },
    });
  }

  async deleteKnowledge(organizationId: string, id: string) {
    const row = await this.prisma.chatbotKnowledgeSource.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy nguồn dữ liệu');
    await this.prisma.chatbotKnowledgeSource.delete({ where: { id } });
    return { success: true };
  }

  async listChannels(organizationId: string) {
    return this.prisma.chatbotChannel.findMany({
      where: { organizationId },
      include: { bot: { select: { id: true, botName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createChannel(organizationId: string, dto: CreateChannelDto) {
    const count = await this.prisma.chatbotChannel.count({ where: { organizationId } });
    if (count >= MAX_CHANNELS) {
      throw new BadRequestException(`Tối đa ${MAX_CHANNELS} kênh.`);
    }
    if (dto.botId) await this.findBotOrThrow(organizationId, dto.botId);

    return this.prisma.chatbotChannel.create({
      data: {
        organizationId,
        botId: dto.botId,
        name: dto.name,
        channelType: dto.channelType,
        status: 'PENDING',
      },
      include: { bot: { select: { id: true, botName: true } } },
    });
  }

  async deleteChannel(organizationId: string, id: string) {
    const row = await this.prisma.chatbotChannel.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy kênh');
    await this.prisma.chatbotChannel.delete({ where: { id } });
    return { success: true };
  }

  async listConversations(organizationId: string, limit = 50) {
    return this.prisma.chatbotConversation.findMany({
      where: { organizationId },
      include: {
        bot: { select: { id: true, botName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  async getConversation(organizationId: string, id: string) {
    const conv = await this.prisma.chatbotConversation.findFirst({
      where: { id, organizationId },
      include: {
        bot: { select: { id: true, botName: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!conv) throw new NotFoundException('Không tìm thấy hội thoại');
    return conv;
  }

  async listLeads(organizationId: string, limit = 50) {
    return this.prisma.chatbotLead.findMany({
      where: { organizationId },
      include: { bot: { select: { id: true, botName: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  async getSettings(organizationId: string) {
    return this.ensureSettings(organizationId);
  }

  async updateSettings(organizationId: string, dto: UpdateSettingsDto) {
    await this.ensureSettings(organizationId);
    return this.prisma.chatbotOrgSettings.update({
      where: { organizationId },
      data: dto,
    });
  }

  async listFacebookPages(organizationId: string) {
    return this.prisma.chatbotFacebookPage.findMany({
      where: { organizationId },
      include: { bot: { select: { id: true, botName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async connectFacebookPage(organizationId: string, dto: ConnectFacebookPageDto) {
    await this.findBotOrThrow(organizationId, dto.botId);
    const subscribed = await this.facebookWebhook.subscribePageWebhook(
      dto.pageId,
      dto.pageAccessToken,
    );

    return this.prisma.chatbotFacebookPage.upsert({
      where: { pageId: dto.pageId },
      create: {
        organizationId,
        botId: dto.botId,
        pageId: dto.pageId,
        pageName: dto.pageName,
        pageAccessTokenEncrypted: Buffer.from(dto.pageAccessToken).toString('base64'),
        aiEnabled: dto.aiEnabled ?? true,
        status: 'connected',
        webhookSubscribed: subscribed,
      },
      update: {
        botId: dto.botId,
        pageName: dto.pageName,
        pageAccessTokenEncrypted: Buffer.from(dto.pageAccessToken).toString('base64'),
        aiEnabled: dto.aiEnabled ?? true,
        status: 'connected',
        webhookSubscribed: subscribed,
      },
      include: { bot: { select: { id: true, botName: true } } },
    });
  }

  async disconnectFacebookPage(organizationId: string, id: string) {
    const page = await this.prisma.chatbotFacebookPage.findFirst({
      where: { id, organizationId },
    });
    if (!page) throw new NotFoundException('Không tìm thấy Fanpage');
    await this.prisma.chatbotFacebookPage.delete({ where: { id } });
    return { success: true };
  }

  async getUsageSnapshot(organizationId: string) {
    const settings = await this.ensureSettings(organizationId);
    const month = new Date().toISOString().slice(0, 7);
    const rows = await this.prisma.chatbotUsage.findMany({
      where: { organizationId, month },
    });
    const used = rows.reduce((sum, r) => sum + r.aiReplies, 0);
    const limit = settings.monthlyLimit;
    return { used, limit, remaining: Math.max(0, limit - used), allowed: used < limit };
  }

  async findBotOrThrow(organizationId: string, id: string) {
    const bot = await this.prisma.chatbotBot.findFirst({
      where: { id, organizationId },
    });
    if (!bot) throw new NotFoundException('Không tìm thấy chatbot');
    return bot;
  }

  async findBotPublic(botId: string) {
    return this.prisma.chatbotBot.findUnique({ where: { id: botId } });
  }

  private async ensureSettings(organizationId: string) {
    return this.prisma.chatbotOrgSettings.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });
  }

  private enrichBot(bot: Prisma.ChatbotBotGetPayload<object>) {
    const greeting =
      bot.greeting?.trim() ||
      defaultGreeting(bot.botName, bot.businessName ?? '', bot.consultationTone);
    const apiUrl = this.embedApiUrl(bot.websiteUrl);
    return {
      ...bot,
      greeting,
      embedCode: buildEmbedCode(bot.id, apiUrl),
    };
  }

  newSessionId(): string {
    return randomBytes(16).toString('hex');
  }
}
