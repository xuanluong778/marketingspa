import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AutoPostFacebookConnectionStatus,
  ChatbotBotStatus,
  ChatbotSourceType,
  Prisma,
} from '@marketingspa/database';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  ConnectFacebookPageDto,
  CreateChannelDto,
  CreateChatbotBotDto,
  CreateKnowledgeSourceDto,
  CrawlKnowledgeUrlDto,
  UpdateChatbotBotDto,
  UpdateSettingsDto,
} from './dto/chatbot-cskh.dto';
import { buildEmbedCode, defaultGreeting, resolveEmbedApiUrl } from './utils/chatbot-constants';
import { encodeStoredSecret } from '../common/utils/token-security.util';
import { decryptSecret } from '../common/utils/encryption.util';
import { ChatbotFacebookWebhookService } from './chatbot-facebook-webhook.service';
import {
  formatDiagramNodeContent,
  KNOWLEDGE_DIAGRAM_URL,
  parseKnowledgeDiagramFile,
} from './utils/knowledge-diagram.util';
import {
  chunkWebsiteContent,
  CrawlFetchError,
  CrawlValidationError,
  fetchAndExtractUrl,
} from './utils/website-crawl.util';
import { ChannelConnectionsService } from '../messaging/channel-connections.service';

const MAX_BOTS = 10;
const MAX_SOURCES = 50;
const MAX_CHANNELS = 30;

