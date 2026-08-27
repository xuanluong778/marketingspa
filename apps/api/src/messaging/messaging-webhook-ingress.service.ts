import { createHash } from 'crypto';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { MessageChannel, MessagingProviderKind } from '@marketingspa/database';
import { verifyZaloWebhookSignature } from '@marketingspa/shared';
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
    if (!appSecret) {
      this.logger.error('META_APP_SECRET missing — rejecting Messenger webhook (fail-closed)');
      throw new UnauthorizedException('Meta webhook secret not configured');
    }

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

  /**
   * Fail-closed Zalo OA webhook auth — thiếu secret/signature hoặc sai chữ ký → 401.
   * Verifies official mac=sha256(appId+body+timestamp+oaSecret) (+ legacy HMAC).
   * Không log secret.
   */
  async assertZaloSignature(rawBody: Buffer, payload: unknown, signature?: string): Promise<void> {
    const body = payload as { oa_id?: string; timestamp?: string | number };
    const oaId = typeof body.oa_id === 'string' ? body.oa_id.trim() : '';
    if (!oaId) {
      throw new UnauthorizedException('Zalo webhook missing oa_id');
    }
    if (!signature?.trim()) {
      throw new UnauthorizedException('Invalid Zalo webhook signature');
    }

    const connection = await this.channelConnections.findByAccountRef(MessageChannel.ZALO, oaId);
    if (!connection || connection.isPaused) {
      throw new UnauthorizedException('Zalo OA connection not found or paused');
    }

    const secret = await this.resolveZaloWebhookSecret(oaId, connection.encryptedCredentials);
    if (!secret) {
      this.logger.warn(`Zalo webhook rejected — missing webhookSecret oa=${oaId}`);
      throw new UnauthorizedException('Zalo webhook secret not configured');
    }

    const appId =
      (this.config.get<string>('ZALO_APP_ID') ?? '').trim() ||
      (this.config.get<string>('ZALO_OA_APP_ID') ?? '').trim();

    const ok = verifyZaloWebhookSignature({
      rawBody,
      signature,
      appId,
      timestamp: body.timestamp ?? '',
      oaSecretKey: secret,
      allowLegacyHmac: true,
    });
    if (!ok) {
      this.logger.warn(`Zalo webhook signature rejected oa=${oaId}`);
      throw new UnauthorizedException('Invalid Zalo webhook signature');
    }
  }

  /** Prefer connection secret; fall back to sibling rows / env (never logged). */
  private async resolveZaloWebhookSecret(
    oaId: string,
    encryptedCredentials: string | null,
  ): Promise<string> {
    const fromConn = this.channelConnections.decryptCredentials(encryptedCredentials);
    const direct = (fromConn.webhookSecret || fromConn.oaSecretKey || '').trim();
    if (direct) return direct;

    const siblings = await this.prisma.messagingChannelConnection.findMany({
      where: { channel: MessageChannel.ZALO, accountRef: oaId },
      select: { encryptedCredentials: true },
      take: 10,
    });
    for (const row of siblings) {
      const c = this.channelConnections.decryptCredentials(row.encryptedCredentials);
      const s = (c.webhookSecret || c.oaSecretKey || '').trim();
      if (s) return s;
    }

    return (
      (this.config.get<string>('ZALO_OA_WEBHOOK_SECRET') ?? '').trim() ||
      (this.config.get<string>('ZALO_WEBHOOK_SECRET') ?? '').trim()
    );
  }

  async ingestZalo(rawBody: Buffer, payload: unknown, signature?: string): Promise<void> {
    await this.assertZaloSignature(rawBody, payload, signature);

    const body = payload as { oa_id?: string };
    const oaId = String(body.oa_id || '').trim();
    const connection = await this.channelConnections.findByAccountRef(MessageChannel.ZALO, oaId);
    if (!connection || connection.isPaused) return;

    const provider = this.providers.get(MessagingProviderKind.ZALO_OA);
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
