import { createHash } from 'crypto';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { MessageChannel, MessagingProviderKind } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import { MESSAGING_WEBHOOK_QUEUE } from '../queue/queue.constants';
import { ChannelConnectionsService } from './channel-connections.service';
import { MessagingProviderRegistry } from './providers/messaging-provider.registry';

export type MessagingWebhookJobData = {
  organizationId: string;
  channel: MessageChannel;
  providerKind: MessagingProviderKind;
  connectionId: string;
  accountRef: string;
  payload: unknown;
};

@Injectable()
export class MessagingWebhookIngressService {
  private readonly logger = new Logger(MessagingWebhookIngressService.name);
  private chatbotPageHandler: ((payload: unknown) => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly channelConnections: ChannelConnectionsService,
    private readonly providers: MessagingProviderRegistry,
    private readonly queueEnqueue: QueueEnqueueService,
    @Inject(MESSAGING_WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  /** Chatbot CSKH đăng ký để nhận chung payload Messenger (tránh miss khi Meta gọi URL messaging). */
  registerChatbotPageHandler(handler: (payload: unknown) => void) {
    this.chatbotPageHandler = handler;
  }

  verifyMessengerChallenge(mode?: string, token?: string, challenge?: string): string {
    const expected = this.config.get<string>('CSKH_FB_WEBHOOK_VERIFY_TOKEN') ?? '';
    if (mode === 'subscribe' && token === expected && challenge) {
      return challenge;
    }
    return 'Forbidden';
  }

  /**
   * Fail-closed: khi META_APP_SECRET đã cấu hình, bắt buộc X-Hub-Signature-256 hợp lệ.
   * Không log secret / raw signature đầy đủ.
   */
  assertMessengerSignature(rawBody: Buffer, signature?: string): void {
    const appSecret =
      this.config.get<string>('META_APP_SECRET') ??
      this.config.get<string>('FACEBOOK_APP_SECRET') ??
      '';
    if (!appSecret) return;

    const provider = this.providers.get(MessagingProviderKind.MESSENGER);
    if (
      !signature ||
      !provider.verifyWebhookSignature ||
      !provider.verifyWebhookSignature(rawBody, signature, appSecret)
    ) {
      this.logger.warn(
        `Messenger webhook signature rejected (sig=${signature ? 'present' : 'missing'})`,
      );
      throw new UnauthorizedException('Invalid Meta webhook signature');
    }
  }

  /**
   * Trả response nhanh — xử lý nặng qua queue (messaging) + optional chatbot handler.
   * @param opts.skipSignatureAssert — khi caller đã verify (chatbot controller)
   * @param opts.skipChatbotHandler — caller đã gọi processPayload trực tiếp
   */
  async ingestMessenger(
    rawBody: Buffer,
    payload: unknown,
    signature?: string,
    opts?: { skipSignatureAssert?: boolean; skipChatbotHandler?: boolean },
  ): Promise<void> {
    if (!opts?.skipSignatureAssert) {
      this.assertMessengerSignature(rawBody, signature);
    }

    if (!opts?.skipChatbotHandler) {
      try {
        this.chatbotPageHandler?.(payload);
      } catch (err) {
        this.logger.warn(`Chatbot page handler: ${(err as Error).message}`);
      }
    }

    const body = payload as {
      entry?: Array<{ id?: string; messaging?: unknown[] }>;
    };
    const entries = Array.isArray(body.entry) ? body.entry : [];
    if (!entries.length) return;

    // Multi-page: process mỗi Fanpage entry (không hard-code entry[0])
    for (const entry of entries) {
      const pageId = String(entry?.id || '').trim();
      if (!pageId) continue;

      const connection = await this.channelConnections.findByAccountRef(
        MessageChannel.MESSENGER,
        pageId,
      );
      if (!connection || connection.isPaused) {
        this.logger.debug(
          `Messaging skip page=••••${pageId.slice(-4)} (no connection or paused)`,
        );
        continue;
      }

      const provider = this.providers.get(MessagingProviderKind.MESSENGER);
      let events = provider.normalizeWebhook(payload, pageId);
      // Scope events to this page when provider returns empty (fallback is global)
      if (!events.length) {
        const pageMids = this.extractMessagingMids(
          entry as {
            messaging?: Array<{
              message?: { mid?: string };
              timestamp?: number;
              sender?: { id?: string };
            }>;
          },
        );
        events = pageMids.length
          ? pageMids.map((mid) => ({ rawEventKey: mid }))
          : [{ rawEventKey: this.fallbackEventKey(connection, entry) }];
      }

      await this.enqueueEvents(connection, events, { entry, pageId, root: payload });
    }
  }

  private extractMessagingMids(entry: {
    messaging?: Array<{ message?: { mid?: string }; timestamp?: number; sender?: { id?: string } }>;
  }): string[] {
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    const keys: string[] = [];
    for (const ev of messaging) {
      const mid = String(ev?.message?.mid || '').trim();
      if (mid) {
        keys.push(mid);
        continue;
      }
      const sid = String(ev?.sender?.id || '').slice(-8);
      const ts = String(ev?.timestamp || Date.now());
      if (sid) keys.push(`ts:${ts}:${sid}`);
    }
    return keys;
  }

  async ingestZalo(rawBody: Buffer, payload: unknown, signature?: string): Promise<void> {
    const body = payload as { oa_id?: string };
    const oaId = body.oa_id;
    if (!oaId) return;

    const connection = await this.channelConnections.findByAccountRef(MessageChannel.ZALO, oaId);
    if (!connection || connection.isPaused) return;

    const credentials = this.channelConnections.decryptCredentials(connection.encryptedCredentials);
    const secret = credentials.webhookSecret ?? '';
    const provider = this.providers.get(MessagingProviderKind.ZALO_OA);
    // Fail-closed when webhook secret is configured: missing/invalid signature → drop
    if (secret) {
      if (
        !signature ||
        !provider.verifyWebhookSignature ||
        !provider.verifyWebhookSignature(rawBody, signature, secret)
      ) {
        this.logger.warn(`Zalo webhook signature rejected oa=${oaId}`);
        return;
      }
    }

    const events = provider.normalizeWebhook(payload, oaId);
    await this.enqueueEvents(connection, events, payload);
  }

  private async enqueueEvents(
    connection: {
      id: string;
      organizationId: string;
      channel: MessageChannel;
      providerKind: MessagingProviderKind;
      accountRef: string;
    },
    events: Array<{ rawEventKey: string }>,
    payload: unknown,
  ) {
    if (!events.length) {
      events = [{ rawEventKey: this.fallbackEventKey(connection, payload) }];
    }

    for (const event of events) {
      const eventKey = event.rawEventKey;
      try {
        await this.prisma.messagingWebhookEvent.create({
          data: {
            organizationId: connection.organizationId,
            channel: connection.channel,
            eventKey,
          },
        });
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') {
          continue;
        }
        throw err;
      }

      const jobData: MessagingWebhookJobData = {
        organizationId: connection.organizationId,
        channel: connection.channel,
        providerKind: connection.providerKind,
        connectionId: connection.id,
        accountRef: connection.accountRef,
        payload,
      };

      await this.queueEnqueue.add(
        this.webhookQueue,
        'process-webhook',
        jobData,
        {
          // BullMQ custom jobId must not contain ":"
          jobId: this.safeJobId(`${connection.channel}_${connection.accountRef}_${eventKey}`),
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    }
  }

  /** BullMQ rejects jobId with ":" — normalize to safe alnum/underscore/hyphen. */
  private safeJobId(raw: string): string {
    return raw
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 120);
  }

  private fallbackEventKey(
    connection: { channel: MessageChannel; accountRef: string },
    payload: unknown,
  ) {
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
    return `${connection.channel}_${connection.accountRef}_${hash}`;
  }
}
