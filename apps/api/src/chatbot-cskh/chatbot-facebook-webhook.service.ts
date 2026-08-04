import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  forwardRef,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  ChatbotBot,
  ChatbotBotStatus,
  ChatbotConversationStatus,
  MessageChannel,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import { ChatbotCskhService } from './chatbot-cskh.service';
import { EventsGateway } from '../events/events.gateway';
import { MessagingWebhookIngressService } from '../messaging/messaging-webhook-ingress.service';
import { generateAiReply } from './utils/chatbot-ai.util';
import {
  CREDIT_EXHAUSTED_MESSAGE,
  NO_DATA_REPLY,
} from './utils/chatbot-constants';
import {
  CSKH_FB_ERROR,
  CSKH_FB_REQUIRED_SCOPES,
  CSKH_FB_SUBSCRIBED_FIELDS,
  CSKH_FB_SUBSCRIBED_FIELDS_LIST,
} from './utils/chatbot-fb-errors';
import { decodeStoredSecret, maskExternalId } from '../common/utils/token-security.util';

type MetaMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: unknown[];
  };
  postback?: { payload?: string; title?: string };
  delivery?: unknown;
  read?: unknown;
};

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MetaMessagingEvent[];
  }>;
};

type FacebookPageWithBot = {
  id: string;
  organizationId: string;
  botId: string;
  pageId: string;
  pageName: string;
  pageAccessTokenEncrypted: string;
  aiEnabled: boolean;
  status: string;
  webhookSubscribed: boolean;
  bot: ChatbotBot;
};

