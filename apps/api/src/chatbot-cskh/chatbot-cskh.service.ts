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
  MessageChannel,
  MessagingProviderKind,
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
  ReplyInboxMessageDto,
  UpdateChatbotBotDto,
  UpdateSettingsDto,
} from './dto/chatbot-cskh.dto';
import { buildEmbedCode, defaultGreeting, resolveEmbedApiUrl } from './utils/chatbot-constants';
import { encodeStoredSecret } from '../common/utils/token-security.util';
import { decryptSecret } from '../common/utils/encryption.util';
import { CSKH_FB_ERROR, CSKH_FB_REQUIRED_SCOPES } from './utils/chatbot-fb-errors';
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
import { sendZaloOaHttp, WS_EVENTS } from '@marketingspa/shared';
import { pickBetterZaloDisplayName } from '@marketingspa/shared';
import { ChannelConnectionsService } from '../messaging/channel-connections.service';
import { EventsGateway } from '../events/events.gateway';

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
    private readonly events: EventsGateway,
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

  async attachZaloOaToBot(
    organizationId: string,
    dto: { botId: string; connectionId?: string; accountRef?: string },
  ) {
    const bot = await this.findBotOrThrow(organizationId, dto.botId);
    const connection = await this.prisma.messagingChannelConnection.findFirst({
      where: {
        organizationId,
        channel: MessageChannel.ZALO,
        providerKind: MessagingProviderKind.ZALO_OA,
        ...(dto.connectionId
          ? { id: dto.connectionId }
          : dto.accountRef
            ? { accountRef: dto.accountRef }
            : {}),
        status: 'ACTIVE',
        isPaused: false,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!connection) {
      throw new NotFoundException(
        'Không tìm thấy Zalo OA ACTIVE trong tổ chức — kết nối OA trước tại Zalo Marketing / Cài đặt',
      );
    }

    const prevMeta = (connection.metadata as Record<string, unknown> | null) || {};
    await this.prisma.messagingChannelConnection.update({
      where: { id: connection.id },
      data: {
        metadata: {
          ...prevMeta,
          botId: bot.id,
        } as Prisma.InputJsonValue,
      },
    });

    const existingChannel = await this.prisma.chatbotChannel.findFirst({
      where: {
        organizationId,
        botId: bot.id,
        channelType: 'ZALO',
      },
    });
    const channelConfig = {
      accountRef: connection.accountRef,
      connectionId: connection.id,
      oaName: connection.displayName || connection.accountRef,
    };
    let channel = existingChannel;
    if (existingChannel) {
      channel = await this.prisma.chatbotChannel.update({
        where: { id: existingChannel.id },
        data: {
          name: connection.displayName || 'Zalo OA',
          status: 'CONNECTED',
          config: channelConfig as Prisma.InputJsonValue,
        },
      });
    } else {
      channel = await this.prisma.chatbotChannel.create({
        data: {
          organizationId,
          botId: bot.id,
          name: connection.displayName || 'Zalo OA',
          channelType: 'ZALO',
          status: 'CONNECTED',
          config: channelConfig as Prisma.InputJsonValue,
        },
      });
    }

    return {
      success: true,
      bot: { id: bot.id, botName: bot.botName },
      oa: {
        connectionId: connection.id,
        accountRef: connection.accountRef,
        oaName: connection.displayName,
        status: connection.status,
      },
      channel: { id: channel.id, status: channel.status },
    };
  }

  async deleteChannel(organizationId: string, id: string) {
    const row = await this.prisma.chatbotChannel.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy kênh');
    await this.prisma.chatbotChannel.delete({ where: { id } });
    return { success: true };
  }

  private isInboundMessage(m: {
    role?: string | null;
    direction?: string | null;
    senderType?: string | null;
  }): boolean {
    if (m.direction === 'INBOUND') return true;
    if (m.direction === 'OUTBOUND') return false;
    if (m.senderType === 'CUSTOMER') return true;
    return m.role === 'user';
  }

  /** Unread = tin inbound sau staffReadAt (PostgreSQL là source of truth). */
  private unreadInboundMessages<
    T extends {
      role?: string | null;
      direction?: string | null;
      senderType?: string | null;
      createdAt: Date;
    },
  >(messages: T[] | undefined, staffReadAt: Date | null | undefined): T[] {
    const cutoff = staffReadAt?.getTime() ?? 0;
    return (messages || []).filter(
      (m) => this.isInboundMessage(m) && m.createdAt.getTime() > cutoff,
    );
  }

  /** Throttle Meta profile/picture maintenance so inbox list is never blocked. */
  private inboxMaintenanceAt = new Map<string, number>();
  private static readonly INBOX_MAINTENANCE_TTL_MS = 90_000;

  private scheduleInboxProfileMaintenance(organizationId: string) {
    const now = Date.now();
    const last = this.inboxMaintenanceAt.get(organizationId) ?? 0;
    if (now - last < ChatbotCskhService.INBOX_MAINTENANCE_TTL_MS) return;
    this.inboxMaintenanceAt.set(organizationId, now);
    void this.backfillMessengerProfiles(organizationId, 6).catch((e) =>
      this.logger.warn(
        `backfillMessengerProfiles: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
  }

  private encodeInboxCursor(row: { updatedAt: Date; id: string }) {
    return Buffer.from(`${row.updatedAt.toISOString()}|${row.id}`, 'utf8').toString(
      'base64url',
    );
  }

  private decodeInboxCursor(
    cursor: string,
  ): { updatedAt: Date; id: string } | null {
    try {
      const raw = Buffer.from(cursor, 'base64url').toString('utf8');
      const sep = raw.lastIndexOf('|');
      if (sep <= 0) return null;
      const iso = raw.slice(0, sep);
      const id = raw.slice(sep + 1);
      const updatedAt = new Date(iso);
      if (!id || Number.isNaN(updatedAt.getTime())) return null;
      return { updatedAt, id };
    } catch {
      return null;
    }
  }

  /**
   * Danh sách hội thoại inbox — chỉ last message + unread count (SQL).
   * Không await Graph API; pagination cursor theo updatedAt+id.
   */
  async listConversations(
    organizationId: string,
    limit = 25,
    cursor?: string | null,
    opts?: {
      maxLimit?: number;
      /** Project/Bot — bắt buộc để không trộn hộp thư */
      botId?: string | null;
      /** all | facebook | website | zalo */
      channel?: string | null;
      /** pageId (Fanpage), domain (Website), hoặc OA accountRef (Zalo) */
      channelId?: string | null;
    },
  ) {
    this.scheduleInboxProfileMaintenance(organizationId);

    const maxLimit = opts?.maxLimit ?? 200;
    const take = Math.min(Math.max(Number(limit) || 25, 1), maxLimit);
    const decoded = cursor ? this.decodeInboxCursor(cursor) : null;
    const botId = opts?.botId?.trim() || null;
    const channel = this.normalizeInboxChannel(opts?.channel);
    const channelId = opts?.channelId?.trim() || null;

    // Không chọn Project → không trả hộp thư chung (tránh trộn)
    if (!botId) {
      return { items: [], nextCursor: null, hasMore: false, requiresBotId: true };
    }

    const scopeWhere = {
      organizationId,
      botId,
      ...(channel ? { channel } : {}),
      ...(channelId
        ? channel === 'website' || (!channel && channelId.includes('.'))
          ? {
              OR: [
                { channelRef: channelId },
                { channelRef: { endsWith: channelId } },
                { channelRef: `www.${channelId}` },
              ],
            }
          : { channelRef: channelId }
        : {}),
    };

    const rows = await this.prisma.chatbotConversation.findMany({
      where: {
        ...scopeWhere,
        ...(decoded
          ? {
              OR: [
                { updatedAt: { lt: decoded.updatedAt } },
                {
                  AND: [{ updatedAt: decoded.updatedAt }, { id: { lt: decoded.id } }],
                },
              ],
            }
          : {}),
      },
      include: {
        bot: { select: { id: true, botName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const pageRows = hasMore ? rows.slice(0, take) : rows;

    const unreadCounts = await this.countUnreadByConversationIds(
      organizationId,
      pageRows.map((r) => r.id),
    );

    const pageIds = [
      ...new Set(
        pageRows
          .filter((r) => r.channel === 'facebook' && r.channelRef)
          .map((r) => r.channelRef as string),
      ),
    ];
    const pages = pageIds.length
      ? await this.prisma.chatbotFacebookPage.findMany({
          where: { organizationId, botId, pageId: { in: pageIds } },
          select: { pageId: true, pageName: true, pagePictureUrl: true },
        })
      : [];
    const pageMap = new Map(pages.map((p) => [p.pageId, p]));

    const oaRefs = [
      ...new Set(
        pageRows
          .filter((r) => r.channel === 'zalo' && r.channelRef)
          .map((r) => r.channelRef as string),
      ),
    ];
    const oaRows = oaRefs.length
      ? await this.prisma.messagingChannelConnection.findMany({
          where: {
            organizationId,
            channel: MessageChannel.ZALO,
            providerKind: MessagingProviderKind.ZALO_OA,
            accountRef: { in: oaRefs },
          },
          select: { accountRef: true, displayName: true, metadata: true },
        })
      : [];
    const oaMap = new Map(
      oaRows.map((o) => [
        o.accountRef,
        {
          accountRef: o.accountRef,
          oaName: o.displayName,
          avatarUrl:
            typeof (o.metadata as { avatar?: string } | null)?.avatar === 'string'
              ? String((o.metadata as { avatar?: string }).avatar).slice(0, 2000)
              : null,
        },
      ]),
    );

    const items = pageRows.map((c) =>
      this.serializeConversation(c, pageMap.get(c.channelRef || ''), false, {
        unreadMessageCount: unreadCounts.get(c.id) ?? 0,
        zaloOa: oaMap.get(c.channelRef || '') || null,
      }),
    );
    const last = pageRows[pageRows.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? this.encodeInboxCursor(last) : null,
      hasMore,
      requiresBotId: false,
    };
  }

  /**
   * Badge header + dropdown — scope theo Project/Bot (+ channel).
   * Trả thêm unreadByBot để UI badge từng Project.
   */
  async getUnreadInboxSummary(
    organizationId: string,
    limit = 15,
    opts?: { botId?: string | null; channel?: string | null; channelId?: string | null },
  ) {
    const take = Math.min(Math.max(limit, 1), 40);
    const botId = opts?.botId?.trim() || null;
    const channel = this.normalizeInboxChannel(opts?.channel);
    const channelId = opts?.channelId?.trim() || null;

    const scopeWhere = {
      organizationId,
      lastUserMessageAt: { not: null } as const,
      ...(botId ? { botId } : {}),
      ...(channel ? { channel } : {}),
      ...(channelId ? { channelRef: channelId } : {}),
    };

    const rows = await this.prisma.chatbotConversation.findMany({
      where: scopeWhere,
      select: {
        id: true,
        botId: true,
        visitorName: true,
        visitorAvatarUrl: true,
        channel: true,
        channelRef: true,
        externalUserId: true,
        lastUserMessageAt: true,
      },
      orderBy: { lastUserMessageAt: 'desc' },
      take: botId ? 150 : 300,
    });

    const unreadCounts = await this.countUnreadByConversationIds(
      organizationId,
      rows.map((r) => r.id),
    );
    const unreadRows = rows.filter((r) => (unreadCounts.get(r.id) ?? 0) > 0);

    const unreadByBot: Record<string, number> = {};
    const unreadByChannel: Record<string, number> = {};
    let unreadCount = 0;
    for (const r of unreadRows) {
      const n = unreadCounts.get(r.id) ?? 0;
      unreadCount += n;
      unreadByBot[r.botId] = (unreadByBot[r.botId] || 0) + n;
      const chKey = `${r.botId}:${r.channel}:${r.channelRef || ''}`;
      unreadByChannel[chKey] = (unreadByChannel[chKey] || 0) + n;
    }

    const top = unreadRows.slice(0, take);
    const previewById = new Map<string, { message: string; createdAt: Date }>();
    if (top.length) {
      const topIds = top.map((r) => r.id);
      const previews = await this.prisma.$queryRawUnsafe<
        Array<{ conversation_id: string; message: string; created_at: Date }>
      >(
        `
        SELECT DISTINCT ON (m.conversation_id)
          m.conversation_id AS conversation_id,
          m.message,
          m.created_at
        FROM chatbot_messages m
        INNER JOIN chatbot_conversations c ON c.id = m.conversation_id
        WHERE m.conversation_id = ANY($1::text[])
          AND (
            m.direction = 'INBOUND'
            OR (m.direction IS NULL AND (m.sender_type = 'CUSTOMER' OR m.role = 'user'))
          )
          AND (c.staff_read_at IS NULL OR m.created_at > c.staff_read_at)
        ORDER BY m.conversation_id, m.created_at DESC
        `,
        topIds,
      );
      for (const p of previews) {
        previewById.set(p.conversation_id, {
          message: p.message,
          createdAt: p.created_at,
        });
      }
    }

    const pageIds = [
      ...new Set(
        top
          .filter((r) => r.channel === 'facebook' && r.channelRef)
          .map((r) => r.channelRef as string),
      ),
    ];
    const pages = pageIds.length
      ? await this.prisma.chatbotFacebookPage.findMany({
          where: {
            organizationId,
            ...(botId ? { botId } : {}),
            pageId: { in: pageIds },
          },
          select: { pageId: true, pageName: true, pagePictureUrl: true },
        })
      : [];
    const pageMap = new Map(pages.map((p) => [p.pageId, p]));

    const items = top.map((row) => {
      const preview = previewById.get(row.id);
      const page = pageMap.get(row.channelRef || '');
      const name =
        row.channel === 'zalo'
          ? pickBetterZaloDisplayName(row.visitorName, null, row.externalUserId)
          : row.visitorName && !/^Khách Messenger$/i.test(row.visitorName)
            ? row.visitorName
            : row.externalUserId
              ? `PSID …${row.externalUserId.slice(-4)}`
              : row.visitorName || 'Khách';
      return {
        conversationId: row.id,
        botId: row.botId,
        visitorName: name,
        visitorAvatarUrl: row.visitorAvatarUrl || null,
        preview: String(preview?.message || '').slice(0, 160),
        channel: row.channel,
        channelRef: row.channelRef,
        pageName: page?.pageName || null,
        pagePictureUrl: page?.pagePictureUrl || null,
        lastMessageAt: (preview?.createdAt || row.lastUserMessageAt || new Date()).toISOString(),
        unreadMessageCount: unreadCounts.get(row.id) ?? 0,
        isUnread: true as const,
      };
    });

    return {
      unreadCount,
      unreadConversationCount: unreadRows.length,
      items,
      unreadByBot,
      unreadByChannel,
      requiresBotId: !botId,
    };
  }

  async markConversationRead(organizationId: string, conversationId: string) {
    const conv = await this.prisma.chatbotConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { id: true, staffReadAt: true },
    });
    if (!conv) throw new NotFoundException('Không tìm thấy hội thoại');
    const now = new Date();
    await this.prisma.chatbotConversation.update({
      where: { id: conv.id },
      data: { staffReadAt: now },
    });
    return {
      ok: true,
      conversationId: conv.id,
      staffReadAt: now.toISOString(),
    };
  }

  /** SQL COUNT unread inbound — không load toàn bộ messages vào Node. */
  private async countUnreadByConversationIds(
    organizationId: string,
    ids: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!ids.length) return map;
    for (const id of ids) map.set(id, 0);

    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; cnt: number }>>(
      `
      SELECT c.id AS id, COUNT(m.id)::int AS cnt
      FROM chatbot_conversations c
      LEFT JOIN chatbot_messages m
        ON m.conversation_id = c.id
       AND (
         m.direction = 'INBOUND'
         OR (m.direction IS NULL AND (m.sender_type = 'CUSTOMER' OR m.role = 'user'))
       )
       AND (c.staff_read_at IS NULL OR m.created_at > c.staff_read_at)
      WHERE c.organization_id = $1
        AND c.id = ANY($2::text[])
      GROUP BY c.id
      `,
      organizationId,
      ids,
    );
    for (const row of rows) {
      map.set(row.id, Number(row.cnt) || 0);
    }
    return map;
  }

  /** Chi tiết 1 hội thoại — chỉ fetch messages khi mở (limit gần nhất). */
  async getConversation(organizationId: string, id: string) {
    const MESSAGE_TAKE = 200;
    const conv = await this.prisma.chatbotConversation.findFirst({
      where: { id, organizationId },
      include: {
        bot: { select: { id: true, botName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: MESSAGE_TAKE },
      },
    });
    if (!conv) throw new NotFoundException('Không tìm thấy hội thoại');

    const fanpage =
      conv.channel === 'facebook' && conv.channelRef
        ? await this.prisma.chatbotFacebookPage.findFirst({
            where: { organizationId, pageId: conv.channelRef },
            select: { pageId: true, pageName: true, pagePictureUrl: true },
          })
        : null;

    const zaloOa =
      conv.channel === 'zalo' && conv.channelRef
        ? await this.prisma.messagingChannelConnection.findFirst({
            where: {
              organizationId,
              channel: MessageChannel.ZALO,
              providerKind: MessagingProviderKind.ZALO_OA,
              accountRef: conv.channelRef,
            },
            select: { accountRef: true, displayName: true, metadata: true },
          })
        : null;

    const messagesAsc = [...conv.messages].reverse();
    const unreadCounts = await this.countUnreadByConversationIds(organizationId, [conv.id]);

    return this.serializeConversation(
      { ...conv, messages: messagesAsc },
      fanpage || undefined,
      true,
      {
        unreadMessageCount: unreadCounts.get(conv.id) ?? 0,
        zaloOa: zaloOa
          ? {
              accountRef: zaloOa.accountRef,
              oaName: zaloOa.displayName,
              avatarUrl:
                typeof (zaloOa.metadata as { avatar?: string } | null)?.avatar === 'string'
                  ? String((zaloOa.metadata as { avatar?: string }).avatar).slice(0, 2000)
                  : null,
            }
          : null,
      },
    );
  }

  private normalizeInboxChannel(raw?: string | null): 'facebook' | 'website' | 'zalo' | null {
    const channelRaw = (raw || '').trim().toLowerCase();
    if (channelRaw === 'messenger' || channelRaw === 'facebook' || channelRaw === 'fanpage') {
      return 'facebook';
    }
    if (channelRaw === 'website' || channelRaw === 'web') return 'website';
    if (channelRaw === 'zalo' || channelRaw === 'zalo_oa' || channelRaw === 'oa') return 'zalo';
    return null;
  }

  private serializeConversation(
    conv: {
      id: string;
      organizationId: string;
      botId: string;
      sessionId: string;
      visitorName: string | null;
      visitorPhone: string | null;
      visitorAvatarUrl?: string | null;
      channel: string;
      externalUserId: string | null;
      channelRef: string | null;
      status: string;
      humanTakeover: boolean;
      updatedAt: Date;
      createdAt: Date;
      lastUserMessageAt?: Date | null;
      staffReadAt?: Date | null;
      bot?: { id: string; botName: string } | null;
      messages?: Array<{
        id: string;
        role: string;
        message: string;
        status: string | null;
        direction?: string | null;
        senderType?: string | null;
        externalMessageId?: string | null;
        errorCode: string | null;
        createdAt: Date;
      }>;
      _count?: { messages: number };
    },
    fanpage?: { pageId: string; pageName: string; pagePictureUrl: string | null } | null,
    includeAllMessages = false,
    extras?: {
      unreadMessageCount?: number;
      zaloOa?: { accountRef: string; oaName: string | null; avatarUrl?: string | null } | null;
    },
  ) {
    const psid = conv.externalUserId || null;
    const isZalo = conv.channel === 'zalo';
    const customerName = isZalo
      ? pickBetterZaloDisplayName(conv.visitorName, null, psid)
      : conv.visitorName && !/^Khách Messenger$/i.test(conv.visitorName)
        ? conv.visitorName
        : psid
          ? `PSID …${psid.slice(-4)}`
          : conv.visitorName;

    const cleanVisitorAvatar = conv.visitorAvatarUrl ?? null;
    const cleanPageAvatar = fanpage?.pagePictureUrl ?? extras?.zaloOa?.avatarUrl ?? null;

    const messages = (conv.messages || []).map((m) => {
      const direction =
        m.direction ||
        (m.role === 'user' ? 'INBOUND' : m.role === 'assistant' || m.role === 'system' ? 'OUTBOUND' : null);
      const senderType =
        m.senderType ||
        (m.role === 'user'
          ? 'CUSTOMER'
          : m.role === 'assistant'
            ? 'BOT'
            : m.role === 'system'
              ? 'SYSTEM'
              : null);
      return {
        id: m.id,
        role: m.role,
        message: m.message,
        status: m.status,
        direction,
        senderType,
        externalMessageId: m.externalMessageId ?? null,
        errorCode: m.errorCode,
        createdAt: m.createdAt,
      };
    });

    const unreadMessageCount =
      extras?.unreadMessageCount ??
      this.unreadInboundMessages(conv.messages, conv.staffReadAt).length;

    return {
      id: conv.id,
      organizationId: conv.organizationId,
      botId: conv.botId,
      sessionId: conv.sessionId,
      visitorName: customerName,
      visitorPhone: conv.visitorPhone,
      visitorAvatarUrl: cleanVisitorAvatar ?? null,
      channel: conv.channel,
      externalUserId: psid,
      channelRef: conv.channelRef,
      status: conv.status,
      humanTakeover: conv.humanTakeover,
      updatedAt: conv.updatedAt,
      createdAt: conv.createdAt,
      lastUserMessageAt: conv.lastUserMessageAt ?? null,
      staffReadAt: conv.staffReadAt?.toISOString() ?? null,
      isUnread: unreadMessageCount > 0,
      unreadMessageCount,
      bot: conv.bot ?? undefined,
      _count: conv._count,
      customer: {
        name: customerName,
        avatarUrl: cleanVisitorAvatar ?? null,
        psid,
        zaloUid: isZalo ? psid : null,
      },
      fanpage:
        conv.channel === 'facebook'
          ? {
              pageId: fanpage?.pageId || conv.channelRef,
              pageName: fanpage?.pageName || null,
              avatarUrl: cleanPageAvatar ?? null,
            }
          : null,
      zaloOa:
        isZalo
          ? {
              accountRef: extras?.zaloOa?.accountRef || conv.channelRef,
              oaName: extras?.zaloOa?.oaName || null,
              avatarUrl: extras?.zaloOa?.avatarUrl || cleanPageAvatar || null,
            }
          : null,
      messages: includeAllMessages || messages.length ? messages : messages,
    };
  }

  /**
   * Backfill tên/avatar Messenger cho hội thoại còn «Khách Messenger» khi đủ pageId+PSID.
   * Không log token.
   */
  async backfillMessengerProfiles(organizationId: string, limit = 10) {
    const rows = await this.prisma.chatbotConversation.findMany({
      where: {
        organizationId,
        channel: 'facebook',
        externalUserId: { not: null },
        channelRef: { not: null },
        OR: [
          { visitorName: null },
          { visitorName: 'Khách Messenger' },
          { visitorName: { startsWith: 'PSID' } },
          { visitorAvatarUrl: null },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(limit, 30),
    });
    if (!rows.length) return { updated: 0 };

    let updated = 0;
    for (const row of rows) {
      const pageId = row.channelRef!;
      const psid = row.externalUserId!;
      const page = await this.prisma.chatbotFacebookPage.findFirst({
        where: { organizationId, pageId, status: 'connected' },
      });
      if (!page) continue;
      const token = this.facebookWebhook.decodePageToken(page.pageAccessTokenEncrypted);
      if (!token) continue;

      try {
        const profile = await this.facebookWebhook.resolveMessengerProfile(pageId, psid, token);
        if (!profile?.name && !profile?.profilePic) {
          if (!row.visitorName || row.visitorName === 'Khách Messenger') {
            await this.prisma.chatbotConversation.update({
              where: { id: row.id },
              data: { visitorName: `PSID …${psid.slice(-4)}` },
            });
            updated += 1;
          }
          continue;
        }
        await this.prisma.chatbotConversation.update({
          where: { id: row.id },
          data: {
            ...(profile.name ? { visitorName: profile.name.slice(0, 190) } : {}),
            ...(profile.profilePic ? { visitorAvatarUrl: profile.profilePic.slice(0, 2000) } : {}),
          },
        });
        updated += 1;

        if (!page.pagePictureUrl) {
          const pUrl = new URL(
            `https://graph.facebook.com/${
              this.config.get<string>('META_API_VERSION') || 'v21.0'
            }/${encodeURIComponent(pageId)}`,
          );
          pUrl.searchParams.set('fields', 'picture.width(200).height(200)');
          pUrl.searchParams.set('access_token', token);
          const pRes = await fetch(pUrl.toString());
          const pData = (await pRes.json().catch(() => ({}))) as {
            picture?: { data?: { url?: string } };
          };
          const pic = pData.picture?.data?.url;
          if (pic) {
            await this.prisma.chatbotFacebookPage.update({
              where: { id: page.id },
              data: { pagePictureUrl: pic.slice(0, 2000) },
            });
          }
        }
      } catch {
        /* ignore single row */
      }
    }
    return { updated };
  }

  /** Nhân viên tiếp quản — dừng bot, gán NV, cập nhật lead CRM nếu có */
  async takeoverConversation(
    organizationId: string,
    conversationId: string,
    opts: { employeeId?: string; resumeBot?: boolean } = {},
  ) {
    const raw = await this.prisma.chatbotConversation.findFirst({
      where: { id: conversationId, organizationId },
    });
    if (!raw) throw new NotFoundException('Không tìm thấy hội thoại');

    if (opts.resumeBot) {
      const updated = await this.prisma.chatbotConversation.update({
        where: { id: raw.id },
        data: {
          humanTakeover: false,
          status: 'OPEN',
        },
      });
      await this.prisma.chatbotMessage.create({
        data: {
          conversationId: raw.id,
          role: 'system',
          message: 'Đã bật lại AI cho hội thoại này.',
          direction: 'OUTBOUND',
          senderType: 'SYSTEM',
        },
      });
      return this.getConversation(organizationId, updated.id);
    }

    const updated = await this.prisma.chatbotConversation.update({
      where: { id: raw.id },
      data: {
        humanTakeover: true,
        status: 'NEEDS_STAFF',
        assignedEmployeeId: opts.employeeId,
      },
    });

    if (raw.linkedLeadId && opts.employeeId) {
      await this.prisma.lead.updateMany({
        where: { id: raw.linkedLeadId, organizationId },
        data: { assignedToId: opts.employeeId },
      });
    }

    await this.prisma.chatbotMessage.create({
      data: {
        conversationId: raw.id,
        role: 'system',
        message: 'Nhân viên đã tiếp quản hội thoại. Bot tạm dừng.',
        direction: 'OUTBOUND',
        senderType: 'SYSTEM',
      },
    });

    return this.getConversation(organizationId, updated.id);
  }

  /**
   * Nhân viên trả lời từ Hộp thư → đúng kênh (Zalo OA / Messenger / Website).
   * Tenant-scoped; auto humanTakeover; không log token.
   */
  async replyInboxMessage(
    organizationId: string,
    conversationId: string,
    dto: ReplyInboxMessageDto,
  ) {
    const text = String(dto.text || '').trim();
    if (!text) throw new BadRequestException('Nội dung trả lời trống');

    const conv = await this.prisma.chatbotConversation.findFirst({
      where: { id: conversationId, organizationId },
    });
    if (!conv) throw new NotFoundException('Không tìm thấy hội thoại');

    const channel = this.normalizeInboxChannel(conv.channel) || String(conv.channel || '').toLowerCase();
    if (channel !== 'zalo' && channel !== 'facebook' && channel !== 'website') {
      throw new BadRequestException(
        `Kênh "${conv.channel}" chưa hỗ trợ trả lời từ Hộp thư`,
      );
    }

    if (!conv.humanTakeover) {
      await this.prisma.chatbotConversation.update({
        where: { id: conv.id },
        data: { humanTakeover: true, status: 'NEEDS_STAFF' },
      });
    }

    const pending = await this.prisma.chatbotMessage.create({
      data: {
        conversationId: conv.id,
        role: 'assistant',
        message: text.slice(0, 2000),
        status: 'SENDING',
        direction: 'OUTBOUND',
        senderType: 'STAFF',
      },
    });

    try {
      if (channel === 'zalo') {
        await this.replyViaZalo(organizationId, conv, pending.id, text);
      } else if (channel === 'facebook') {
        await this.replyViaMessenger(organizationId, conv, pending.id, text);
      } else {
        await this.replyViaWebsite(organizationId, conv, pending.id, text);
      }
    } catch (err) {
      const existing = await this.prisma.chatbotMessage.findUnique({
        where: { id: pending.id },
        select: { status: true },
      });
      if (existing && existing.status !== 'FAILED') {
        await this.prisma.chatbotMessage.update({
          where: { id: pending.id },
          data: {
            status: 'FAILED',
            errorCode: 'SEND_ERROR',
          },
        });
      }
      throw err instanceof BadRequestException
        ? err
        : new BadRequestException((err as Error).message || 'Gửi tin thất bại');
    }

    await this.prisma.chatbotConversation.update({
      where: { id: conv.id },
      data: { updatedAt: new Date(), status: 'NEEDS_STAFF', humanTakeover: true },
    });

    this.events.emitToOrg(organizationId, WS_EVENTS.CHATBOT_MESSAGE_NEW, {
      conversationId: conv.id,
      channel,
      channelRef: conv.channelRef || undefined,
      externalUserId: conv.externalUserId || undefined,
      direction: 'OUTBOUND',
      preview: text.slice(0, 120),
      botId: conv.botId,
    });

    return this.getConversation(organizationId, conv.id);
  }

  private async replyViaZalo(
    organizationId: string,
    conv: {
      id: string;
      channelRef: string | null;
      externalUserId: string | null;
    },
    messageId: string,
    text: string,
  ) {
    const accountRef = String(conv.channelRef || '').trim();
    const userId = String(conv.externalUserId || '').trim();
    if (!accountRef || !userId) {
      throw new BadRequestException('Thiếu OA hoặc UID Zalo trên hội thoại');
    }

    const connection = await this.prisma.messagingChannelConnection.findFirst({
      where: {
        organizationId,
        channel: MessageChannel.ZALO,
        providerKind: MessagingProviderKind.ZALO_OA,
        accountRef,
        isPaused: false,
      },
    });
    if (!connection) {
      throw new BadRequestException('Không tìm thấy kết nối Zalo OA cho hội thoại này');
    }

    let sendResult: Awaited<ReturnType<typeof sendZaloOaHttp>>;
    try {
      const { accessToken } = await this.channelConnections.ensureFreshZaloAccessToken(
        organizationId,
        connection.id,
      );
      if (!accessToken) {
        throw new BadRequestException('Thiếu access token Zalo OA');
      }
      sendResult = await sendZaloOaHttp({
        accessToken,
        recipientId: userId,
        text,
      });
    } catch (err) {
      await this.prisma.chatbotMessage.update({
        where: { id: messageId },
        data: { status: 'FAILED', errorCode: 'ZALO_SEND_ERROR' },
      });
      this.logger.warn(
        `Zalo inbox reply failed conv=${conv.id.slice(0, 8)}…: ${(err as Error).message}`,
      );
      throw err instanceof BadRequestException
        ? err
        : new BadRequestException((err as Error).message || 'Gửi Zalo thất bại');
    }

    if (!sendResult.success) {
      const tierBlocked = /upgrade OA Tier|-224|chưa đủ gói Zalo/i.test(
        sendResult.message || '',
      );
      await this.prisma.chatbotMessage.update({
        where: { id: messageId },
        data: {
          status: 'FAILED',
          errorCode: String(
            tierBlocked ? 'ZALO_OA_TIER' : sendResult.reasonCode || 'ZALO_SEND_FAILED',
          ).slice(0, 64),
        },
      });
      throw new BadRequestException(sendResult.message || 'Gửi Zalo thất bại');
    }

    await this.prisma.chatbotMessage.update({
      where: { id: messageId },
      data: {
        status: 'SENT',
        externalMessageId: sendResult.messageId?.slice(0, 128) || null,
        errorCode: null,
      },
    });
  }

  private async replyViaMessenger(
    organizationId: string,
    conv: {
      id: string;
      botId: string;
      channelRef: string | null;
      externalUserId: string | null;
    },
    messageId: string,
    text: string,
  ) {
    const pageId = String(conv.channelRef || '').trim();
    const psid = String(conv.externalUserId || '').trim();
    if (!pageId || !psid) {
      throw new BadRequestException('Thiếu Fanpage hoặc PSID trên hội thoại');
    }

    const pageForBot = await this.prisma.chatbotFacebookPage.findFirst({
      where: { organizationId, pageId, botId: conv.botId },
    });
    const page =
      pageForBot ||
      (await this.prisma.chatbotFacebookPage.findFirst({
        where: { organizationId, pageId },
        orderBy: { updatedAt: 'desc' },
      }));
    if (!page?.pageAccessTokenEncrypted) {
      throw new BadRequestException('Không tìm thấy Fanpage hoặc thiếu page token');
    }

    const pageToken = this.facebookWebhook.decodePageToken(page.pageAccessTokenEncrypted);
    if (!pageToken) {
      throw new BadRequestException('Không giải mã được page access token');
    }

    // Local Graph send — do not call private facebookWebhook.sendText (FB freeze)
    const graphVersion = this.config.get<string>('META_API_VERSION') || 'v21.0';
    const url = `https://graph.facebook.com/${graphVersion}/me/messages?access_token=${encodeURIComponent(pageToken)}`;
    let sendResult: { ok: boolean; messageId?: string; errorMessage?: string } = { ok: false };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: psid },
          messaging_type: 'RESPONSE',
          message: { text: String(text || '').slice(0, 2000) },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        message_id?: string;
        error?: { message?: string; code?: number };
      };
      if (!res.ok || body.error) {
        sendResult = {
          ok: false,
          errorMessage: body.error?.message || 'Gửi Messenger thất bại',
        };
      } else {
        sendResult = { ok: true, messageId: body.message_id };
      }
    } catch (err) {
      sendResult = { ok: false, errorMessage: (err as Error).message };
    }

    if (!sendResult.ok) {
      const classified = this.facebookWebhook.classifyMessengerSendFailure(
        JSON.stringify({
          error: {
            message: sendResult.errorMessage,
          },
        }),
      );
      await this.prisma.chatbotMessage.update({
        where: { id: messageId },
        data: {
          status: 'FAILED',
          errorCode: String(classified || 'MESSENGER_SEND_FAILED').slice(0, 64),
        },
      });
      throw new BadRequestException(
        sendResult.errorMessage || 'Gửi Messenger thất bại',
      );
    }

    await this.prisma.chatbotMessage.update({
      where: { id: messageId },
      data: {
        status: 'SENT',
        externalMessageId: sendResult.messageId?.slice(0, 128) || null,
        errorCode: null,
      },
    });
  }

  private async replyViaWebsite(
    _organizationId: string,
    _conv: { id: string; sessionId: string; botId: string },
    messageId: string,
    _text: string,
  ) {
    // Website widget nhận tin qua poll public API; staff UI qua org Socket.IO
    await this.prisma.chatbotMessage.update({
      where: { id: messageId },
      data: {
        status: 'SENT',
        errorCode: null,
      },
    });
  }

  async listInboxChannelOptions(organizationId: string, botId?: string | null) {
    // Luôn trả toàn bộ Fanpage + Website của org (kèm botId) — UI tự đổi Project khi chọn
    const pages = await this.prisma.chatbotFacebookPage.findMany({
      where: { organizationId },
      include: { bot: { select: { id: true, botName: true, businessName: true } } },
      orderBy: [{ pageName: 'asc' }, { createdAt: 'desc' }],
    });

    const bots = await this.prisma.chatbotBot.findMany({
      where: { organizationId },
      select: { id: true, botName: true, businessName: true, websiteUrl: true, allowedDomains: true },
    });

    const fromConv = await this.prisma.chatbotConversation.findMany({
      where: {
        organizationId,
        channel: 'website',
        channelRef: { not: null },
      },
      distinct: ['channelRef', 'botId'],
      select: { channelRef: true, botId: true },
      take: 200,
    });

    type WebRow = { domain: string; botId: string; botName: string };
    const webMap = new Map<string, WebRow>();

    const botNameOf = (id: string) => {
      const b = bots.find((x) => x.id === id);
      return b?.botName || b?.businessName || id.slice(0, 8);
    };

    for (const row of fromConv) {
      const domain = (row.channelRef || '').trim();
      if (!domain) continue;
      const key = `${row.botId}::${domain}`;
      if (!webMap.has(key)) {
        webMap.set(key, { domain, botId: row.botId, botName: botNameOf(row.botId) });
      }
    }

    for (const bot of bots) {
      const addDomain = (raw: string | null | undefined) => {
        const s = String(raw || '').trim();
        if (!s) return;
        let host = s;
        try {
          host = new URL(s.includes('://') ? s : `https://${s}`).hostname;
        } catch {
          host = s.replace(/^https?:\/\//, '').split('/')[0] || s;
        }
        host = host.replace(/^www\./, '').slice(0, 128);
        if (!host) return;
        const key = `${bot.id}::${host}`;
        if (!webMap.has(key)) {
          webMap.set(key, {
            domain: host,
            botId: bot.id,
            botName: bot.botName || bot.businessName || bot.id.slice(0, 8),
          });
        }
      };
      addDomain(bot.websiteUrl);
      for (const d of (bot.allowedDomains || '').split(/[\s,;]+/)) addDomain(d);
    }

    const fanpages = pages.map((p) => ({
      pageId: p.pageId,
      pageName: p.pageName,
      status: p.status,
      botId: p.botId,
      botName: p.bot?.botName || p.bot?.businessName || p.botId.slice(0, 8),
    }));

    // Nếu đang chọn Project — đưa kênh của Project đó lên đầu
    const sortedFanpages = botId
      ? [
          ...fanpages.filter((p) => p.botId === botId),
          ...fanpages.filter((p) => p.botId !== botId),
        ]
      : fanpages;

    const websites = [...webMap.values()].sort((a, b) => {
      if (botId) {
        const aMine = a.botId === botId ? 0 : 1;
        const bMine = b.botId === botId ? 0 : 1;
        if (aMine !== bMine) return aMine - bMine;
      }
      return a.domain.localeCompare(b.domain);
    });

    const oaConnections = await this.prisma.messagingChannelConnection.findMany({
      where: {
        organizationId,
        channel: MessageChannel.ZALO,
        providerKind: MessagingProviderKind.ZALO_OA,
      },
      select: {
        id: true,
        accountRef: true,
        displayName: true,
        status: true,
        metadata: true,
      },
      orderBy: [{ displayName: 'asc' }, { createdAt: 'desc' }],
    });

    const oas = oaConnections.map((o) => {
      const meta = (o.metadata as { botId?: string; avatar?: string } | null) || {};
      const mappedBotId =
        typeof meta.botId === 'string' && bots.some((b) => b.id === meta.botId)
          ? meta.botId
          : botId || bots[0]?.id || '';
      return {
        accountRef: o.accountRef,
        oaName: o.displayName || o.accountRef,
        status: o.status,
        botId: mappedBotId,
        botName: mappedBotId ? botNameOf(mappedBotId) : undefined,
        avatarUrl: typeof meta.avatar === 'string' ? meta.avatar.slice(0, 2000) : null,
        connectionId: o.id,
      };
    });

    const sortedOas = botId
      ? [...oas.filter((o) => o.botId === botId), ...oas.filter((o) => o.botId !== botId)]
      : oas;

    return {
      fanpages: sortedFanpages,
      websites,
      oas: sortedOas,
      /** Số Fanpage thuộc Project đang chọn (tiện UI) */
      projectFanpageCount: botId ? fanpages.filter((p) => p.botId === botId).length : fanpages.length,
      projectWebsiteCount: botId ? websites.filter((w) => w.botId === botId).length : websites.length,
      projectOaCount: botId ? oas.filter((o) => o.botId === botId).length : oas.length,
    };
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
      const code = probe.errorCode || CSKH_FB_ERROR.TOKEN_INVALID;
      throw new BadRequestException({
        code,
        message:
          code === CSKH_FB_ERROR.TOKEN_EXPIRED
            ? 'Page Access Token hết hạn. Kết nối lại Fanpage qua Auto Post OAuth.'
            : code === CSKH_FB_ERROR.MISSING_SCOPE
              ? 'Thiếu quyền pages_messaging / pages_manage_metadata. Kết nối lại OAuth với đủ quyền.'
              : `Token Fanpage không hợp lệ: ${probe.error}`,
      });
    }
    if (probe.pageName) pageName = probe.pageName;

    const scopes = await this.facebookWebhook.checkRequiredScopes(pageAccessToken);
    if (!scopes.ok) {
      throw new BadRequestException({
        code: scopes.errorCode || CSKH_FB_ERROR.MISSING_SCOPE,
        message: `Thiếu quyền: ${(scopes.missing.length ? scopes.missing : [...CSKH_FB_REQUIRED_SCOPES]).join(', ')}`,
        missing: scopes.missing,
      });
    }

    const subscribed = await this.facebookWebhook.subscribePageWebhook(pageId, pageAccessToken);
    if (!subscribed) {
      throw new BadRequestException({
        code: CSKH_FB_ERROR.WEBHOOK_NOT_SUBSCRIBED,
        message:
          'Không subscribe được webhook (messages, messaging_postbacks, message_deliveries, message_reads). Kiểm tra quyền pages_manage_metadata / pages_messaging và Callback URL Meta App.',
      });
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
            error: probe.errorCode || probe.error || CSKH_FB_ERROR.TOKEN_INVALID,
          });
          continue;
        }

        const scopes = await this.facebookWebhook.checkRequiredScopes(token);
        if (!scopes.ok) {
          results.push({
            pageId: page.pageId,
            pageName: page.pageName,
            ok: false,
            error: `${scopes.errorCode || CSKH_FB_ERROR.MISSING_SCOPE}:${scopes.missing.join(',')}`,
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
