import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  forwardRef,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
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
  INSUFFICIENT_AI_CREDIT_MESSAGE,
  NO_DATA_REPLY,
} from './utils/chatbot-constants';
import {
  CSKH_FB_ERROR,
  CSKH_FB_REQUIRED_SCOPES,
  CSKH_FB_SUBSCRIBED_FIELDS,
  CSKH_FB_SUBSCRIBED_FIELDS_LIST,
} from './utils/chatbot-fb-errors';
import { decodeStoredSecret, maskExternalId } from '../common/utils/token-security.util';
import { RagKbService } from '../rag-kb/rag-kb.service';
import { LeadsService } from '../leads/leads.service';
import { CreditService } from '../credit/credit.service';
import { CREDIT_FEATURE_CODES } from '@marketingspa/shared';

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
  pagePictureUrl?: string | null;
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
  /** Skip slow Graph avatar retries after miss (keeps inbox <img> fast). */
  private readonly avatarGraphMissUntil = new Map<string, number>();
  private readonly minReplyIntervalMs = 3000;
  private readonly messagingWindowMs = 24 * 60 * 60 * 1000;
  private readonly midTtlMs = 10 * 60 * 1000;
  private readonly avatarGraphMissTtlMs = 30 * 60 * 1000;
  private lastWebhookAt: Date | null = null;
  private lastWebhookPageId: string | null = null;
  private lastWebhookEventId: string | null = null;
  private lastWebhookError: string | null = null;
  private appWebhookRegistered: boolean | null = null;
  private appWebhookCallbackUrl: string | null = null;
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
    private readonly ragKb: RagKbService,
    private readonly leads: LeadsService,
    private readonly credit: CreditService,
  ) {}

  onModuleInit() {
    // Nhận chung payload khi Meta gọi /messaging/webhooks/messenger
    this.messagingIngress.registerChatbotPageHandler((payload) => {
      this.processPayloadAsync(payload as MetaWebhookPayload);
    });
    // 1) Đăng ký callback app-level (bắt buộc — không có thì Meta KHÔNG POST tin)
    // 2) Re-subscribe subscribed_apps mọi Fanpage connected (không hard-code pageId)
    setTimeout(() => {
      void this.ensureAppAndPageWebhooks().catch((err) => {
        this.logger.warn(
          `ensureAppAndPageWebhooks: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, 8_000);
  }

  getAppId(): string {
    return (
      this.config.get<string>('META_APP_ID') ||
      this.config.get<string>('FACEBOOK_APP_ID') ||
      ''
    ).trim();
  }

  /** App access token dạng app_id|app_secret — dùng cho /{app-id}/subscriptions. */
  private getAppAccessToken(): string {
    const appId = this.getAppId();
    const secret = this.getAppSecret();
    if (!appId || !secret) return '';
    return `${appId}|${secret}`;
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

    // Probe 1 hội thoại gần nhất: User Profile API (profile_pic) — cần Business Asset User Profile Access
    let visitorAvatarAccess: 'ok' | 'blocked' | 'unknown' | 'no_data' = 'unknown';
    if (organizationId && connectedPages.length > 0 && tokenHealth === 'ok') {
      try {
        const sampleConv = await this.prisma.chatbotConversation.findFirst({
          where: {
            organizationId,
            channel: 'facebook',
            externalUserId: { not: null },
            channelRef: { not: null },
            NOT: { externalUserId: { startsWith: 'smoke' } },
          },
          orderBy: { updatedAt: 'desc' },
          select: { externalUserId: true, channelRef: true },
        });
        if (!sampleConv?.externalUserId || !sampleConv.channelRef) {
          visitorAvatarAccess = 'no_data';
        } else {
          const page = connectedPages.find((p) => p.pageId === sampleConv.channelRef) || connectedPages[0]!;
          const pageToken = this.decodePageToken(page.pageAccessTokenEncrypted);
          if (pageToken) {
            const url = new URL(
              `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(sampleConv.externalUserId)}`,
            );
            url.searchParams.set('fields', 'profile_pic');
            url.searchParams.set('access_token', pageToken);
            const proof = this.appSecretProof(pageToken);
            if (proof) url.searchParams.set('appsecret_proof', proof);
            const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6_000) });
            const data = (await res.json().catch(() => ({}))) as {
              profile_pic?: string;
              error?: { code?: number; error_subcode?: number };
            };
            if (res.ok && data.profile_pic) visitorAvatarAccess = 'ok';
            else if (data.error?.code === 100 && data.error?.error_subcode === 33)
              visitorAvatarAccess = 'blocked';
            else if (!res.ok || data.error) visitorAvatarAccess = 'blocked';
            else visitorAvatarAccess = 'blocked';
          }
        }
      } catch {
        visitorAvatarAccess = 'unknown';
      }
    } else if (connectedPages.length === 0) {
      visitorAvatarAccess = 'no_data';
    }

    return {
      ok: true,
      serverConfigured: Boolean(pageId && hasToken),
      pageIdMasked: pageId ? `••••${pageId.slice(-4)}` : null,
      pageNameHint: (this.config.get<string>('META_PAGE_NAME') || '').trim() || null,
      webhookUrl: this.getWebhookUrl(),
      verifyTokenConfigured,
      appSecretConfigured,
      appIdConfigured: Boolean(this.getAppId()),
      appWebhookRegistered: this.appWebhookRegistered,
      appWebhookCallbackUrl: this.appWebhookCallbackUrl,
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
        appWebhookRegistered: this.appWebhookRegistered,
        visitorAvatarAccess,
      }),
      visitorAvatarAccess,
    };
  }

  classifyErrorCode(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = raw.toLowerCase();
    // Standard Access trước generic (#10) / missing_scope
    if (
      s.includes('messenger_standard_access') ||
      s.includes('standard_access') ||
      s.includes('không phải là quản trị') ||
      s.includes('khong phai la quan tri') ||
      s.includes('not a admin') ||
      s.includes('not an admin') ||
      s.includes('not a page admin') ||
      (s.includes('tester') && s.includes('pages_messaging')) ||
      (s.includes('pages_messaging') &&
        (s.includes('xem xét') || s.includes('approved') || s.includes('review')))
    ) {
      return CSKH_FB_ERROR.MESSENGER_STANDARD_ACCESS;
    }
    if (s.includes('token_expired') || s.includes('session has expired') || /\b190\b/.test(s)) {
      return CSKH_FB_ERROR.TOKEN_EXPIRED;
    }
    if (
      s.includes('missing_scope') ||
      s.includes('missing_permission') ||
      s.includes('pages_manage_metadata')
    ) {
      return CSKH_FB_ERROR.MISSING_SCOPE;
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
    if (s.includes('unmapped_page')) return CSKH_FB_ERROR.UNMAPPED_PAGE;
    if (s.includes('missing_page_token')) return CSKH_FB_ERROR.MISSING_PAGE_TOKEN;
    return raw.slice(0, 64);
  }

  /**
   * Phân loại lỗi Graph Send — parse JSON để tránh miss khi message bị Unicode-escape.
   */
  classifyMessengerSendFailure(rawBody: string): string {
    let code: number | null = null;
    let message = rawBody;
    try {
      const parsed = JSON.parse(rawBody) as {
        error?: { code?: number; message?: string; error_subcode?: number };
      };
      code = parsed.error?.code ?? null;
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      /* raw text */
    }
    const low = message.toLowerCase();
    if (code === 190 || low.includes('session has expired')) {
      return CSKH_FB_ERROR.TOKEN_EXPIRED;
    }
    // Code 10 + thông điệp Admin/Dev/Tester / chờ duyệt pages_messaging → Standard Access
    const standardAccess =
      low.includes('quản trị') ||
      low.includes('quan tri') ||
      low.includes('nhà phát triển') ||
      low.includes('nha phat trien') ||
      low.includes('người thử nghiệm') ||
      low.includes('nguoi thu nghiem') ||
      low.includes('not an admin') ||
      low.includes('not a admin') ||
      low.includes('developers or testers') ||
      low.includes('tester') ||
      (low.includes('pages_messaging') &&
        (low.includes('xem xét') ||
          low.includes('duyệt') ||
          low.includes('approved') ||
          low.includes('review') ||
          low.includes('chính thức')));
    if (code === 10 && standardAccess) {
      return CSKH_FB_ERROR.MESSENGER_STANDARD_ACCESS;
    }
    if (code === 10 || low.includes('permission') || low.includes('(#200)')) {
      // Thiếu scope thật (vd pages_manage_metadata) — khác Standard Access
      if (
        low.includes('pages_manage_metadata') ||
        low.includes('pages_messaging') && !standardAccess
      ) {
        return CSKH_FB_ERROR.MISSING_SCOPE;
      }
      if (standardAccess) return CSKH_FB_ERROR.MESSENGER_STANDARD_ACCESS;
      return CSKH_FB_ERROR.MISSING_SCOPE;
    }
    return CSKH_FB_ERROR.MESSENGER_SEND_FAILED;
  }

  private buildStatusHints(input: {
    serverConfigured: boolean;
    connectedPageCount: number;
    webhookOk: boolean;
    botActive: boolean;
    tokenHealth: string;
    lastWebhookAt: Date | null;
    lastWebhookError: string | null;
    appWebhookRegistered?: boolean | null;
    visitorAvatarAccess?: 'ok' | 'blocked' | 'unknown' | 'no_data';
  }): string[] {
    const hints: string[] = [];
    if (input.appWebhookRegistered === false) {
      hints.push(
        'Meta App chưa đăng ký callback Webhooks (object=page) — Meta sẽ không gửi tin Messenger. API sẽ tự đăng ký khi restart; nếu fail kiểm tra META_APP_ID/SECRET và verify token.',
      );
    }
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
        'Page Access Token đã hết hạn hoặc thiếu quyền pages_messaging. Kết nối lại Fanpage qua OAuth (Nội dung → Kết nối kênh).',
      );
    }
    if (input.visitorAvatarAccess === 'blocked') {
      hints.push(
        'Ảnh đại diện khách Messenger bị Meta chặn (Graph 100/33). Cần bật Advanced Access cho feature «Business Asset User Profile Access» trong Meta App Review — sau khi duyệt, Hộp thư sẽ tự hiện ảnh thật.',
      );
    }
    if (
      input.lastWebhookError?.includes(CSKH_FB_ERROR.MESSENGER_STANDARD_ACCESS) ||
      input.lastWebhookError === CSKH_FB_ERROR.MESSENGER_STANDARD_ACCESS
    ) {
      hints.push(
        'Meta App đang ở Standard Access cho pages_messaging — chỉ gửi được cho Admin/Developer/Tester. Thêm Tester trong Meta App Roles hoặc xin Advanced Access.',
      );
    }
    if (
      input.lastWebhookError?.includes(CSKH_FB_ERROR.MISSING_SCOPE) ||
      input.lastWebhookError === CSKH_FB_ERROR.MISSING_SCOPE
    ) {
      hints.push(
        'Token thiếu quyền (pages_messaging / pages_manage_metadata). Kết nối lại Facebook OAuth để cấp lại token đủ scope — không sửa DB thủ công.',
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

  /** Token đúng Fanpage — không dùng env token của page khác. */
  private resolvePageAccessToken(fbPage: {
    pageId: string;
    pageAccessTokenEncrypted: string;
  }): string {
    const decoded = this.decodePageToken(fbPage.pageAccessTokenEncrypted);
    if (decoded) return decoded;
    if (this.getEnvPageId() && this.getEnvPageId() === fbPage.pageId) {
      return this.getMessengerPageToken();
    }
    return '';
  }

  /**
   * ROOT: Meta chỉ gửi tin nếu App có Webhooks subscription (object=page + callback_url).
   * Page `subscribed_apps` một mình KHÔNG đủ — Graph GET /{app-id}/subscriptions rỗng
   * → zero POST từ Meta (chỉ smoke test local).
   */
  async ensureAppPageWebhookSubscription(): Promise<{
    ok: boolean;
    callbackUrl: string;
    fields: string;
    existing?: unknown;
    error?: string;
  }> {
    const callbackUrl = this.getWebhookUrl();
    const fields = CSKH_FB_SUBSCRIBED_FIELDS;
    const appId = this.getAppId();
    const appToken = this.getAppAccessToken();
    const verifyToken = this.getVerifyToken();

    if (!appId || !appToken) {
      const error = 'missing_META_APP_ID_or_META_APP_SECRET';
      this.lastWebhookError = `${CSKH_FB_ERROR.WEBHOOK_NOT_SUBSCRIBED}:${error}`;
      this.logger.error(`App webhook subscription skipped: ${error}`);
      return { ok: false, callbackUrl, fields, error };
    }

    try {
      // Inspect existing (no secrets logged)
      const listUrl = new URL(
        `https://graph.facebook.com/${this.graphVersion()}/${appId}/subscriptions`,
      );
      listUrl.searchParams.set('access_token', appToken);
      const listRes = await fetch(listUrl.toString());
      const listBody = (await listRes.json().catch(() => ({}))) as {
        data?: Array<{ object?: string; callback_url?: string; fields?: unknown }>;
        error?: { message?: string };
      };
      const existing = listBody.data ?? [];
      const pageSub = existing.find((s) => s.object === 'page');
      if (pageSub?.callback_url) {
        this.logger.log(
          `App page webhook already registered callback=${pageSub.callback_url} fields=${JSON.stringify(pageSub.fields ?? []).slice(0, 120)}`,
        );
      } else {
        this.logger.warn(
          `App page webhook MISSING (subscriptions=${existing.length}) — registering callback=${callbackUrl}`,
        );
      }

      // Create/update always so callback_url + verify_token + fields stay in sync
      const postUrl = `https://graph.facebook.com/${this.graphVersion()}/${appId}/subscriptions`;
      const form = new URLSearchParams();
      form.set('object', 'page');
      form.set('callback_url', callbackUrl);
      form.set('fields', fields);
      form.set('include_values', 'true');
      form.set('verify_token', verifyToken);
      form.set('access_token', appToken);

      const res = await fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: { message?: string; code?: number; error_subcode?: number; type?: string };
      };

      if (res.ok && data.success !== false && !data.error) {
        this.appWebhookRegistered = true;
        this.appWebhookCallbackUrl = callbackUrl;
        this.logger.log(
          `App page webhook registered callback=${callbackUrl} fields=${fields}`,
        );
        return { ok: true, callbackUrl, fields, existing };
      }

      const errMsg =
        data.error?.message ||
        `graph_subscribe_http_${res.status}`;
      this.appWebhookRegistered = false;
      this.appWebhookCallbackUrl = callbackUrl;
      this.lastWebhookError = `${CSKH_FB_ERROR.WEBHOOK_NOT_SUBSCRIBED}:${errMsg}`.slice(0, 200);
      this.logger.error(
        `App page webhook register FAILED: ${errMsg} (code=${data.error?.code ?? '-'})`,
      );
      return { ok: false, callbackUrl, fields, existing, error: errMsg };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.appWebhookRegistered = false;
      this.lastWebhookError = `${CSKH_FB_ERROR.WEBHOOK_NOT_SUBSCRIBED}:${msg}`.slice(0, 200);
      this.logger.error(`App page webhook register exception: ${msg}`);
      return { ok: false, callbackUrl, fields, error: msg };
    }
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

  async ensureAppAndPageWebhooks(): Promise<{
    appSubscription: Awaited<ReturnType<ChatbotFacebookWebhookService['ensureAppPageWebhookSubscription']>>;
    pages: Awaited<ReturnType<ChatbotFacebookWebhookService['resubscribeAllConnectedPages']>>;
  }> {
    const appSubscription = await this.ensureAppPageWebhookSubscription();
    const pages = await this.resubscribeAllConnectedPages();
    this.logger.log(
      `ensureAppAndPageWebhooks appOk=${appSubscription.ok} pages total=${pages.total} ok=${pages.ok} failed=${pages.failed}`,
    );
    return { appSubscription, pages };
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

      // Meta may put events in messaging[] and/or standby[] (handover protocol)
      const primary = Array.isArray(entry.messaging) ? entry.messaging : [];
      const standby = Array.isArray(
        (entry as { standby?: MetaMessagingEvent[] }).standby,
      )
        ? ((entry as { standby?: MetaMessagingEvent[] }).standby as MetaMessagingEvent[])
        : [];
      const events = [...primary, ...standby];
      if (!events.length) {
        this.logger.debug(`No messaging[]/standby[] for page=••••${pageId.slice(-4)}`);
        continue;
      }

      this.logger.log(
        `Process page=••••${pageId.slice(-4)} org=${fbPage.organizationId.slice(0, 8)}… bot=${fbPage.botId.slice(0, 8)}… events=${events.length}`,
      );

      for (const event of events) {
        await this.handleMessagingEvent(fbPage, event);
      }
    }
  }

  /**
   * Map pageId → ChatbotFacebookPage + bot (mọi Fanpage trong DB).
   * Không hard-code META_PAGE_ID. Prefer status=connected.
   */
  private async resolveFacebookPage(pageId: string): Promise<FacebookPageWithBot | null> {
    const connected = await this.prisma.chatbotFacebookPage.findFirst({
      where: { pageId, status: 'connected' },
      include: { bot: true },
    });
    if (connected) return connected as FacebookPageWithBot;

    // Unique pageId — cho phép bản ghi khác status (vẫn nhận tin; log cảnh báo)
    const any = await this.prisma.chatbotFacebookPage.findUnique({
      where: { pageId },
      include: { bot: true },
    });
    if (any) {
      this.logger.warn(
        `Fanpage pageId=••••${pageId.slice(-4)} status=${any.status} — processing anyway (map exists)`,
      );
      // Auto-heal status so next resolve is clean
      if (any.status !== 'connected') {
        await this.prisma.chatbotFacebookPage
          .update({ where: { id: any.id }, data: { status: 'connected' } })
          .catch(() => undefined);
      }
      return any as FacebookPageWithBot;
    }
    return null;
  }

  /** Re-subscribe Graph subscribed_apps cho mọi Fanpage connected (multi-page). */
  async resubscribeAllConnectedPages(): Promise<{
    total: number;
    ok: number;
    failed: number;
    results: Array<{ pageId: string; ok: boolean; error?: string }>;
  }> {
    const pages = await this.prisma.chatbotFacebookPage.findMany({
      where: { status: 'connected' },
      take: 200,
    });
    const results: Array<{ pageId: string; ok: boolean; error?: string }> = [];
    for (const page of pages) {
      const token = this.decodePageToken(page.pageAccessTokenEncrypted);
      if (!token) {
        results.push({ pageId: page.pageId, ok: false, error: 'missing_token' });
        continue;
      }
      try {
        const ok = await this.subscribePageWebhook(page.pageId, token);
        await this.prisma.chatbotFacebookPage.update({
          where: { id: page.id },
          data: { webhookSubscribed: ok },
        });
        results.push({
          pageId: page.pageId,
          ok,
          error: ok ? undefined : this.lastWebhookError || 'subscribe_failed',
        });
      } catch (err) {
        results.push({
          pageId: page.pageId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.logger.log(
      `resubscribeAllConnectedPages total=${pages.length} ok=${results.filter((r) => r.ok).length} failed=${results.filter((r) => !r.ok).length}`,
    );
    return {
      total: pages.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
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

    // Echo từ Page/Bot: chỉ dedupe/cập nhật mid, không tạo hội thoại khách
    if (event.message?.is_echo) {
      await this.handleEchoOutbound({
        fbPage,
        eventId,
        text: String(event.message?.text || '').trim(),
        recipientPsid: String(event.recipient?.id || '').trim(),
      });
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

    // AI reply only — rate-limit / takeover / inactive bot never drop inbound (already saved)
    const rateKey = `${fbPage.pageId}:${psid}`;
    if (!this.allowReply(rateKey)) {
      this.logger.debug(
        `AI rate-limited page=••••${fbPage.pageId.slice(-4)} sender=${maskExternalId(psid)} (inbound saved)`,
      );
      return;
    }

    if (conversation.humanTakeover) {
      this.logger.log(
        `humanTakeover page=••••${fbPage.pageId.slice(-4)} — inbound saved, AI skipped`,
      );
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
          direction: 'INBOUND',
          senderType: 'CUSTOMER',
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

    if (conversation.linkedLeadId) {
      void this.leads.applyScoringEvent({
        organizationId: fbPage.organizationId,
        leadId: conversation.linkedLeadId,
        eventType: 'CHATBOT_REPLY',
        text: storedText,
        source: 'chatbot_messenger',
      });
    }

    const pageToken = this.resolvePageAccessToken(fbPage);
    // Luôn gọi Graph trên tin mới — cập nhật avatar khi có, không ghi đè tên tốt bằng rỗng
    const profile = pageToken
      ? await this.resolveMessengerProfile(fbPage.pageId, psid, pageToken)
      : null;

    const placeholderName =
      !conversation.visitorName ||
      /^Khách Messenger$/i.test(conversation.visitorName) ||
      /^PSID\b/i.test(conversation.visitorName);

    const cleanPic = profile?.profilePic
      ? this.sanitizeAvatarUrl(profile.profilePic)
      : undefined;

    // Prefetch binary avatar vào disk cache sớm (dù profile_pic field null)
    let binaryPic: { buffer: Buffer; contentType: string; sourceUrl?: string } | null = null;
    if (pageToken) {
      binaryPic = await this.fetchMessengerAvatarBinary(fbPage.pageId, psid, pageToken).catch(
        () => null,
      );
      if (binaryPic) {
        this.materializeVisitorAvatarCache(
          conversation.id,
          binaryPic.buffer,
          binaryPic.contentType,
        );
      }
    }
    const storedPic =
      cleanPic || this.sanitizeAvatarUrl(binaryPic?.sourceUrl) || undefined;

    await this.prisma.chatbotConversation.update({
      where: { id: conversation.id },
      data: {
        lastUserMessageAt: new Date(),
        channel: 'facebook',
        channelRef: fbPage.pageId,
        externalUserId: psid,
        ...(profile?.name
          ? { visitorName: profile.name.slice(0, 190) }
          : placeholderName
            ? { visitorName: `PSID …${psid.slice(-4)}` }
            : {}),
        ...(storedPic ? { visitorAvatarUrl: storedPic.slice(0, 2000) } : {}),
        status:
          conversation.status === ChatbotConversationStatus.CLOSED
            ? ChatbotConversationStatus.OPEN
            : conversation.status,
      },
    });

    if (pageToken) {
      // always refresh page picture (CDN URLs expire → 403 broken img)
      await this.ensurePagePicture(fbPage, pageToken);
    }

    const displayName =
      profile?.name ||
      conversation.visitorName ||
      `PSID …${psid.slice(-4)}`;

    await this.upsertMessengerContact({
      organizationId: fbPage.organizationId,
      pageId: fbPage.pageId,
      psid,
      conversationId: conversation.id,
      displayName,
      avatarUrl: storedPic || null,
    });

    try {
      this.events.broadcastChatbotMessageNew(fbPage.organizationId, {
        conversationId: conversation.id,
        channel: 'facebook',
        channelRef: fbPage.pageId,
        preview: text.slice(0, 120),
        visitorName: displayName,
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

    const refreshed = await this.prisma.chatbotConversation.findUnique({
      where: { id: conversation.id },
    });
    return { conversation: refreshed || conversation, isDuplicate: false as const };
  }

  private async handleEchoOutbound(params: {
    fbPage: FacebookPageWithBot;
    eventId: string;
    text: string;
    recipientPsid: string;
  }) {
    const { fbPage, eventId, text, recipientPsid } = params;
    if (!recipientPsid || !eventId) return;

    const sessionId = `fb:${fbPage.pageId}:${recipientPsid}`.slice(0, 64);
    const conversation = await this.prisma.chatbotConversation.findUnique({
      where: { botId_sessionId: { botId: fbPage.botId, sessionId } },
    });
    if (!conversation) return;

    const existing = await this.prisma.chatbotMessage.findFirst({
      where: {
        conversationId: conversation.id,
        OR: [
          { externalMessageId: eventId.slice(0, 128) },
          ...(text
            ? [
                {
                  role: 'assistant' as const,
                  status: 'SENT',
                  message: text.slice(0, 2000),
                  createdAt: { gte: new Date(Date.now() - 120_000) },
                  externalMessageId: null,
                },
              ]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      if (!existing.externalMessageId) {
        await this.prisma.chatbotMessage
          .update({
            where: { id: existing.id },
            data: {
              externalMessageId: eventId.slice(0, 128),
              status: 'SENT',
              direction: 'OUTBOUND',
              senderType: existing.senderType || 'BOT',
              errorCode: null,
            },
          })
          .catch(() => undefined);
      }
      return;
    }

    if (!text) return;
    try {
      await this.prisma.chatbotMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          message: text.slice(0, 2000),
          status: 'SENT',
          direction: 'OUTBOUND',
          senderType: 'PAGE',
          externalMessageId: eventId.slice(0, 128),
        },
      });
      try {
        this.events.broadcastChatbotMessageNew(fbPage.organizationId, {
          conversationId: conversation.id,
          channel: 'facebook',
          channelRef: fbPage.pageId,
          preview: text.slice(0, 120),
          pageName: fbPage.pageName || undefined,
          botId: fbPage.botId,
        });
      } catch {
        /* ignore */
      }
    } catch (err) {
      if (!(err instanceof Error && /unique|Unique constraint/i.test(err.message))) {
        this.logger.warn(`Echo outbound persist failed: ${(err as Error).message}`.slice(0, 160));
      }
    }
  }

  /**
   * Lấy tên/avatar khách bằng Page Token (không log token).
   * 1) User Profile API (name, first_name, last_name, profile_pic) ± appsecret_proof
   * 2) /{psid}/picture?redirect=false + binary redirect=true
   * 3) picture.width field
   * 4) Fallback: Page conversations participants (name)
   */
  async resolveMessengerProfile(
    pageId: string,
    psid: string,
    pageToken: string,
  ): Promise<{ name?: string; profilePic?: string } | null> {
    let name: string | undefined;
    let profilePic: string | undefined;

    // Thử cả có/không appsecret_proof — một số page token lỗi proof / bắt buộc proof
    const proofVariants: Array<string | undefined> = [this.appSecretProof(pageToken) || undefined, undefined];
    // dedupe empty
    const proofs = [...new Set(proofVariants.map((p) => p || ''))];

    for (const proof of proofs) {
      if (name && profilePic) break;
      try {
        const url = new URL(
          `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(psid)}`,
        );
        url.searchParams.set('fields', 'name,first_name,last_name,profile_pic');
        url.searchParams.set('access_token', pageToken);
        if (proof) url.searchParams.set('appsecret_proof', proof);
        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
        const data = (await res.json().catch(() => ({}))) as {
          name?: string;
          first_name?: string;
          last_name?: string;
          profile_pic?: string;
          error?: { message?: string; code?: number; error_subcode?: number };
        };
        if (res.ok && !data.error) {
          name =
            name ||
            data.name?.trim() ||
            [data.first_name, data.last_name].filter(Boolean).join(' ').trim() ||
            undefined;
          profilePic = profilePic || this.sanitizeAvatarUrl(data.profile_pic);
        } else if (data.error?.message) {
          this.logger.debug(
            `Profile PSID …${psid.slice(-4)} page=••••${pageId.slice(-4)}: ${data.error.message.slice(0, 140)} (code=${data.error.code ?? '?'}/${data.error.error_subcode ?? '-'})`,
          );
        }
      } catch {
        /* next */
      }
    }

    // /picture?redirect=false — CDN URL khi profile_pic field trống / Advanced Access chưa duyệt
    if (!profilePic) {
      for (const proof of proofs) {
        try {
          const url = new URL(
            `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(psid)}/picture`,
          );
          url.searchParams.set('redirect', 'false');
          url.searchParams.set('type', 'large');
          url.searchParams.set('width', '320');
          url.searchParams.set('height', '320');
          url.searchParams.set('access_token', pageToken);
          if (proof) url.searchParams.set('appsecret_proof', proof);
          const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
          const data = (await res.json().catch(() => ({}))) as {
            data?: { url?: string; is_silhouette?: boolean };
            error?: { message?: string };
          };
          if (res.ok && !data.error) {
            const pic = this.sanitizeAvatarUrl(data.data?.url);
            if (pic && !data.data?.is_silhouette) {
              profilePic = pic;
              break;
            }
            if (pic && !profilePic) profilePic = pic;
          }
        } catch {
          /* next */
        }
      }
    }

    // picture field width/height
    if (!profilePic) {
      for (const proof of proofs) {
        try {
          const url = new URL(
            `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(psid)}`,
          );
          url.searchParams.set('fields', 'picture.width(320).height(320)');
          url.searchParams.set('access_token', pageToken);
          if (proof) url.searchParams.set('appsecret_proof', proof);
          const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
          const data = (await res.json().catch(() => ({}))) as {
            picture?: { data?: { url?: string; is_silhouette?: boolean } };
            error?: unknown;
          };
          if (res.ok && !data.error) {
            const pic = this.sanitizeAvatarUrl(data.picture?.data?.url);
            if (pic && !data.picture?.data?.is_silhouette) {
              profilePic = pic;
              break;
            }
            if (pic && !profilePic) profilePic = pic;
          }
        } catch {
          /* next */
        }
      }
    }

    // conversations participants kèm picture (một số app có Advanced Access picture field)
    if (!profilePic) {
      for (const proof of proofs) {
        try {
          const url = new URL(
            `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(pageId)}/conversations`,
          );
          url.searchParams.set('user_id', psid);
          url.searchParams.set(
            'fields',
            'participants{id,name,picture.width(320).height(320)},messages.limit(3){from{id,name,picture.width(320).height(320)}}',
          );
          url.searchParams.set('limit', '3');
          url.searchParams.set('access_token', pageToken);
          if (proof) url.searchParams.set('appsecret_proof', proof);
          const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
          const data = (await res.json().catch(() => ({}))) as {
            data?: Array<{
              participants?: {
                data?: Array<{
                  id?: string;
                  name?: string;
                  picture?: { data?: { url?: string } };
                }>;
              };
              messages?: {
                data?: Array<{
                  from?: {
                    id?: string;
                    name?: string;
                    picture?: { data?: { url?: string } };
                  };
                }>;
              };
            }>;
            error?: unknown;
          };
          if (!res.ok || data.error) continue;
          for (const thread of data.data || []) {
            for (const part of thread.participants?.data || []) {
              // PSID > Number.MAX_SAFE_INTEGER — luôn so sánh dạng string
              if (String(part.id ?? '') !== String(psid)) continue;
              if (part.name?.trim()) name = name || part.name.trim();
              const pic = this.sanitizeAvatarUrl(part.picture?.data?.url);
              if (pic) profilePic = pic;
            }
            for (const msg of thread.messages?.data || []) {
              const from = msg.from;
              if (!from || String(from.id ?? '') !== String(psid)) continue;
              if (from.name?.trim()) name = name || from.name.trim();
              const pic = this.sanitizeAvatarUrl(from.picture?.data?.url);
              if (pic) profilePic = pic;
            }
            if (profilePic) break;
          }
          if (profilePic) break;
        } catch {
          /* next */
        }
      }
    }

    if (!name) {
      try {
        const proof = proofs.find(Boolean) || '';
        const url = new URL(
          `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(pageId)}/conversations`,
        );
        url.searchParams.set('user_id', psid);
        url.searchParams.set('fields', 'participants');
        url.searchParams.set('limit', '5');
        url.searchParams.set('access_token', pageToken);
        if (proof) url.searchParams.set('appsecret_proof', proof);
        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
        const data = (await res.json().catch(() => ({}))) as {
          data?: Array<{ participants?: { data?: Array<{ id?: string; name?: string }> } }>;
          error?: unknown;
        };
        if (res.ok && !data.error) {
          for (const thread of data.data || []) {
            for (const part of thread.participants?.data || []) {
              if (String(part.id ?? '') === String(psid) && part.name?.trim()) {
                name = part.name.trim();
                break;
              }
            }
            if (name) break;
          }
        }
      } catch {
        /* ignore */
      }
    }

    // Legacy: list without user_id filter
    if (!name) {
      try {
        const proof = proofs.find(Boolean) || '';
        const url = new URL(
          `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(pageId)}/conversations`,
        );
        url.searchParams.set('fields', 'participants');
        url.searchParams.set('limit', '30');
        url.searchParams.set('access_token', pageToken);
        if (proof) url.searchParams.set('appsecret_proof', proof);
        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
        const data = (await res.json().catch(() => ({}))) as {
          data?: Array<{ participants?: { data?: Array<{ id?: string; name?: string }> } }>;
          error?: unknown;
        };
        if (res.ok && !data.error) {
          for (const thread of data.data || []) {
            for (const part of thread.participants?.data || []) {
              if (String(part.id ?? '') === String(psid) && part.name?.trim()) {
                name = part.name.trim();
                break;
              }
            }
            if (name) break;
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (!name && !profilePic) return null;
    return { name, profilePic };
  }

  /**
   * Tải bytes ảnh profile (ưu tiên Graph /picture redirect, fallback CDN URL).
   * Dùng cho cache đĩa + public proxy (nginx chỉ proxy /api → Nest, không expose /uploads).
   */
  async fetchMessengerAvatarBinary(
    pageId: string,
    psid: string,
    pageToken: string,
  ): Promise<{ buffer: Buffer; contentType: string; sourceUrl?: string } | null> {
    const proofs = [...new Set([this.appSecretProof(pageToken) || '', ''])];

    // 1) Binary redirect từ Graph
    for (const proof of proofs) {
      try {
        const url = new URL(
          `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(psid)}/picture`,
        );
        url.searchParams.set('type', 'large');
        url.searchParams.set('width', '320');
        url.searchParams.set('height', '320');
        url.searchParams.set('access_token', pageToken);
        if (proof) url.searchParams.set('appsecret_proof', proof);
        const res = await fetch(url.toString(), {
          redirect: 'follow',
          signal: AbortSignal.timeout(15_000),
        });
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (res.ok && ct.startsWith('image/')) {
          const ab = await res.arrayBuffer();
          if (ab.byteLength > 80) {
            return {
              buffer: Buffer.from(ab),
              contentType: ct.split(';')[0] || 'image/jpeg',
              sourceUrl: res.url,
            };
          }
        }
      } catch {
        /* next */
      }
    }

    // 2) Qua JSON URL rồi download
    const profile = await this.resolveMessengerProfile(pageId, psid, pageToken);
    if (!profile?.profilePic) return null;
    try {
      const res = await fetch(profile.profilePic, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
        headers: { 'User-Agent': 'Mozilla/5.0 MarketingAutoAZ-Avatar/1.0' },
      });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok || !ct.startsWith('image/')) return null;
      const ab = await res.arrayBuffer();
      if (ab.byteLength < 80) return null;
      return {
        buffer: Buffer.from(ab),
        contentType: ct.split(';')[0] || 'image/jpeg',
        sourceUrl: profile.profilePic,
      };
    } catch {
      return null;
    }
  }

  private avatarSigningKey(): string {
    return (
      this.config.get<string>('ENCRYPTION_KEY') ||
      this.getAppSecret() ||
      'chatbot-avatar-dev'
    );
  }

  getPublicApiBase(): string {
    return (
      this.config.get<string>('API_URL') ||
      this.config.get<string>('API_PUBLIC_URL') ||
      this.config.get<string>('NEXT_PUBLIC_API_URL') ||
      'http://localhost:4000'
    ).replace(/\/$/, '');
  }

  /**
   * URL avatar cho <img> (không cần Authorization header).
   * Relative /api/… — cùng origin với web (nginx proxy), tránh localhost/API host lệch.
   */
  buildSignedVisitorAvatarUrl(conversationId: string): string {
    const id = String(conversationId || '').trim();
    if (!id) return '';
    const sig = createHmac('sha256', this.avatarSigningKey())
      .update(`visitor-avatar:${id}`)
      .digest('hex');
    return `/api/v1/chatbot-cskh/public/visitor-avatar?c=${encodeURIComponent(id)}&s=${sig}`;
  }

  private verifyVisitorAvatarSig(conversationId: string, sig: string): boolean {
    const expected = createHmac('sha256', this.avatarSigningKey())
      .update(`visitor-avatar:${conversationId}`)
      .digest('hex');
    try {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(String(sig || ''), 'utf8');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  private visitorAvatarCachePath(conversationId: string) {
    const dir = join(process.cwd(), 'uploads', 'chatbot-avatars');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const safe = createHash('sha1').update(conversationId).digest('hex');
    return {
      bin: join(dir, `${safe}.img`),
      meta: join(dir, `${safe}.json`),
    };
  }

  private readAvatarCache(
    conversationId: string,
  ): { buffer: Buffer; contentType: string; isFallback?: boolean } | null {
    try {
      const { bin, meta } = this.visitorAvatarCachePath(conversationId);
      if (!existsSync(bin) || !existsSync(meta)) return null;
      const m = JSON.parse(readFileSync(meta, 'utf8')) as {
        contentType?: string;
        savedAt?: number;
        isFallback?: boolean;
      };
      const maxAge = m.isFallback
        ? 6 * 3600_000 // fallback: retry Graph sooner
        : 7 * 24 * 3600_000;
      if (m.savedAt && Date.now() - m.savedAt > maxAge) return null;
      const buffer = readFileSync(bin);
      if (buffer.length < 40) return null;
      return {
        buffer,
        contentType: m.contentType || 'image/jpeg',
        isFallback: Boolean(m.isFallback),
      };
    } catch {
      return null;
    }
  }

  private writeAvatarCache(
    conversationId: string,
    buffer: Buffer,
    contentType: string,
    opts?: { isFallback?: boolean },
  ) {
    try {
      const { bin, meta } = this.visitorAvatarCachePath(conversationId);
      writeFileSync(bin, buffer);
      writeFileSync(
        meta,
        JSON.stringify({
          contentType,
          savedAt: Date.now(),
          isFallback: Boolean(opts?.isFallback),
        }),
        'utf8',
      );
    } catch (err) {
      this.logger.debug(
        `avatar cache write: ${err instanceof Error ? err.message : String(err)}`.slice(0, 120),
      );
    }
  }

  /** Warm disk cache after Graph binary fetch (avoid second Graph round-trip). */
  materializeVisitorAvatarCache(
    conversationId: string,
    buffer: Buffer,
    contentType: string,
  ) {
    if (!conversationId || !buffer?.length) return;
    this.avatarGraphMissUntil.delete(conversationId);
    this.writeAvatarCache(conversationId, buffer, contentType || 'image/jpeg', {
      isFallback: false,
    });
  }

  /** Neutral silhouette when Meta profile_pic blocked (100/33 / thiếu Business Asset User Profile Access). */
  private buildFallbackAvatarImage(
    seed: string,
    _label?: string | null,
  ): { buffer: Buffer; contentType: string } {
    // Soft tint from seed so list vẫn phân biệt được, nhưng KHÔNG dùng chữ cái.
    const palette = ['#64748B', '#78716C', '#57534E', '#6B7280', '#71717A', '#52525B'];
    let hash = 0;
    const key = String(seed || 'x');
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    const bg = palette[hash % palette.length]!;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="64" fill="${bg}"/>
  <circle cx="64" cy="48" r="22" fill="#E2E8F0"/>
  <path d="M24 112c8-24 24-36 40-36s32 12 40 36" fill="#E2E8F0"/>
</svg>`;
    return { buffer: Buffer.from(svg, 'utf8'), contentType: 'image/svg+xml; charset=utf-8' };
  }

  /** Fast path: only Graph /picture binary (no multi-step profile resolve). */
  private async fetchMessengerAvatarBinaryQuick(
    psid: string,
    pageToken: string,
  ): Promise<{ buffer: Buffer; contentType: string; sourceUrl?: string } | null> {
    const proofs = [...new Set([this.appSecretProof(pageToken) || '', ''])];
    for (const proof of proofs) {
      try {
        const url = new URL(
          `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(psid)}/picture`,
        );
        url.searchParams.set('type', 'large');
        url.searchParams.set('width', '320');
        url.searchParams.set('height', '320');
        url.searchParams.set('access_token', pageToken);
        if (proof) url.searchParams.set('appsecret_proof', proof);
        const res = await fetch(url.toString(), {
          redirect: 'follow',
          signal: AbortSignal.timeout(3_500),
        });
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (res.ok && ct.startsWith('image/')) {
          const ab = await res.arrayBuffer();
          if (ab.byteLength > 80) {
            return {
              buffer: Buffer.from(ab),
              contentType: ct.split(';')[0] || 'image/jpeg',
              sourceUrl: res.url,
            };
          }
        }
      } catch {
        /* next */
      }
    }
    return null;
  }

  private async persistVisitorAvatarUrl(
    organizationId: string,
    conversationId: string,
    externalUserId: string,
    sourceUrl: string,
  ) {
    const clean = this.sanitizeAvatarUrl(sourceUrl);
    if (!clean) return;
    await this.prisma.chatbotConversation
      .update({
        where: { id: conversationId },
        data: { visitorAvatarUrl: clean.slice(0, 2000) },
      })
      .catch(() => undefined);
    await this.prisma.messagingContactIdentity
      .updateMany({
        where: {
          organizationId,
          externalUserId,
          channel: MessageChannel.MESSENGER,
        },
        data: { avatarUrl: clean.slice(0, 2000) },
      })
      .catch(() => undefined);
  }

  private async clearExpiredVisitorAvatarUrl(conversationId: string) {
    await this.prisma.chatbotConversation
      .update({
        where: { id: conversationId },
        data: { visitorAvatarUrl: null },
      })
      .catch(() => undefined);
  }

  /** Background: full Graph resolve + upgrade fallback cache → real photo. */
  private async refreshVisitorAvatarBackground(conversationId: string) {
    const conv = await this.prisma.chatbotConversation.findFirst({
      where: { id: conversationId, channel: 'facebook' },
      select: {
        id: true,
        organizationId: true,
        externalUserId: true,
        channelRef: true,
        visitorName: true,
      },
    });
    if (!conv?.externalUserId || !conv.channelRef) return;
    const page = await this.prisma.chatbotFacebookPage.findFirst({
      where: {
        organizationId: conv.organizationId,
        pageId: conv.channelRef,
        status: 'connected',
      },
    });
    if (!page) return;
    const token = this.decodePageToken(page.pageAccessTokenEncrypted);
    if (!token) return;

    const binary = await this.fetchMessengerAvatarBinary(
      conv.channelRef,
      conv.externalUserId,
      token,
    );
    if (!binary) return;
    this.materializeVisitorAvatarCache(conv.id, binary.buffer, binary.contentType);
    if (binary.sourceUrl) {
      await this.persistVisitorAvatarUrl(
        conv.organizationId,
        conv.id,
        conv.externalUserId,
        binary.sourceUrl,
      );
    }
  }

  /**
   * Public GET image stream for inbox <img src>.
   * Never 404 for valid HMAC + known conversation — fallback SVG when Graph thiếu quyền.
   * Graph miss được cache âm để không làm chậm Hộp thư.
   */
  async serveVisitorAvatar(
    conversationId: string,
    sig: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const id = String(conversationId || '').trim();
    if (!id || !this.verifyVisitorAvatarSig(id, sig)) {
      throw new UnauthorizedException('Invalid avatar signature');
    }

    const cached = this.readAvatarCache(id);
    if (cached && cached.buffer.length > 40) {
      // Real photo: serve immediately. Fallback: still serve, but may refresh in background.
      if (cached.isFallback && Date.now() > (this.avatarGraphMissUntil.get(id) ?? 0)) {
        void this.refreshVisitorAvatarBackground(id).catch(() => undefined);
      }
      return { buffer: cached.buffer, contentType: cached.contentType };
    }

    const conv = await this.prisma.chatbotConversation.findFirst({
      where: { id, channel: 'facebook' },
      select: {
        id: true,
        organizationId: true,
        externalUserId: true,
        channelRef: true,
        visitorAvatarUrl: true,
        visitorName: true,
      },
    });
    if (!conv?.externalUserId || !conv.channelRef) {
      // Website / incomplete row — still return image so UI never blanks
      const fb = this.buildFallbackAvatarImage(id, 'Khách');
      this.writeAvatarCache(id, fb.buffer, fb.contentType, { isFallback: true });
      return fb;
    }

    // Reuse stored CDN if still live; clear DB when expired
    if (conv.visitorAvatarUrl) {
      try {
        const res = await fetch(conv.visitorAvatarUrl, {
          redirect: 'follow',
          signal: AbortSignal.timeout(4_000),
          headers: { 'User-Agent': 'Mozilla/5.0 MarketingAutoAZ-Avatar/1.0' },
        });
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (res.ok && ct.startsWith('image/')) {
          const ab = await res.arrayBuffer();
          if (ab.byteLength > 80) {
            const out = {
              buffer: Buffer.from(ab),
              contentType: ct.split(';')[0] || 'image/jpeg',
            };
            this.materializeVisitorAvatarCache(id, out.buffer, out.contentType);
            return out;
          }
        }
        await this.clearExpiredVisitorAvatarUrl(id);
      } catch {
        await this.clearExpiredVisitorAvatarUrl(id);
      }
    }

    const missUntil = this.avatarGraphMissUntil.get(id) ?? 0;
    const skipGraph = Date.now() < missUntil;

    if (!skipGraph) {
      const page = await this.prisma.chatbotFacebookPage.findFirst({
        where: {
          organizationId: conv.organizationId,
          pageId: conv.channelRef,
          status: 'connected',
        },
      });
      const token = page
        ? this.decodePageToken(page.pageAccessTokenEncrypted)
        : null;

      if (token) {
        // Fast Graph attempt only — full resolve runs in background if miss
        const quick = await this.fetchMessengerAvatarBinaryQuick(
          conv.externalUserId,
          token,
        );
        if (quick) {
          this.materializeVisitorAvatarCache(id, quick.buffer, quick.contentType);
          if (quick.sourceUrl) {
            void this.persistVisitorAvatarUrl(
              conv.organizationId,
              id,
              conv.externalUserId,
              quick.sourceUrl,
            );
          }
          return { buffer: quick.buffer, contentType: quick.contentType };
        }
      }

      this.avatarGraphMissUntil.set(id, Date.now() + this.avatarGraphMissTtlMs);
      this.logger.debug(
        `Avatar Graph miss conversation=${id.slice(0, 8)}… psid=…${conv.externalUserId.slice(-4)} — serving fallback`,
      );
      void this.refreshVisitorAvatarBackground(id).catch(() => undefined);
    }

    const fallback = this.buildFallbackAvatarImage(
      conv.externalUserId || id,
      conv.visitorName,
    );
    this.writeAvatarCache(id, fallback.buffer, fallback.contentType, {
      isFallback: true,
    });
    return fallback;
  }

  /** HMAC appsecret_proof — một số app bắt buộc khi gọi User Profile/PSID. */
  private appSecretProof(accessToken: string): string {
    const secret = this.getAppSecret();
    if (!secret || !accessToken) return '';
    return createHmac('sha256', secret).update(accessToken).digest('hex');
  }

  sanitizeAvatarUrl(raw?: string | null): string | undefined {
    const s = String(raw || '').trim();
    if (!s || s === 'null' || s === 'undefined' || s === '""') return undefined;
    if (s.length > 2000) return undefined;
    try {
      const u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
      return s.slice(0, 2000);
    } catch {
      return undefined;
    }
  }

  /**
   * Lấy URL ảnh Fanpage tươi từ Graph (CDN Meta hết hạn nhanh → stored URL 403).
   */
  async resolvePagePictureUrl(pageId: string, pageToken: string): Promise<string | undefined> {
    const proof = this.appSecretProof(pageToken);
    try {
      const url = new URL(
        `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(pageId)}`,
      );
      url.searchParams.set('fields', 'picture.width(200).height(200)');
      url.searchParams.set('access_token', pageToken);
      if (proof) url.searchParams.set('appsecret_proof', proof);
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => ({}))) as {
        picture?: { data?: { url?: string } };
        error?: unknown;
      };
      if (!res.ok || data.error) return undefined;
      return this.sanitizeAvatarUrl(data.picture?.data?.url);
    } catch {
      return undefined;
    }
  }

  private async ensurePagePicture(fbPage: FacebookPageWithBot, pageToken: string) {
    // Luôn làm tươi khi thiếu hoặc lưu CDN cũ (fbcdn 403 sau vài giờ)
    try {
      const pic = await this.resolvePagePictureUrl(fbPage.pageId, pageToken);
      if (!pic) return;
      if (fbPage.pagePictureUrl === pic) return;
      await this.prisma.chatbotFacebookPage.update({
        where: { id: fbPage.id },
        data: { pagePictureUrl: pic.slice(0, 2000) },
      });
      fbPage.pagePictureUrl = pic;
    } catch {
      /* ignore */
    }
  }

  private async upsertMessengerContact(params: {
    organizationId: string;
    pageId: string;
    psid: string;
    conversationId: string;
    displayName: string;
    avatarUrl?: string | null;
  }) {
    // Canonical: messenger:{pageId}. Legacy chatbot từng ghi messenger_page:{pageId}.
    const scopeKey = `messenger:${params.pageId}`.slice(0, 191);
    const legacyScope = `messenger_page:${params.pageId}`.slice(0, 191);
    try {
      const existing = await this.prisma.messagingContactIdentity.findFirst({
        where: {
          organizationId: params.organizationId,
          externalUserId: params.psid,
          integrationScopeKey: { in: [scopeKey, legacyScope] },
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (existing) {
        await this.prisma.messagingContactIdentity.update({
          where: { id: existing.id },
          data: {
            integrationScopeKey: scopeKey,
            chatbotConversationId: params.conversationId,
            lastInboundAt: new Date(),
            displayName: params.displayName,
            ...(params.avatarUrl ? { avatarUrl: params.avatarUrl } : {}),
          },
        });
        return;
      }

      await this.prisma.messagingContactIdentity.create({
        data: {
          organizationId: params.organizationId,
          channel: MessageChannel.MESSENGER,
          integrationScopeKey: scopeKey,
          externalUserId: params.psid,
          displayName: params.displayName,
          avatarUrl: params.avatarUrl || undefined,
          chatbotConversationId: params.conversationId,
          lastInboundAt: new Date(),
          metadata: { pageId: params.pageId, source: 'chatbot_cskh' },
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
    const pageToken = this.resolvePageAccessToken(fbPage);

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

    const creditCost = await this.credit.getFeatureCost(CREDIT_FEATURE_CODES.CHATBOT_REPLY);
    const creditOk = await this.credit.checkAvailable(fbPage.organizationId, creditCost);
    if (!creditOk) {
      await this.sendText(fbPage.pageId, pageToken, psid, INSUFFICIENT_AI_CREDIT_MESSAGE);
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
        direction: 'OUTBOUND',
        senderType: 'BOT',
      },
    });

    const [sources, history, settings, ragChunks] = await Promise.all([
      this.prisma.chatbotKnowledgeSource.findMany({
        where: { botId: fbPage.botId, status: { in: ['active', 'ready'] } },
      }),
      this.prisma.chatbotMessage.findMany({
        where: { conversationId, id: { not: processingMsg.id } },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
      this.chatbot.getSettings(fbPage.organizationId),
      this.ragKb
        .searchForChatContext(fbPage.organizationId, text, {
          limit: 5,
          minScore: 1,
          botId: fbPage.botId,
          pageName: fbPage.pageName || undefined,
        })
        .catch((err) => {
          this.logger.warn(`RAG KB search failed: ${(err as Error).message}`);
          return [] as Awaited<ReturnType<RagKbService['searchForChatContext']>>;
        }),
    ]);

    const kbHitSummary = ragChunks
      .slice(0, 5)
      .map((h) => `${h.score.toFixed(1)}:${h.title.slice(0, 40)}`)
      .join(' | ');
    const contextPreview = ragChunks
      .slice(0, 2)
      .map((h) => h.content.replace(/\s+/g, ' ').slice(0, 120))
      .join(' || ');
    this.logger.log(
      `KB query org=${fbPage.organizationId.slice(0, 8)} page=••••${fbPage.pageId.slice(-4)} ` +
        `q="${text.slice(0, 80)}" hits=${ragChunks.length} scores=[${kbHitSummary}] ` +
        `ctx="${contextPreview.slice(0, 200)}"`,
    );

    const openAiChat = this.openAi.isConfigured()
      ? async (input: {
          model: string;
          systemPrompt: string;
          history: Array<{ role: string; content: string }>;
          userText: string;
          temperature: number;
        }) =>
          this.credit.runPaidFeature({
            organizationId: fbPage.organizationId,
            featureCode: CREDIT_FEATURE_CODES.CHATBOT_REPLY,
            referenceId: `chatbot.reply:${conversationId}:${processingMsg.id}`,
            reason: 'chatbot messenger LLM',
            fn: async (ctx) => {
              ctx.markProviderStarted();
              return this.openAi.chatCompletion({
                model: input.model,
                temperature: input.temperature,
                maxTokens: 500,
                timeoutMs: 12_000,
                messages: [
                  { role: 'system', content: input.systemPrompt },
                  ...input.history.slice(-8),
                  { role: 'user', content: input.userText },
                ],
              });
            },
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
        ragChunks,
        channel: {
          pageId: fbPage.pageId,
          pageName: fbPage.pageName || undefined,
          channel: 'messenger',
        },
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

    this.logger.log(
      `KB AI reply org=${fbPage.organizationId.slice(0, 8)} page=••••${fbPage.pageId.slice(-4)} ` +
        `hits=${ragChunks.length} usedAi=${aiResult.usedAi} noData=${aiResult.noData} ` +
        `blocked=${aiResult.blockedCode || '-'} reply="${aiResult.reply.slice(0, 160).replace(/\s+/g, ' ')}"`,
    );

    if (aiResult.blockedCode === 'ai_error' || aiResult.blockedCode === CSKH_FB_ERROR.OPENAI_ERROR) {
      this.lastWebhookError =
        this.lastWebhookError || `${CSKH_FB_ERROR.OPENAI_ERROR}:fallback`;
    }

    if (aiResult.showLead || aiResult.noData) {
      await this.markNeedsStaff(conversationId);
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
          role: 'system',
          senderType: 'SYSTEM',
          message: 'Bot tạm dừng — nhân viên đang tiếp quản. (Chưa gửi Messenger)',
          status: 'FAILED',
          errorCode: CSKH_FB_ERROR.HUMAN_TAKEOVER,
        },
      });
      return;
    }

    const sendResult = await this.sendText(fbPage.pageId, pageToken, psid, aiResult.reply);
    const sent = sendResult.ok;

    if (!sent) {
      const keep =
        this.lastWebhookError === CSKH_FB_ERROR.TOKEN_EXPIRED ||
        this.lastWebhookError === CSKH_FB_ERROR.MISSING_SCOPE ||
        this.lastWebhookError === CSKH_FB_ERROR.MESSENGER_STANDARD_ACCESS ||
        this.lastWebhookError?.startsWith(CSKH_FB_ERROR.TOKEN_EXPIRED) ||
        this.lastWebhookError?.startsWith(CSKH_FB_ERROR.MISSING_SCOPE) ||
        this.lastWebhookError?.startsWith(CSKH_FB_ERROR.MESSENGER_STANDARD_ACCESS);
      if (!keep) {
        this.lastWebhookError = CSKH_FB_ERROR.MESSENGER_SEND_FAILED;
      }
      const errCode =
        this.classifyErrorCode(this.lastWebhookError) || CSKH_FB_ERROR.MESSENGER_SEND_FAILED;
      const failMsg = [
        'Không gửi được Messenger',
        sendResult.httpStatus != null ? `http=${sendResult.httpStatus}` : null,
        sendResult.code != null ? `code=${sendResult.code}` : null,
        sendResult.subcode != null ? `subcode=${sendResult.subcode}` : null,
        errCode,
        sendResult.errorMessage ? sendResult.errorMessage.slice(0, 180) : null,
      ]
        .filter(Boolean)
        .join(' · ');
      this.logger.error(
        `Messenger OUTBOUND NOT DELIVERED page=••••${fbPage.pageId.slice(-4)} ` +
          `psid=…${psid.slice(-4)} status=${sendResult.httpStatus ?? '-'} ` +
          `code=${sendResult.code ?? '-'} subcode=${sendResult.subcode ?? '-'} ` +
          `err=${errCode} msg="${(sendResult.errorMessage || '').slice(0, 160)}" ` +
          `fbtrace=${sendResult.fbtraceId || '-'}`,
      );
      // Không lưu nội dung AI như tin Bot (tránh UI giả «đã gửi»)
      await this.prisma.chatbotMessage.update({
        where: { id: processingMsg.id },
        data: {
          role: 'system',
          senderType: 'SYSTEM',
          message: failMsg.slice(0, 2000),
          status: 'FAILED',
          direction: 'OUTBOUND',
          errorCode: errCode,
          externalMessageId: null,
        },
      });
      await this.markNeedsStaff(conversationId);
      return;
    }

    // Chỉ sau khi Graph OK mới lưu tin Bot + usage + realtime
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

    await this.prisma.chatbotMessage.update({
      where: { id: processingMsg.id },
      data: {
        message: aiResult.reply.slice(0, 2000),
        status: 'SENT',
        direction: 'OUTBOUND',
        senderType: 'BOT',
        role: 'assistant',
        externalMessageId: sendResult.messageId
          ? sendResult.messageId.slice(0, 128)
          : undefined,
        errorCode: null,
      },
    });

    this.logger.log(
      `Messenger OUTBOUND SENT page=••••${fbPage.pageId.slice(-4)} psid=…${psid.slice(-4)} ` +
        `mid=${(sendResult.messageId || '').slice(0, 32)}`,
    );

    try {
      this.events.broadcastChatbotMessageNew(fbPage.organizationId, {
        conversationId,
        channel: 'facebook',
        channelRef: fbPage.pageId,
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
        visitorName: `PSID …${psid.slice(-4)}`,
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

  /**
   * Gửi text qua Graph Send API — endpoint theo pageId (không dùng /me để tránh lệch page).
   * Chỉ trả ok=true khi có message_id từ Meta.
   * Ngoài 24h window (subcode 2018278) → thử lại MESSAGE_TAG HUMAN_AGENT (cửa sổ 7 ngày).
   */
  async sendText(
    pageId: string,
    pageToken: string,
    psid: string,
    text: string,
  ): Promise<{
    ok: boolean;
    messageId?: string;
    httpStatus?: number;
    code?: number;
    subcode?: number;
    errorMessage?: string;
    fbtraceId?: string;
  }> {
    if (!pageToken) {
      this.lastWebhookError = CSKH_FB_ERROR.MISSING_PAGE_TOKEN;
      this.logger.error(
        `Messenger send SKIPPED page=••••${pageId.slice(-4)} psid=…${psid.slice(-4)} reason=missing_page_token`,
      );
      return { ok: false, errorMessage: 'missing_page_token' };
    }
    if (!psid || !/^\d{5,}$/.test(psid)) {
      this.lastWebhookError = CSKH_FB_ERROR.MESSENGER_SEND_FAILED;
      this.logger.error(
        `Messenger send SKIPPED page=••••${pageId.slice(-4)} reason=invalid_psid`,
      );
      return { ok: false, errorMessage: 'invalid_psid' };
    }

    const payloadText = String(text || '').slice(0, 2000);
    const first = await this.postMessengerSend(pageId, pageToken, psid, {
      recipient: { id: psid },
      messaging_type: 'RESPONSE',
      message: { text: payloadText },
    });
    if (first.ok) return first;

    // Ngoài cửa sổ 24h — Meta cho phép HUMAN_AGENT trong ~7 ngày sau tin khách
    const outsideWindow =
      first.subcode === 2018278 ||
      /ngoài khoảng thời gian|outside.*allowed|outside.*window/i.test(
        first.errorMessage || '',
      );
    if (outsideWindow) {
      this.logger.warn(
        `Messenger RESPONSE outside window page=••••${pageId.slice(-4)} psid=…${psid.slice(-4)} — retry HUMAN_AGENT`,
      );
      const retry = await this.postMessengerSend(pageId, pageToken, psid, {
        recipient: { id: psid },
        messaging_type: 'MESSAGE_TAG',
        tag: 'HUMAN_AGENT',
        message: { text: payloadText },
      });
      if (retry.ok) return retry;
      return retry;
    }

    return first;
  }

  private async postMessengerSend(
    pageId: string,
    pageToken: string,
    psid: string,
    body: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    messageId?: string;
    httpStatus?: number;
    code?: number;
    subcode?: number;
    errorMessage?: string;
    fbtraceId?: string;
  }> {
    try {
      const url = `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(pageId)}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pageToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message_id?: string;
        recipient_id?: string;
        error?: {
          message?: string;
          code?: number;
          error_subcode?: number;
          type?: string;
          fbtrace_id?: string;
        };
      };

      if (!res.ok || data.error || !data.message_id) {
        const code = data.error?.code;
        const subcode = data.error?.error_subcode;
        const errorMessage = data.error?.message || `http_${res.status}_no_message_id`;
        const fbtraceId = data.error?.fbtrace_id;
        this.logger.error(
          `Messenger send FAIL page=••••${pageId.slice(-4)} psid=…${psid.slice(-4)} ` +
            `http=${res.status} code=${code ?? '-'} subcode=${subcode ?? '-'} ` +
            `msg="${errorMessage.slice(0, 200)}" fbtrace=${fbtraceId || '-'}`,
        );
        this.lastWebhookError = this.classifyMessengerSendFailure(
          JSON.stringify({ error: data.error || { message: errorMessage, code } }),
        );
        return {
          ok: false,
          httpStatus: res.status,
          code,
          subcode,
          errorMessage,
          fbtraceId,
        };
      }

      this.logger.log(
        `Messenger send OK page=••••${pageId.slice(-4)} psid=…${psid.slice(-4)} mid=${data.message_id.slice(0, 32)}`,
      );
      return { ok: true, messageId: data.message_id, httpStatus: res.status };
    } catch (err) {
      const errorMessage = (err as Error).message;
      this.logger.error(
        `Messenger send EXCEPTION page=••••${pageId.slice(-4)} psid=…${psid.slice(-4)} msg="${errorMessage}"`,
      );
      this.lastWebhookError = CSKH_FB_ERROR.MESSENGER_SEND_FAILED;
      return { ok: false, errorMessage };
    }
  }
}
