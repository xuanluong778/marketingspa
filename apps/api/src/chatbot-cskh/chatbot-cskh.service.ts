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
    void this.refreshConnectedPagePictures(organizationId, 4).catch(() => undefined);
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
      /** all | facebook | website */
      channel?: string | null;
      /** pageId (Fanpage) hoặc domain (Website) */
      channelId?: string | null;
    },
  ) {
    this.scheduleInboxProfileMaintenance(organizationId);

    const maxLimit = opts?.maxLimit ?? 200;
    const take = Math.min(Math.max(Number(limit) || 25, 1), maxLimit);
    const decoded = cursor ? this.decodeInboxCursor(cursor) : null;
    const botId = opts?.botId?.trim() || null;
    const channelRaw = (opts?.channel || '').trim().toLowerCase();
    const channel =
      channelRaw === 'facebook' || channelRaw === 'website' || channelRaw === 'messenger'
        ? channelRaw === 'messenger'
          ? 'facebook'
          : channelRaw
        : null;
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

    const items = pageRows.map((c) =>
      this.serializeConversation(c, pageMap.get(c.channelRef || ''), false, {
        unreadMessageCount: unreadCounts.get(c.id) ?? 0,
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

  /** Refresh Fanpage picture URLs (Meta CDN signed URLs expire → 403). */
  private async refreshConnectedPagePictures(organizationId: string, limit = 6) {
    const pages = await this.prisma.chatbotFacebookPage.findMany({
      where: { organizationId, status: 'connected' },
      take: Math.min(limit, 20),
      orderBy: { updatedAt: 'desc' },
    });
    for (const page of pages) {
      const token = this.facebookWebhook.decodePageToken(page.pageAccessTokenEncrypted);
      if (!token) continue;
      const pic = await this.facebookWebhook.resolvePagePictureUrl(page.pageId, token);
      if (!pic || pic === page.pagePictureUrl) continue;
      await this.prisma.chatbotFacebookPage
        .update({
          where: { id: page.id },
          data: { pagePictureUrl: pic.slice(0, 2000) },
        })
        .catch(() => undefined);
    }
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
    const channelRaw = (opts?.channel || '').trim().toLowerCase();
    const channel =
      channelRaw === 'facebook' || channelRaw === 'website' || channelRaw === 'messenger'
        ? channelRaw === 'messenger'
          ? 'facebook'
          : channelRaw
        : null;
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
        row.visitorName && !/^Khách Messenger$/i.test(row.visitorName)
          ? row.visitorName
          : row.externalUserId
            ? `PSID …${row.externalUserId.slice(-4)}`
            : row.visitorName || 'Khách';
      const avatarProxy =
        row.channel === 'facebook' && row.externalUserId
          ? this.facebookWebhook.buildSignedVisitorAvatarUrl(row.id)
          : '';
      return {
        conversationId: row.id,
        botId: row.botId,
        visitorName: name,
        visitorAvatarUrl:
          avatarProxy ||
          this.facebookWebhook.sanitizeAvatarUrl(row.visitorAvatarUrl) ||
          null,
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

    const messagesAsc = [...conv.messages].reverse();
    const unreadCounts = await this.countUnreadByConversationIds(organizationId, [conv.id]);

    return this.serializeConversation(
      { ...conv, messages: messagesAsc },
      fanpage || undefined,
      true,
      { unreadMessageCount: unreadCounts.get(conv.id) ?? 0 },
    );
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
    extras?: { unreadMessageCount?: number },
  ) {
    const psid = conv.externalUserId || null;
    const customerName =
      conv.visitorName && !/^Khách Messenger$/i.test(conv.visitorName)
        ? conv.visitorName
        : psid
          ? `PSID …${psid.slice(-4)}`
          : conv.visitorName;

    // Messenger: luôn trả signed proxy URL (Graph CDN hết hạn / null) — <img> không gửi JWT
    const storedVisitorAvatar = this.facebookWebhook.sanitizeAvatarUrl(
      conv.visitorAvatarUrl ?? null,
    );
    const facebookProxyAvatar =
      conv.channel === 'facebook' && conv.externalUserId
        ? this.facebookWebhook.buildSignedVisitorAvatarUrl(conv.id)
        : '';
    const cleanVisitorAvatar = facebookProxyAvatar || storedVisitorAvatar;
    const cleanPageAvatar = this.facebookWebhook.sanitizeAvatarUrl(
      fanpage?.pagePictureUrl ?? null,
    );

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
      },
      fanpage:
        conv.channel === 'facebook'
          ? {
              pageId: fanpage?.pageId || conv.channelRef,
              pageName: fanpage?.pageName || null,
              avatarUrl: cleanPageAvatar ?? null,
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
        // Prefetch binary vào disk cache (proxy URL) — ngay cả khi profile_pic field null
        const binary = await this.facebookWebhook.fetchMessengerAvatarBinary(pageId, psid, token);
        const cleanPic =
          this.facebookWebhook.sanitizeAvatarUrl(profile?.profilePic) ||
          this.facebookWebhook.sanitizeAvatarUrl(binary?.sourceUrl) ||
          undefined;

        if (!profile?.name && !cleanPic && !binary) {
          if (!row.visitorName || row.visitorName === 'Khách Messenger') {
            await this.prisma.chatbotConversation.update({
              where: { id: row.id },
              data: { visitorName: `PSID …${psid.slice(-4)}` },
            });
            updated += 1;
          }
          continue;
        }

        if (binary) {
          this.facebookWebhook.materializeVisitorAvatarCache(
            row.id,
            binary.buffer,
            binary.contentType,
          );
        }

        await this.prisma.chatbotConversation.update({
          where: { id: row.id },
          data: {
            ...(profile?.name ? { visitorName: profile.name.slice(0, 190) } : {}),
            ...(cleanPic ? { visitorAvatarUrl: cleanPic.slice(0, 2000) } : {}),
          },
        });
        updated += 1;

        {
          const pic = await this.facebookWebhook.resolvePagePictureUrl(pageId, token);
          if (pic && pic !== page.pagePictureUrl) {
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

    return {
      fanpages: sortedFanpages,
      websites,
      /** Số Fanpage thuộc Project đang chọn (tiện UI) */
      projectFanpageCount: botId ? fanpages.filter((p) => p.botId === botId).length : fanpages.length,
      projectWebsiteCount: botId ? websites.filter((w) => w.botId === botId).length : websites.length,
    };
  }

  async listFacebookPages(organizationId: string, botId?: string | null) {
    const pages = await this.prisma.chatbotFacebookPage.findMany({
      where: {
        organizationId,
        ...(botId ? { botId } : {}),
      },
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
            // KHÔNG ghi đè botId — giữ Project/Bot đã gán (tránh gộp mọi Fanpage về 1 bot)
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
