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

  /** Trả response nhanh — xử lý nặng qua queue */
  async ingestMessenger(rawBody: Buffer, payload: unknown, signature?: string): Promise<void> {
    this.assertMessengerSignature(rawBody, signature);

    try {
      this.chatbotPageHandler?.(payload);
    } catch (err) {
      this.logger.warn(`Chatbot page handler: ${(err as Error).message}`);
    }

    const body = payload as { entry?: Array<{ id?: string }> };
    const pageId = body.entry?.[0]?.id;
    if (!pageId) return;

    const connection = await this.channelConnections.findByAccountRef(
      MessageChannel.MESSENGER,
      pageId,
    );
    if (!connection || connection.isPaused) return;

    const provider = this.providers.get(MessagingProviderKind.MESSENGER);
    const events = provider.normalizeWebhook(payload, pageId);
    await this.enqueueEvents(connection, events, payload);
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
          jobId: `${connection.channel}:${eventKey}`.slice(0, 120),
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    }
  }

  private fallbackEventKey(
    connection: { channel: MessageChannel; accountRef: string },
    payload: unknown,
  ) {
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
    return `${connection.channel}:${connection.accountRef}:${hash}`;
  }
}