@Injectable()
export class ChatbotCskhService {
  private readonly logger = new Logger(ChatbotCskhService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => ChatbotFacebookWebhookService))
    private readonly facebookWebhook: ChatbotFacebookWebhookService,
    private readonly channelConnections: ChannelConnectionsService,
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

  /**
   * Upload sơ đồ tri thức (.txt/.md/.csv/.json) → tách thành các nguồn FILE
   * đánh dấu url = internal://knowledge-diagram để AI ưu tiên.
   */
  async uploadKnowledgeDiagram(
    organizationId: string,
    params: {
      botId: string;
      title?: string;
      filename: string;
      buffer: Buffer;
      replaceExisting?: boolean;
    },
  ) {
    if (!params.botId?.trim()) {
      throw new BadRequestException('Thiếu botId — chọn chatbot trước khi upload sơ đồ.');
    }
    await this.findBotOrThrow(organizationId, params.botId);

    const allowed = /\.(txt|md|markdown|csv|json)$/i;
    if (!allowed.test(params.filename || '')) {
      throw new BadRequestException(
        'Chỉ hỗ trợ file .txt, .md, .csv, .json cho sơ đồ tri thức.',
      );
    }
    if (!params.buffer?.length) {
      throw new BadRequestException('File trống hoặc không đọc được.');
    }
    if (params.buffer.length > 2 * 1024 * 1024) {
      throw new BadRequestException('File tối đa 2MB.');
    }

    const text = params.buffer.toString('utf8');
    let nodes;
    try {
      nodes = parseKnowledgeDiagramFile({
        filename: params.filename,
        text,
        defaultTitle: params.title || 'Sơ đồ tri thức',
      });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Không đọc được file');
    }

    if (!nodes.length) {
      throw new BadRequestException(
        'Không tìm thấy nội dung trong file. Dùng Markdown (# tiêu đề), CSV (title,content) hoặc JSON {nodes:[]}.',
      );
    }

    if (params.replaceExisting) {
      await this.prisma.chatbotKnowledgeSource.deleteMany({
        where: {
          organizationId,
          botId: params.botId,
          url: KNOWLEDGE_DIAGRAM_URL,
        },
      });
    }

    const existing = await this.prisma.chatbotKnowledgeSource.count({
      where: { organizationId, botId: params.botId },
    });
    const remaining = MAX_SOURCES - existing;
    if (remaining <= 0) {
      throw new BadRequestException(`Tối đa ${MAX_SOURCES} nguồn dữ liệu. Hãy xóa bớt trước.`);
    }

    const toCreate = nodes.slice(0, remaining);
    const mapTitle = (params.title || 'Sơ đồ tri thức').trim().slice(0, 80);

    const created = await this.prisma.$transaction(
      toCreate.map((node) =>
        this.prisma.chatbotKnowledgeSource.create({
          data: {
            organizationId,
            botId: params.botId,
            title: `Sơ đồ: ${node.title}`.slice(0, 160),
            sourceType: ChatbotSourceType.FILE,
            content: formatDiagramNodeContent(node),
            url: KNOWLEDGE_DIAGRAM_URL,
            status: 'active',
          },
        }),
      ),
    );

    return {
      success: true,
      mapTitle,
      filename: params.filename,
      imported: created.length,
      skipped: nodes.length - created.length,
      sources: created,
    };
  }

  /**
   * Quét URL website → lưu nội dung vào knowledge (sourceType URL)
   * để chatbot AI trả lời dựa trên dữ liệu thật từ trang.
   */
  async crawlKnowledgeFromUrl(organizationId: string, dto: CrawlKnowledgeUrlDto) {
    const botId = dto.botId.trim();
    const sourceUrl = dto.url.trim();
    if (!botId) {
      throw new BadRequestException('Thiếu botId — chọn chatbot trước khi quét website.');
    }
    await this.findBotOrThrow(organizationId, botId);

    let result;
    try {
      result = await fetchAndExtractUrl(sourceUrl);
    } catch (e) {
      if (e instanceof CrawlValidationError || e instanceof CrawlFetchError) {
        throw new BadRequestException(e.message);
      }
      throw new BadRequestException('Không quét được website.');
    }

    const pageUrl = result.pageUrl.slice(0, 2000);
    const baseTitle = (
      dto.title?.trim() ||
      result.title ||
      `Website ${new URL(pageUrl).hostname}`
    ).slice(0, 140);

    if (dto.replaceExisting) {
      await this.prisma.chatbotKnowledgeSource.deleteMany({
        where: {
          organizationId,
          botId,
          OR: [{ url: pageUrl }, { url: sourceUrl }],
        },
      });
    }

    const existing = await this.prisma.chatbotKnowledgeSource.count({
      where: { organizationId, botId },
    });
    const remaining = MAX_SOURCES - existing;
    if (remaining <= 0) {
      throw new BadRequestException(`Tối đa ${MAX_SOURCES} nguồn dữ liệu. Hãy xóa bớt trước.`);
    }

    const chunks = chunkWebsiteContent(result.content).slice(0, remaining);
    const created = await this.prisma.$transaction(
      chunks.map((content, i) =>
        this.prisma.chatbotKnowledgeSource.create({
          data: {
            organizationId,
            botId,
            title: (chunks.length > 1 ? `${baseTitle} (${i + 1})` : baseTitle).slice(0, 160),
            sourceType: ChatbotSourceType.URL,
            content,
            url: pageUrl,
            status: 'active',
            crawlError: null,
          },
        }),
      ),
    );

    return {
      success: true,
      url: pageUrl,
      title: baseTitle,
      imported: created.length,
      contentLength: result.content.length,
      preview: result.content.slice(0, 280),
      sources: created,
    };
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

  /** Nhân viên tiếp quản — dừng bot, gán NV, cập nhật lead CRM nếu có */
  async takeoverConversation(
    organizationId: string,
    conversationId: string,
    opts: { employeeId?: string; resumeBot?: boolean } = {},
  ) {
    const conv = await this.getConversation(organizationId, conversationId);
    if (opts.resumeBot) {
      return this.prisma.chatbotConversation.update({
        where: { id: conv.id },
        data: {
          humanTakeover: false,
          status: 'OPEN',
        },
      });
    }

    const updated = await this.prisma.chatbotConversation.update({
      where: { id: conv.id },
      data: {
        humanTakeover: true,
        status: 'NEEDS_STAFF',
        assignedEmployeeId: opts.employeeId,
      },
    });

    if (conv.linkedLeadId && opts.employeeId) {
      await this.prisma.lead.updateMany({
        where: { id: conv.linkedLeadId, organizationId },
        data: { assignedToId: opts.employeeId },
      });
    }

    await this.prisma.chatbotMessage.create({
      data: {
        conversationId: conv.id,
        role: 'system',
        message: 'Nhân viên đã tiếp quản hội thoại. Bot tạm dừng.',
      },
    });

    return updated;
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
    const pages = await this.prisma.chatbotFacebookPage.findMany({
      where: { organizationId },
      include: { bot: { select: { id: true, botName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return pages.map((p) => ({
      id: p.id,
      organizationId: p.organizationId,
      botId: p.botId,
      pageId: p.pageId,
      pageName: p.pageName,
      aiEnabled: p.aiEnabled,
      status: p.status,
      webhookSubscribed: p.webhookSubscribed,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      hasPageToken: Boolean(p.pageAccessTokenEncrypted),
      bot: p.bot,
    }));
  }

  async connectFacebookPage(organizationId: string, dto: ConnectFacebookPageDto) {
    await this.findBotOrThrow(organizationId, dto.botId);

    // Ưu tiên token/pageId gửi kèm (reconnect), fallback env server
    const pageAccessToken = (
      dto.pageAccessToken?.trim() ||
      this.facebookWebhook.getMessengerPageToken()
    ).trim();
    const pageId = (dto.pageId?.trim() || this.facebookWebhook.getEnvPageId()).trim();
    let pageName = (
      dto.pageName ||
      this.config.get<string>('META_PAGE_NAME') ||
      'Trang Facebook'
    ).trim();

    if (!pageAccessToken || !pageId) {
      throw new BadRequestException(
        'Thiếu Page ID hoặc Page Access Token. Dán token mới từ Meta (Page Access Token) rồi thử lại.',
      );
    }

    const probe = await this.facebookWebhook.validatePageToken(pageId, pageAccessToken);
    if (!probe.ok) {
      throw new BadRequestException(
        probe.error === 'token_expired_or_missing_permission'
          ? 'Page Access Token hết hạn hoặc thiếu quyền pages_messaging. Tạo token mới trên Meta rồi kết nối lại.'
          : `Token Fanpage không hợp lệ: ${probe.error}`,
      );
    }
    if (probe.pageName) pageName = probe.pageName;

    const subscribed = await this.facebookWebhook.subscribePageWebhook(pageId, pageAccessToken);
    if (!subscribed) {
      throw new BadRequestException(
        'Không subscribe được webhook (messages, messaging_postbacks, message_deliveries, message_reads). Kiểm tra quyền pages_manage_metadata / pages_messaging và Callback URL Meta App.',
      );
    }

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey || encryptionKey.length < 16) {
      throw new BadRequestException('ENCRYPTION_KEY chưa được cấu hình trên server');
    }
    const tokenStored = encodeStoredSecret(pageAccessToken, encryptionKey);

    const existing = await this.prisma.chatbotFacebookPage.findUnique({ where: { pageId } });
    if (existing && existing.organizationId !== organizationId) {
      throw new NotFoundException('Không tìm thấy Fanpage');
    }

    const page = await this.prisma.chatbotFacebookPage.upsert({
      where: { pageId },
      create: {
        organizationId,
        botId: dto.botId,
        pageId,
        pageName,
        pageAccessTokenEncrypted: tokenStored,
        aiEnabled: dto.aiEnabled ?? true,
        status: 'connected',
        webhookSubscribed: subscribed,
      },
      update: {
        organizationId,
        botId: dto.botId,
        pageName,
        pageAccessTokenEncrypted: tokenStored,
        aiEnabled: dto.aiEnabled ?? true,
        status: 'connected',
        webhookSubscribed: subscribed,
      },
      include: { bot: { select: { id: true, botName: true } } },
    });

    // Chuẩn hóa channelRef cũ (từng lưu nhầm pageName) → pageId
    await this.prisma.chatbotConversation.updateMany({
      where: {
        organizationId,
        channel: 'facebook',
        OR: [{ channelRef: pageName }, { sessionId: { startsWith: `fb:${pageId}:` } }],
      },
      data: { channelRef: pageId },
    });

    // Đồng bộ sang MessagingChannelConnection để nhắn tin hàng loạt dùng chung Page
    try {
      await this.channelConnections.upsertMessengerFromChatbot(
        organizationId,
        {
          pageId,
          pageAccessToken,
          pageName,
          subscribeWebhook: subscribed,
        },
      );
    } catch (e) {
      this.logger.warn(
        `Sync chatbot page → messaging connection failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    return {
      id: page.id,
      organizationId: page.organizationId,
      botId: page.botId,
      pageId: page.pageId,
      pageName: page.pageName,
      aiEnabled: page.aiEnabled,
      status: page.status,
      webhookSubscribed: page.webhookSubscribed,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      hasPageToken: true,
      bot: page.bot,
      syncedToMessaging: true,
      tokenValidated: true,
    };
  }

  async disconnectFacebookPage(organizationId: string, id: string) {
    const page = await this.prisma.chatbotFacebookPage.findFirst({
      where: { id, organizationId },
    });
    if (!page) throw new NotFoundException('Không tìm thấy Fanpage');

    await this.channelConnections.disableMessengerPageAccess(page.pageId, {
      organizationId,
      reason: 'Chatbot Fanpage disconnected',
    });

    await this.prisma.chatbotFacebookPage.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Đồng bộ mọi Fanpage/OA đã kết nối (Chatbot + Content OAuth) → MessagingChannelConnection
   * để Nhắn tin hàng loạt dùng chung kênh. Đồng thời bridge Auto Post → ChatbotFacebookPage
   * + subscribed_apps để webhook Messenger tới được Chatbot CSKH.
   */
  async syncMessagingFromChatbotPages(organizationId: string, userId?: string) {
    const result = await this.channelConnections.syncFromOrgSources(organizationId, userId);
    const bridge = await this.ensureChatbotPagesFromAutoPost(organizationId, userId);
    if (result.synced === 0 && result.failed === 0 && bridge.linked === 0 && bridge.failed === 0) {
      throw new BadRequestException(
        'Chưa có Fanpage/Zalo OA nào để đồng bộ. Kết nối Fanpage tại Chatbot CSKH hoặc Nội dung → Kết nối kênh trước.',
      );
    }
    return { ...result, chatbotBridge: bridge };
  }

  /**
   * Source of truth Auto Post → ChatbotFacebookPage (idempotent) + Graph subscribed_apps.
   * Không tạo bản ghi trùng; không log token.
   */
  async ensureChatbotPagesFromAutoPost(organizationId: string, userId?: string) {
    const results: Array<{
      pageId: string;
      pageName: string | null;
      ok: boolean;
      error?: string;
      webhookSubscribed?: boolean;
    }> = [];

    const bot = await this.prisma.chatbotBot.findFirst({
      where: { organizationId, status: ChatbotBotStatus.ACTIVE },
      orderBy: { updatedAt: 'desc' },
    });
    if (!bot) {
      return { linked: 0, failed: 0, results, skippedReason: 'no_active_bot' as const };
    }

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey || encryptionKey.length < 16) {
      throw new BadRequestException('ENCRYPTION_KEY chưa được cấu hình trên server');
    }

    const autoPages = await this.prisma.autoPostFacebookPage.findMany({
      where: {
        connection: {
          organizationId,
          status: AutoPostFacebookConnectionStatus.CONNECTED,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    for (const page of autoPages) {
      // Bỏ pageId giả (test fixture)
      if (!/^\d{5,}$/.test(page.pageId)) {
        results.push({
          pageId: page.pageId,
          pageName: page.pageName,
          ok: false,
          error: 'invalid_page_id',
        });
        continue;
      }
      try {
        let token = '';
        try {
          token = decryptSecret(page.encryptedPageAccessToken, encryptionKey).trim();
        } catch {
          token = '';
        }
        if (!token) {
          results.push({
            pageId: page.pageId,
            pageName: page.pageName,
            ok: false,
            error: 'missing_token',
          });
          continue;
        }

        const probe = await this.facebookWebhook.validatePageToken(page.pageId, token);
        if (!probe.ok) {
          results.push({
            pageId: page.pageId,
            pageName: page.pageName,
            ok: false,
            error: probe.error || 'token_invalid',
          });
          continue;
        }

        const subscribed = await this.facebookWebhook.subscribePageWebhook(page.pageId, token);
        const pageName = probe.pageName || page.pageName;
        const tokenStored = encodeStoredSecret(token, encryptionKey);

        const existing = await this.prisma.chatbotFacebookPage.findUnique({
          where: { pageId: page.pageId },
        });
        if (existing && existing.organizationId !== organizationId) {
          results.push({
            pageId: page.pageId,
            pageName,
            ok: false,
            error: 'page_owned_by_other_org',
          });
          continue;
        }

        await this.prisma.chatbotFacebookPage.upsert({
          where: { pageId: page.pageId },
          create: {
            organizationId,
            botId: bot.id,
            pageId: page.pageId,
            pageName,
            pageAccessTokenEncrypted: tokenStored,
            aiEnabled: true,
            status: 'connected',
            webhookSubscribed: subscribed,
          },
          update: {
            organizationId,
            botId: bot.id,
            pageName,
            pageAccessTokenEncrypted: tokenStored,
            status: 'connected',
            webhookSubscribed: subscribed,
          },
        });

        try {
          await this.channelConnections.upsertMessengerFromChatbot(
            organizationId,
            {
              pageId: page.pageId,
              pageAccessToken: token,
              pageName,
              subscribeWebhook: subscribed,
            },
            userId,
          );
        } catch (e) {
          this.logger.warn(
            `ensureChatbotPages messaging upsert failed page=••••${page.pageId.slice(-4)}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }

        results.push({
          pageId: page.pageId,
          pageName,
          ok: true,
          webhookSubscribed: subscribed,
        });
      } catch (e) {
        results.push({
          pageId: page.pageId,
          pageName: page.pageName,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      linked: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
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