@Injectable()
export class ChatbotFacebookWebhookService implements OnModuleInit {
  private readonly logger = new Logger(ChatbotFacebookWebhookService.name);
  private readonly lastReplyAt = new Map<string, number>();
  private readonly recentMids = new Map<string, number>();
  private readonly minReplyIntervalMs = 3000;
  private readonly messagingWindowMs = 24 * 60 * 60 * 1000;
  private readonly midTtlMs = 10 * 60 * 1000;
  private lastWebhookAt: Date | null = null;
  private lastWebhookPageId: string | null = null;
  private lastWebhookEventId: string | null = null;
  private lastWebhookError: string | null = null;
  private processedCount = 0;
  private skippedCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatbotCskhService))
    private readonly chatbot: ChatbotCskhService,
    private readonly openAi: OpenAiService,
    private readonly config: ConfigService,
    private readonly events: EventsGateway,
    private readonly messagingIngress: MessagingWebhookIngressService,
  ) {}

  onModuleInit() {
    // Nhận chung payload khi Meta gọi /messaging/webhooks/messenger
    this.messagingIngress.registerChatbotPageHandler((payload) => {
      this.processPayloadAsync(payload as MetaWebhookPayload);
    });
  }

  getVerifyToken(): string {
    return (
      this.config.get<string>('CSKH_FB_WEBHOOK_VERIFY_TOKEN') ||
      this.config.get<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN') ||
      'marketingspa_cskh_fb'
    ).trim();
  }

  /** Page Access Token ưu tiên token chat Messenger. */
  getMessengerPageToken(): string {
    return (
      this.config.get<string>('META_MESSENGER_TOKEN_CHAT') ||
      this.config.get<string>('META_PAGE_ACCESS_TOKEN') ||
      ''
    ).trim();
  }

  getEnvPageId(): string {
    return (this.config.get<string>('META_PAGE_ID') || '').trim();
  }

  getAppSecret(): string {
    return (
      this.config.get<string>('META_APP_SECRET') ||
      this.config.get<string>('FACEBOOK_APP_SECRET') ||
      ''
    ).trim();
  }

  getWebhookPath(): string {
    return '/api/v1/chatbot-cskh/facebook/webhook';
  }

  getWebhookUrl(): string {
    const apiUrl = (this.config.get<string>('API_URL') || 'http://localhost:4000').replace(
      /\/$/,
      '',
    );
    return `${apiUrl}${this.getWebhookPath()}`;
  }

  /** Trạng thái kết nối an toàn cho UI (không lộ token / verify token). */
  async getPublicConnectStatus(organizationId?: string) {
    const pageId = this.getEnvPageId();
    const hasToken = Boolean(this.getMessengerPageToken());
    const appSecretConfigured = Boolean(this.getAppSecret());
    const verifyTokenConfigured = Boolean(this.getVerifyToken());

    const pageRows = organizationId
      ? await this.prisma.chatbotFacebookPage.findMany({
          where: { organizationId },
          include: { bot: { select: { id: true, botName: true, status: true } } },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        })
      : [];

    const connectedPages = pageRows.filter((p) => p.status === 'connected');
    const webhookOk = connectedPages.some((p) => p.webhookSubscribed);
    const botActive = connectedPages.some((p) => p.bot.status === ChatbotBotStatus.ACTIVE);

    let tokenHealth: 'ok' | 'missing' | 'decode_failed' | 'expired' | 'unknown' = 'unknown';
    let tokenError: string | null = null;
    if (connectedPages.length > 0) {
      const sample = connectedPages[0]!;
      const decoded =
        this.decodePageToken(sample.pageAccessTokenEncrypted) || this.getMessengerPageToken();
      if (!decoded) {
        tokenHealth = 'decode_failed';
      } else {
        const probe = await this.validatePageToken(sample.pageId, decoded);
        if (probe.ok) {
          tokenHealth = 'ok';
        } else {
          tokenHealth = 'expired';
          tokenError = probe.error || 'token_invalid';
          this.lastWebhookError = tokenError;
        }
      }
    } else if (pageId && hasToken) {
      const probe = await this.validatePageToken(pageId, this.getMessengerPageToken());
      tokenHealth = probe.ok ? 'ok' : 'expired';
      tokenError = probe.ok ? null : probe.error || 'token_invalid';
    } else {
      tokenHealth = hasToken ? 'ok' : 'missing';
    }

    return {
      ok: true,
      serverConfigured: Boolean(pageId && hasToken),
      pageIdMasked: pageId ? `••••${pageId.slice(-4)}` : null,
      pageNameHint: (this.config.get<string>('META_PAGE_NAME') || '').trim() || null,
      webhookUrl: this.getWebhookUrl(),
      verifyTokenConfigured,
      appSecretConfigured,
      signatureMode: appSecretConfigured ? 'required' : 'optional',
      subscribedFields: [...CSKH_FB_SUBSCRIBED_FIELDS_LIST],
      requiredScopes: [...CSKH_FB_REQUIRED_SCOPES],
      verifyOk: verifyTokenConfigured,
      connectedPageCount: connectedPages.length,
      webhookSubscribed: webhookOk,
      botActive,
      aiEnabled: connectedPages.some((p) => p.aiEnabled),
      tokenHealth,
      tokenError,
      lastWebhookAt: this.lastWebhookAt?.toISOString() ?? null,
      lastWebhookPageIdMasked: this.lastWebhookPageId
        ? `••••${this.lastWebhookPageId.slice(-4)}`
        : null,
      lastWebhookEventId: this.lastWebhookEventId,
      lastWebhookError: this.lastWebhookError,
      lastErrorCode: this.classifyErrorCode(this.lastWebhookError),
      processedCount: this.processedCount,
      skippedCount: this.skippedCount,
      pages: pageRows.map((p) => ({
        id: p.id,
        pageIdMasked: `••••${p.pageId.slice(-4)}`,
        pageName: p.pageName,
        status: p.status,
        webhookSubscribed: p.webhookSubscribed,
        aiEnabled: p.aiEnabled,
        botName: p.bot.botName,
        botStatus: p.bot.status,
        hasPageToken: Boolean(p.pageAccessTokenEncrypted),
        pageIdMatchesEnv: pageId ? p.pageId === pageId : null,
      })),
      hints: this.buildStatusHints({
        serverConfigured: Boolean(pageId && hasToken),
        connectedPageCount: connectedPages.length,
        webhookOk,
        botActive,
        tokenHealth,
        lastWebhookAt: this.lastWebhookAt,
        lastWebhookError: this.lastWebhookError,
      }),
    };
  }

  classifyErrorCode(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = raw.toLowerCase();
    if (s.includes('missing_scope') || s.includes('missing_permission') || s.includes('(#10)')) {
      return CSKH_FB_ERROR.MISSING_SCOPE;
    }
    if (s.includes('token_expired') || s.includes('session has expired') || s.includes('190')) {
      return CSKH_FB_ERROR.TOKEN_EXPIRED;
    }
    if (s.includes('subscribe') || s.includes('webhook_not')) {
      return CSKH_FB_ERROR.WEBHOOK_NOT_SUBSCRIBED;
    }
    if (s.includes('openai') || s.includes('ai_error') || s.includes('llm')) {
      return CSKH_FB_ERROR.OPENAI_ERROR;
    }
    if (s.includes('send_failed') || s.includes('messenger_send')) {
      return CSKH_FB_ERROR.MESSENGER_SEND_FAILED;
    }
    if (
      s.includes('standard_access') ||
      s.includes('không phải là quản trị') ||
      s.includes('not a admin') ||
      s.includes('not an admin') ||
      s.includes('tester')
    ) {
      return CSKH_FB_ERROR.MESSENGER_STANDARD_ACCESS;
    }
    if (s.includes('unmapped_page')) return CSKH_FB_ERROR.UNMAPPED_PAGE;
    if (s.includes('missing_page_token')) return CSKH_FB_ERROR.MISSING_PAGE_TOKEN;
    return raw.slice(0, 64);
  }

  private buildStatusHints(input: {
    serverConfigured: boolean;
    connectedPageCount: number;
    webhookOk: boolean;
    botActive: boolean;
    tokenHealth: string;
    lastWebhookAt: Date | null;
    lastWebhookError: string | null;
  }): string[] {
    const hints: string[] = [];
    if (!input.serverConfigured) {
      hints.push('Server chưa cấu hình META_PAGE_ID / Page Access Token.');
    }
    if (input.connectedPageCount === 0) {
      hints.push('Chưa kết nối Fanpage trong tab Kênh — bấm «Kết nối trang Facebook».');
    }
    if (input.connectedPageCount > 0 && !input.webhookOk) {
      hints.push(
        'Fanpage chưa subscribe webhook (messages, messaging_postbacks, message_deliveries, message_reads). Đồng bộ lại từ Auto Post.',
      );
    }
    if (input.connectedPageCount > 0 && !input.botActive) {
      hints.push('Bot gắn Fanpage chưa ở trạng thái Đang chạy — tin vẫn lưu Inbox nhưng AI không trả lời.');
    }
    if (input.tokenHealth === 'decode_failed' || input.tokenHealth === 'missing') {
      hints.push('Page Access Token thiếu hoặc không giải mã được — kiểm tra ENCRYPTION_KEY / token.');
    }
    if (input.tokenHealth === 'expired') {
      hints.push(
        'Page Access Token đã hết hạn hoặc thiếu quyền pages_messaging. Dán Page Access Token mới rồi bấm Kết nối lại.',
      );
    }
    if (!input.lastWebhookAt) {
      hints.push(
        'Chưa nhận webhook thực tế từ Meta. Sau khi token OK, đồng bộ Fanpage để subscribe đủ 4 field.',
      );
    }
    if (input.lastWebhookError) {
      hints.push(`Lỗi gần nhất: ${input.lastWebhookError}`);
    }
    return hints;
  }

  private graphVersion(): string {
    return (
      this.config.get<string>('META_API_VERSION') ||
      this.config.get<string>('META_GRAPH_VERSION') ||
      'v21.0'
    ).replace(/^\//, '');
  }

  verifyChallenge(mode?: string, token?: string, challenge?: string): string {
    if (mode === 'subscribe' && token === this.getVerifyToken() && challenge) {
      this.logger.log('Meta webhook verify OK');
      return challenge;
    }
    this.logger.warn(
      `Webhook verify failed mode=${mode || '-'} tokenMatch=${token === this.getVerifyToken()}`,
    );
    throw new ForbiddenException('Webhook verify failed');
  }

  /**
   * Verify X-Hub-Signature-256 khi có META_APP_SECRET — fail-closed (không soft-fail).
   * Thiếu header / rawBody / mismatch → false.
   */
  verifySignature(rawBody?: Buffer, signatureHeader?: string): boolean {
    const secret = this.getAppSecret();
    if (!secret) {
      return true;
    }

    if (!signatureHeader?.startsWith('sha256=')) {
      this.logger.warn('Meta signature header missing');
      return false;
    }
    if (!rawBody?.length) {
      this.logger.warn('Meta webhook rawBody missing — cannot verify signature');
      return false;
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const received = signatureHeader.slice('sha256='.length).trim();
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(received, 'hex');
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        this.logger.warn('Meta signature mismatch — check META_APP_SECRET matches webhook app');
        return false;
      }
      return true;
    } catch {
      this.logger.warn('Meta signature parse failed');
      return false;
    }
  }

  /** Kiểm tra Page Access Token còn sống + đúng pageId (không log token). */
  async validatePageToken(
    pageId: string,
    pageAccessToken: string,
  ): Promise<{ ok: boolean; pageName?: string; error?: string; errorCode?: string }> {
    if (!pageId || !pageAccessToken) {
      return { ok: false, error: 'missing_page_id_or_token' };
    }
    try {
      const url = new URL(`https://graph.facebook.com/${this.graphVersion()}/me`);
      url.searchParams.set('fields', 'id,name');
      url.searchParams.set('access_token', pageAccessToken);
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        name?: string;
        error?: { message?: string; code?: number };
      };
      if (!res.ok || data.error) {
        const msg = data.error?.message || `http_${res.status}`;
        const code =
          data.error?.code === 190
            ? CSKH_FB_ERROR.TOKEN_EXPIRED
            : data.error?.code === 10
              ? CSKH_FB_ERROR.MISSING_SCOPE
              : CSKH_FB_ERROR.TOKEN_INVALID;
        this.lastWebhookError = `${code}:${msg}`.slice(0, 160);
        return { ok: false, error: this.lastWebhookError, errorCode: code };
      }
      if (data.id && data.id !== pageId) {
        return {
          ok: false,
          error: `token_page_mismatch:token_for_${data.id.slice(-4)}_expected_${pageId.slice(-4)}`,
          errorCode: CSKH_FB_ERROR.TOKEN_INVALID,
          pageName: data.name,
        };
      }
      return { ok: true, pageName: data.name };
    } catch (err) {
      return {
        ok: false,
        error: (err as Error).message,
        errorCode: CSKH_FB_ERROR.TOKEN_INVALID,
      };
    }
  }

  /**
   * Kiểm tra quyền tối thiểu cho Messenger CSKH qua debug_token.
   * Không log access token.
   */
  async checkRequiredScopes(
    pageAccessToken: string,
  ): Promise<{ ok: boolean; granted: string[]; missing: string[]; errorCode?: string }> {
    const appId = (this.config.get<string>('META_APP_ID') || '').trim();
    const appSecret = this.getAppSecret();
    if (!appId || !appSecret) {
      // Không fail cứng nếu thiếu app credentials — probe /me đã chạy trước.
      return { ok: true, granted: [], missing: [] };
    }
    try {
      const params = new URLSearchParams({
        input_token: pageAccessToken,
        access_token: `${appId}|${appSecret}`,
      });
      const res = await fetch(
        `https://graph.facebook.com/${this.graphVersion()}/debug_token?${params.toString()}`,
      );
      const body = (await res.json().catch(() => ({}))) as {
        data?: { is_valid?: boolean; scopes?: string[]; error?: { message?: string } };
        error?: { message?: string };
      };
      if (!res.ok || body.error || body.data?.error) {
        return {
          ok: false,
          granted: [],
          missing: [...CSKH_FB_REQUIRED_SCOPES],
          errorCode: CSKH_FB_ERROR.TOKEN_INVALID,
        };
      }
      if (body.data?.is_valid === false) {
        return {
          ok: false,
          granted: [],
          missing: [...CSKH_FB_REQUIRED_SCOPES],
          errorCode: CSKH_FB_ERROR.TOKEN_EXPIRED,
        };
      }
      const granted = (body.data?.scopes ?? []).map((s) => String(s));
      const missing = CSKH_FB_REQUIRED_SCOPES.filter((s) => !granted.includes(s));
      // pages_manage_metadata đôi khi không hiện trên page token dù subscribe OK — chỉ bắt buộc pages_messaging
      const hardMissing = missing.filter((s) => s === 'pages_messaging');
      if (hardMissing.length) {
        this.lastWebhookError = `${CSKH_FB_ERROR.MISSING_SCOPE}:${hardMissing.join(',')}`;
        return {
          ok: false,
          granted,
          missing,
          errorCode: CSKH_FB_ERROR.MISSING_SCOPE,
        };
      }
      return { ok: true, granted, missing };
    } catch {
      return { ok: true, granted: [], missing: [] };
    }
  }

  decodePageToken(encrypted: string): string {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key) return '';
    return decodeStoredSecret(encrypted, key);
  }

  async subscribePageWebhook(pageId: string, pageAccessToken: string): Promise<boolean> {
    try {
      const url = new URL(
        `https://graph.facebook.com/${this.graphVersion()}/${pageId}/subscribed_apps`,
      );
      url.searchParams.set('access_token', pageAccessToken);
      url.searchParams.set('subscribed_fields', CSKH_FB_SUBSCRIBED_FIELDS);

      const res = await fetch(url.toString(), { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: { message?: string; code?: number };
      };
      const ok = res.ok && Boolean(data.success);
      if (!ok) {
        this.logger.warn(
          `Subscribe webhook failed page=${pageId}: ${JSON.stringify(data).slice(0, 200)}`,
        );
        this.lastWebhookError =
          `${CSKH_FB_ERROR.WEBHOOK_NOT_SUBSCRIBED}:${data.error?.message || 'subscribe_failed'}`.slice(
            0,
            160,
          );
      } else {
        this.logger.log(
          `Subscribed page=${pageId} fields=${CSKH_FB_SUBSCRIBED_FIELDS}`,
        );
      }
      return ok;
    } catch (err) {
      this.logger.warn(`Subscribe webhook exception page=${pageId}: ${(err as Error).message}`);
      this.lastWebhookError = (err as Error).message;
      return false;
    }
  }

  /** Fire-and-forget entry — always acknowledge Meta quickly from controller. */
  processPayloadAsync(payload: MetaWebhookPayload): void {
    void this.processPayload(payload).catch((err) => {
      this.lastWebhookError = (err as Error).message;
      this.logger.error(`Messenger webhook failed: ${(err as Error).message}`);
    });
  }

  async processPayload(payload: MetaWebhookPayload): Promise<void> {
    if (payload.object && payload.object !== 'page') {
      this.logger.debug(`Ignore non-page object=${payload.object}`);
      return;
    }
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    if (!entries.length) {
      this.logger.warn('Messenger webhook empty entry[]');
      return;
    }

    this.lastWebhookAt = new Date();

    for (const entry of entries) {
      const pageId = String(entry?.id || '').trim();
      if (!pageId) continue;
      this.lastWebhookPageId = pageId;

      const fbPage = await this.resolveFacebookPage(pageId);
      if (!fbPage) {
        this.skippedCount += 1;
        this.lastWebhookError = `${CSKH_FB_ERROR.UNMAPPED_PAGE}:${pageId.slice(-4)}`;
        this.logger.warn(
          `No ChatbotFacebookPage mapping pageId=••••${pageId.slice(-4)} — sync Fanpage from Auto Post`,
        );
        continue;
      }

      const events = Array.isArray(entry.messaging) ? entry.messaging : [];
      if (!events.length) {
        this.logger.debug(`No messaging[] for page=••••${pageId.slice(-4)}`);
        continue;
      }

      for (const event of events) {
        await this.handleMessagingEvent(fbPage, event);
      }
    }
  }

  private async resolveFacebookPage(pageId: string): Promise<FacebookPageWithBot | null> {
    const row = await this.prisma.chatbotFacebookPage.findFirst({
      where: {
        OR: [{ pageId }, ...(this.getEnvPageId() === pageId ? [{ pageId: this.getEnvPageId() }] : [])],
        status: 'connected',
      },
      include: { bot: true },
    });
    if (row) return row as FacebookPageWithBot;

    // Fallback: bất kỳ bản ghi cùng pageId (kể cả status khác) để log rõ
    const any = await this.prisma.chatbotFacebookPage.findFirst({
      where: { pageId },
      include: { bot: true },
    });
    if (any) {
      this.logger.warn(
        `Fanpage pageId=••••${pageId.slice(-4)} status=${any.status} — cần status=connected`,
      );
    }
    return null;
  }

  private async handleMessagingEvent(
    fbPage: FacebookPageWithBot,
    event: MetaMessagingEvent,
  ) {
    const psid = String(event.sender?.id || '').trim();
    const eventId =
      String(event.message?.mid || '').trim() ||
      `pb:${event.timestamp || Date.now()}:${psid.slice(-6)}`;
    this.lastWebhookEventId = eventId.slice(0, 64);

    if (!psid) {
      this.skippedCount += 1;
      return;
    }

    // Bỏ echo / delivery / read — không phải tin khách
    if (event.message?.is_echo) {
      this.skippedCount += 1;
      return;
    }
    if (event.delivery || event.read) {
      this.skippedCount += 1;
      return;
    }

    const text =
      String(event.message?.text || '').trim() ||
      String(event.postback?.title || event.postback?.payload || '').trim();

    if (!text) {
      // Attachment-only: vẫn tạo hội thoại + ghi chú để Inbox thấy
      if (event.message?.attachments?.length) {
        await this.persistInbound({
          fbPage,
          psid,
          eventId,
          text: '[Khách gửi ảnh/file đính kèm]',
        });
        this.processedCount += 1;
      } else {
        this.skippedCount += 1;
        this.logger.debug(
          `Skip empty event page=••••${fbPage.pageId.slice(-4)} sender=${maskExternalId(psid)} eventId=${eventId.slice(0, 24)}`,
        );
      }
      return;
    }

    this.logger.log(
      `FB inbound page=••••${fbPage.pageId.slice(-4)} sender=${maskExternalId(psid)} eventId=${eventId.slice(0, 32)}`,
    );

    if (this.isDuplicateMid(eventId)) {
      this.skippedCount += 1;
      this.logger.debug(`Dedupe webhook eventId=${eventId.slice(0, 32)}`);
      return;
    }
    this.markMid(eventId);

    const { conversation, isDuplicate } = await this.persistInbound({
      fbPage,
      psid,
      eventId,
      text,
    });
    if (isDuplicate) {
      this.skippedCount += 1;
      return;
    }
    this.processedCount += 1;

    // AI reply — tách khỏi lưu tin; rate-limit chỉ áp dụng cho reply
    const rateKey = `${fbPage.pageId}:${psid}`;
    if (!this.allowReply(rateKey)) {
      this.logger.debug(
        `AI rate-limited page=••••${fbPage.pageId.slice(-4)} sender=${maskExternalId(psid)}`,
      );
      return;
    }

    if (conversation.humanTakeover) {
      await this.markNeedsStaff(conversation.id);
      return;
    }

    if (fbPage.bot.status !== ChatbotBotStatus.ACTIVE) {
      await this.markNeedsStaff(conversation.id);
      this.logger.warn(
        `Bot ${fbPage.botId} not ACTIVE — message saved, AI skipped`,
      );
      return;
    }

    if (!fbPage.aiEnabled) {
      await this.markNeedsStaff(conversation.id);
      return;
    }

    const inboundAt = new Date();
    if (!this.withinMessagingWindow(inboundAt)) {
      await this.markNeedsStaff(conversation.id);
      return;
    }

    await this.generateAndSendReply({
      fbPage,
      conversationId: conversation.id,
      psid,
      text,
    });
  }

  private async persistInbound(params: {
    fbPage: FacebookPageWithBot;
    psid: string;
    eventId: string;
    text: string;
  }) {
    const { fbPage, psid, eventId, text } = params;
    const sessionId = `fb:${fbPage.pageId}:${psid}`.slice(0, 64);
    const conversation = await this.getOrCreateFbConversation(
      fbPage.organizationId,
      fbPage.botId,
      sessionId,
      psid,
      fbPage.pageId,
    );

    const externalMessageId = eventId.slice(0, 128) || null;
    if (externalMessageId) {
      const byMid = await this.prisma.chatbotMessage.findFirst({
        where: {
          conversationId: conversation.id,
          externalMessageId,
        },
        select: { id: true },
      });
      if (byMid) {
        return { conversation, isDuplicate: true as const };
      }
    }

    // Soft dedupe: cùng text trong 15s (Meta retry không có mid ổn định)
    const recentDup = await this.prisma.chatbotMessage.findFirst({
      where: {
        conversationId: conversation.id,
        role: 'user',
        message: text.slice(0, 2000),
        createdAt: { gte: new Date(Date.now() - 15_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recentDup) {
      return { conversation, isDuplicate: true as const };
    }

    const storedText = text.slice(0, 2000);

    try {
      await this.prisma.chatbotMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          message: storedText,
          status: 'RECEIVED',
          externalMessageId,
        },
      });
    } catch (err) {
      // Unique (conversationId, externalMessageId) race
      if (
        err instanceof Error &&
        /unique|Unique constraint/i.test(err.message)
      ) {
        return { conversation, isDuplicate: true as const };
      }
      throw err;
    }

    await this.prisma.chatbotConversation.update({
      where: { id: conversation.id },
      data: {
        lastUserMessageAt: new Date(),
        channel: 'facebook',
        channelRef: fbPage.pageId,
        externalUserId: psid,
        status:
          conversation.status === ChatbotConversationStatus.CLOSED
            ? ChatbotConversationStatus.OPEN
            : conversation.status,
      },
    });

    await this.upsertMessengerContact({
      organizationId: fbPage.organizationId,
      pageId: fbPage.pageId,
      psid,
      conversationId: conversation.id,
      displayName: conversation.visitorName || 'Khách Messenger',
    });

    try {
      this.events.broadcastChatbotMessageNew(fbPage.organizationId, {
        conversationId: conversation.id,
        channel: 'facebook',
        preview: text.slice(0, 120),
        visitorName: conversation.visitorName || undefined,
        pageName: fbPage.pageName || undefined,
        botId: fbPage.botId,
      });
    } catch (err) {
      this.logger.warn(`Realtime chatbot notify failed: ${(err as Error).message}`);
    }

    if (!fbPage.webhookSubscribed) {
      await this.prisma.chatbotFacebookPage
        .update({
          where: { id: fbPage.id },
          data: { webhookSubscribed: true },
        })
        .catch(() => undefined);
    }

    return { conversation, isDuplicate: false as const };
  }

  private async upsertMessengerContact(params: {
    organizationId: string;
    pageId: string;
    psid: string;
    conversationId: string;
    displayName: string;
  }) {
    const scopeKey = `messenger_page:${params.pageId}`.slice(0, 191);
    try {
      await this.prisma.messagingContactIdentity.upsert({
        where: {
          organizationId_integrationScopeKey_externalUserId: {
            organizationId: params.organizationId,
            integrationScopeKey: scopeKey,
            externalUserId: params.psid,
          },
        },
        create: {
          organizationId: params.organizationId,
          channel: MessageChannel.MESSENGER,
          integrationScopeKey: scopeKey,
          externalUserId: params.psid,
          displayName: params.displayName,
          chatbotConversationId: params.conversationId,
          lastInboundAt: new Date(),
          metadata: { pageId: params.pageId, source: 'chatbot_cskh' },
        },
        update: {
          chatbotConversationId: params.conversationId,
          lastInboundAt: new Date(),
          displayName: params.displayName,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Contact upsert failed page=••••${params.pageId.slice(-4)}: ${(err as Error).message}`.slice(
          0,
          200,
        ),
      );
    }
  }

  private async generateAndSendReply(params: {
    fbPage: FacebookPageWithBot;
    conversationId: string;
    psid: string;
    text: string;
  }) {
    const { fbPage, conversationId, psid, text } = params;
    const usage = await this.chatbot.getUsageSnapshot(fbPage.organizationId);
    const pageToken =
      this.decodePageToken(fbPage.pageAccessTokenEncrypted) || this.getMessengerPageToken();

    if (!pageToken) {
      this.lastWebhookError = CSKH_FB_ERROR.MISSING_PAGE_TOKEN;
      this.logger.warn(`No page token for page=••••${fbPage.pageId.slice(-4)}`);
      await this.markNeedsStaff(conversationId);
      return;
    }

    if (!usage.allowed) {
      await this.sendText(fbPage.pageId, pageToken, psid, CREDIT_EXHAUSTED_MESSAGE);
      await this.markNeedsStaff(conversationId);
      return;
    }

    // Re-check takeover ngay trước AI (nhân viên có thể vừa tiếp quản)
    const live = await this.prisma.chatbotConversation.findUnique({
      where: { id: conversationId },
      select: { humanTakeover: true },
    });
    if (live?.humanTakeover) {
      this.lastWebhookError = CSKH_FB_ERROR.HUMAN_TAKEOVER;
      await this.markNeedsStaff(conversationId);
      return;
    }

    const processingMsg = await this.prisma.chatbotMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        message: '…',
        status: 'PROCESSING',
      },
    });

    const [sources, history, settings] = await Promise.all([
      this.prisma.chatbotKnowledgeSource.findMany({
        where: { botId: fbPage.botId, status: { in: ['active', 'ready'] } },
      }),
      this.prisma.chatbotMessage.findMany({
        where: { conversationId, id: { not: processingMsg.id } },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
      this.chatbot.getSettings(fbPage.organizationId),
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
            timeoutMs: 12_000,
            messages: [
              { role: 'system', content: input.systemPrompt },
              ...input.history.slice(-8),
              { role: 'user', content: input.userText },
            ],
          })
      : undefined;

    let aiResult: {
      reply: string;
      usedAi: boolean;
      showLead: boolean;
      noData: boolean;
      blockedCode?: string;
    };
    try {
      aiResult = await generateAiReply({
        bot: fbPage.bot,
        userText: text,
        sources,
        history,
        settings,
        usageAllowed: usage.allowed,
        openAiChat,
        maxRetries: 1,
      });
    } catch (err) {
      this.logger.warn(`FB AI error: ${(err as Error).message}`);
      this.lastWebhookError = `${CSKH_FB_ERROR.OPENAI_ERROR}:${(err as Error).message}`.slice(0, 160);
      aiResult = {
        reply: NO_DATA_REPLY,
        usedAi: false,
        showLead: true,
        noData: true,
        blockedCode: CSKH_FB_ERROR.OPENAI_ERROR,
      };
    }

    if (aiResult.blockedCode === 'ai_error' || aiResult.blockedCode === CSKH_FB_ERROR.OPENAI_ERROR) {
      this.lastWebhookError =
        this.lastWebhookError || `${CSKH_FB_ERROR.OPENAI_ERROR}:fallback`;
    }

    if (aiResult.showLead || aiResult.noData) {
      await this.markNeedsStaff(conversationId);
    }

    if (aiResult.usedAi) {
      const month = new Date().toISOString().slice(0, 7);
      await this.prisma.chatbotUsage.upsert({
        where: {
          organizationId_month_botId: {
            organizationId: fbPage.organizationId,
            month,
            botId: fbPage.botId,
          },
        },
        create: {
          organizationId: fbPage.organizationId,
          botId: fbPage.botId,
          month,
          aiReplies: 1,
        },
        update: { aiReplies: { increment: 1 } },
      });
    }

    // Takeover lại trước khi gửi Messenger
    const beforeSend = await this.prisma.chatbotConversation.findUnique({
      where: { id: conversationId },
      select: { humanTakeover: true },
    });
    if (beforeSend?.humanTakeover) {
      await this.prisma.chatbotMessage.update({
        where: { id: processingMsg.id },
        data: {
          message: 'Bot tạm dừng — nhân viên đang tiếp quản.',
          status: 'FAILED',
          errorCode: CSKH_FB_ERROR.HUMAN_TAKEOVER,
        },
      });
      return;
    }

    const sent = await this.sendText(fbPage.pageId, pageToken, psid, aiResult.reply);
    if (!sent) {
      this.lastWebhookError =
        this.lastWebhookError?.startsWith(CSKH_FB_ERROR.TOKEN_EXPIRED) ||
        this.lastWebhookError?.startsWith(CSKH_FB_ERROR.MISSING_SCOPE)
          ? this.lastWebhookError
          : CSKH_FB_ERROR.MESSENGER_SEND_FAILED;
    }

    await this.prisma.chatbotMessage.update({
      where: { id: processingMsg.id },
      data: {
        message: aiResult.reply.slice(0, 2000),
        status: sent ? 'SENT' : 'FAILED',
        errorCode: sent
          ? null
          : this.classifyErrorCode(this.lastWebhookError) || CSKH_FB_ERROR.MESSENGER_SEND_FAILED,
      },
    });

    try {
      this.events.broadcastChatbotMessageNew(fbPage.organizationId, {
        conversationId,
        channel: 'facebook',
        preview: aiResult.reply.slice(0, 120),
        pageName: fbPage.pageName || undefined,
        botId: fbPage.botId,
      });
    } catch {
      /* ignore */
    }
  }

  private async getOrCreateFbConversation(
    organizationId: string,
    botId: string,
    sessionId: string,
    psid: string,
    channelRef: string,
  ) {
    const pageId = channelRef.slice(0, 128);
    const existing = await this.prisma.chatbotConversation.findUnique({
      where: { botId_sessionId: { botId, sessionId } },
    });
    if (existing) {
      return this.prisma.chatbotConversation.update({
        where: { id: existing.id },
        data: {
          externalUserId: psid,
          channelRef: pageId,
          channel: 'facebook',
        },
      });
    }

    return this.prisma.chatbotConversation.create({
      data: {
        organizationId,
        botId,
        sessionId,
        channel: 'facebook',
        externalUserId: psid,
        channelRef: pageId,
        status: ChatbotConversationStatus.OPEN,
        visitorName: 'Khách Messenger',
      },
    });
  }

  private async markNeedsStaff(conversationId: string) {
    await this.prisma.chatbotConversation.update({
      where: { id: conversationId },
      data: { status: ChatbotConversationStatus.NEEDS_STAFF },
    });
  }

  private allowReply(key: string): boolean {
    const now = Date.now();
    const last = this.lastReplyAt.get(key) ?? 0;
    if (now - last < this.minReplyIntervalMs) return false;
    this.lastReplyAt.set(key, now);
    return true;
  }

  private isDuplicateMid(eventId: string): boolean {
    this.pruneMids();
    if (this.recentMids.has(eventId)) return true;
    return false;
  }

  private markMid(eventId: string) {
    this.recentMids.set(eventId, Date.now());
    this.pruneMids();
  }

  private pruneMids() {
    const cutoff = Date.now() - this.midTtlMs;
    for (const [k, t] of this.recentMids) {
      if (t < cutoff) this.recentMids.delete(k);
    }
  }

  private withinMessagingWindow(lastUserAt: Date): boolean {
    return Date.now() - lastUserAt.getTime() <= this.messagingWindowMs;
  }

  private async sendText(
    pageId: string,
    pageToken: string,
    psid: string,
    text: string,
  ): Promise<boolean> {
    if (!pageToken) return false;
    try {
      const url = `https://graph.facebook.com/${this.graphVersion()}/me/messages?access_token=${encodeURIComponent(pageToken)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: psid },
          messaging_type: 'RESPONSE',
          message: { text: String(text || '').slice(0, 2000) },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Send FB message failed page=${pageId}: ${body.slice(0, 300)}`);
        if (body.includes('190') || body.toLowerCase().includes('session has expired')) {
          this.lastWebhookError = CSKH_FB_ERROR.TOKEN_EXPIRED;
        } else if (
          body.includes('quản trị') ||
          body.toLowerCase().includes('not a admin') ||
          body.toLowerCase().includes('not an admin') ||
          (body.includes('"code":10') && body.toLowerCase().includes('pages_messaging'))
        ) {
          this.lastWebhookError = CSKH_FB_ERROR.MESSENGER_STANDARD_ACCESS;
        } else if (body.includes('10') || body.toLowerCase().includes('permission')) {
          this.lastWebhookError = CSKH_FB_ERROR.MISSING_SCOPE;
        } else {
          this.lastWebhookError = CSKH_FB_ERROR.MESSENGER_SEND_FAILED;
        }
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Send FB message exception page=${pageId}: ${(err as Error).message}`);
      this.lastWebhookError = CSKH_FB_ERROR.MESSENGER_SEND_FAILED;
      return false;
    }
  }
}
