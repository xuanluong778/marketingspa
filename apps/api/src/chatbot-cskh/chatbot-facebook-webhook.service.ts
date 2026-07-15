import {
  Inject,
  Injectable,
  Logger,
  forwardRef,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatbotBot,
  ChatbotBotStatus,
  ChatbotConversationStatus,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import { ChatbotCskhService } from './chatbot-cskh.service';
import { generateAiReply } from './utils/chatbot-ai.util';
import {
  CREDIT_EXHAUSTED_MESSAGE,
  NO_DATA_REPLY,
} from './utils/chatbot-constants';

type MetaMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
  };
  postback?: { payload?: string; title?: string };
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
  bot: ChatbotBot;
};

@Injectable()
export class ChatbotFacebookWebhookService {
  private readonly logger = new Logger(ChatbotFacebookWebhookService.name);
  private readonly lastReplyAt = new Map<string, number>();
  private readonly minReplyIntervalMs = 3000;
  private readonly messagingWindowMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatbotCskhService))
    private readonly chatbot: ChatbotCskhService,
    private readonly openAi: OpenAiService,
    private readonly config: ConfigService,
  ) {}

  getVerifyToken(): string {
    return (
      this.config.get<string>('CSKH_FB_WEBHOOK_VERIFY_TOKEN') ||
      this.config.get<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN') ||
      'marketingspa_cskh_fb'
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

  private graphVersion(): string {
    return (
      this.config.get<string>('META_API_VERSION') ||
      this.config.get<string>('META_GRAPH_VERSION') ||
      'v21.0'
    ).replace(/^\//, '');
  }

  verifyChallenge(mode?: string, token?: string, challenge?: string): string {
    if (mode === 'subscribe' && token === this.getVerifyToken() && challenge) {
      return challenge;
    }
    throw new ForbiddenException('Webhook verify failed');
  }

  /**
   * Chatbot chỉ dùng Page Access Token — không bắt buộc META_APP_ID/SECRET.
   * Signature Meta App bỏ qua (MVP token-only).
   */
  verifySignature(_rawBody?: Buffer, _signatureHeader?: string): boolean {
    return true;
  }

  decodePageToken(encrypted: string): string {
    try {
      return Buffer.from(encrypted, 'base64').toString('utf8').trim();
    } catch {
      return '';
    }
  }

  async subscribePageWebhook(pageId: string, pageAccessToken: string): Promise<boolean> {
    try {
      const url = new URL(
        `https://graph.facebook.com/${this.graphVersion()}/${pageId}/subscribed_apps`,
      );
      url.searchParams.set('access_token', pageAccessToken);
      url.searchParams.set('subscribed_fields', 'messages,messaging_postbacks');

      const res = await fetch(url.toString(), { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean };
      const ok = res.ok && Boolean(data.success);
      if (!ok) {
        this.logger.warn(`Subscribe webhook failed page=${pageId}: ${JSON.stringify(data).slice(0, 200)}`);
      }
      return ok;
    } catch (err) {
      this.logger.warn(`Subscribe webhook exception page=${pageId}: ${(err as Error).message}`);
      return false;
    }
  }

  /** Fire-and-forget entry — always acknowledge Meta quickly from controller. */
  processPayloadAsync(payload: MetaWebhookPayload): void {
    void this.processPayload(payload).catch((err) => {
      this.logger.error(`Messenger webhook failed: ${(err as Error).message}`);
    });
  }

  async processPayload(payload: MetaWebhookPayload): Promise<void> {
    if (payload.object && payload.object !== 'page') return;
    const entries = Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      const pageId = String(entry?.id || '').trim();
      if (!pageId) continue;

      const fbPage = await this.prisma.chatbotFacebookPage.findFirst({
        where: { pageId, status: 'connected' },
        include: { bot: true },
      });
      if (!fbPage || fbPage.bot.status !== ChatbotBotStatus.ACTIVE) continue;

      const events = Array.isArray(entry.messaging) ? entry.messaging : [];
      for (const event of events) {
        await this.handleMessagingEvent(fbPage, event);
      }
    }
  }

  private async handleMessagingEvent(
    fbPage: FacebookPageWithBot,
    event: MetaMessagingEvent,
  ) {
    const psid = String(event.sender?.id || '').trim();
    if (!psid) return;

    const text =
      String(event.message?.text || '').trim() ||
      String(event.postback?.title || event.postback?.payload || '').trim();
    if (!text) return;
    if (event.message?.is_echo) return;

    const rateKey = `${fbPage.pageId}:${psid}`;
    if (!this.allowReply(rateKey)) {
      this.logger.debug(`Rate limited FB reply ${rateKey}`);
      return;
    }

    const sessionId = `fb:${fbPage.pageId}:${psid}`.slice(0, 64);
    const conversation = await this.getOrCreateFbConversation(
      fbPage.organizationId,
      fbPage.botId,
      sessionId,
      psid,
      fbPage.pageName || fbPage.pageId,
    );

    await this.prisma.chatbotMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        message: text.slice(0, 2000),
      },
    });

    await this.prisma.chatbotConversation.update({
      where: { id: conversation.id },
      data: { lastUserMessageAt: new Date() },
    });

    if (!fbPage.aiEnabled) {
      await this.markNeedsStaff(conversation.id);
      return;
    }

    const usage = await this.chatbot.getUsageSnapshot(fbPage.organizationId);
    const pageToken = this.decodePageToken(fbPage.pageAccessTokenEncrypted);

    if (!usage.allowed) {
      await this.sendText(fbPage.pageId, pageToken, psid, CREDIT_EXHAUSTED_MESSAGE);
      await this.markNeedsStaff(conversation.id);
      return;
    }

    if (!this.withinMessagingWindow(conversation.lastUserMessageAt ?? conversation.updatedAt)) {
      await this.markNeedsStaff(conversation.id);
      return;
    }

    const [sources, history, settings] = await Promise.all([
      this.prisma.chatbotKnowledgeSource.findMany({
        where: { botId: fbPage.botId, status: { in: ['active', 'ready'] } },
      }),
      this.prisma.chatbotMessage.findMany({
        where: { conversationId: conversation.id },
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
            messages: [
              { role: 'system', content: input.systemPrompt },
              ...input.history.slice(-8),
              { role: 'user', content: input.userText },
            ],
          })
      : undefined;

    let aiResult: { reply: string; usedAi: boolean; showLead: boolean; noData: boolean };
    try {
      aiResult = await generateAiReply({
        bot: fbPage.bot,
        userText: text,
        sources,
        history,
        settings,
        usageAllowed: usage.allowed,
        openAiChat,
      });
    } catch (err) {
      this.logger.warn(`FB AI error: ${(err as Error).message}`);
      aiResult = { reply: NO_DATA_REPLY, usedAi: false, showLead: true, noData: true };
    }

    if (aiResult.showLead || aiResult.noData) {
      await this.markNeedsStaff(conversation.id);
    }

    await this.prisma.chatbotMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        message: aiResult.reply.slice(0, 2000),
      },
    });

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

    if (pageToken) {
      await this.sendText(fbPage.pageId, pageToken, psid, aiResult.reply);
    }
  }

  private async getOrCreateFbConversation(
    organizationId: string,
    botId: string,
    sessionId: string,
    psid: string,
    channelRef: string,
  ) {
    const existing = await this.prisma.chatbotConversation.findUnique({
      where: { botId_sessionId: { botId, sessionId } },
    });
    if (existing) {
      return this.prisma.chatbotConversation.update({
        where: { id: existing.id },
        data: {
          externalUserId: psid,
          channelRef: channelRef.slice(0, 128),
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
        channelRef: channelRef.slice(0, 128),
        status: ChatbotConversationStatus.OPEN,
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
          message: { text: String(text || '').slice(0, 2000) },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Send FB message failed page=${pageId}: ${body.slice(0, 300)}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Send FB message exception page=${pageId}: ${(err as Error).message}`);
      return false;
    }
  }
}
