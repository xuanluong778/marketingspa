import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ChatbotFacebookWebhookService } from './chatbot-facebook-webhook.service';
import { MessagingWebhookIngressService } from '../messaging/messaging-webhook-ingress.service';

type RequestWithRawBody = Request & { rawBody?: Buffer };

/**
 * Public Meta Messenger webhook (no JWT).
 * Configure in Meta App → Webhooks → Callback URL:
 *   {API_URL}/api/v1/chatbot-cskh/facebook/webhook
 * Verify token: CSKH_FB_WEBHOOK_VERIFY_TOKEN
 * Subscribed fields: messages, messaging_postbacks
 */
@Controller('chatbot-cskh/facebook')
export class ChatbotFacebookWebhookController {
  private readonly logger = new Logger(ChatbotFacebookWebhookController.name);

  constructor(
    private readonly webhook: ChatbotFacebookWebhookService,
    private readonly messagingIngress: MessagingWebhookIngressService,
  ) {}

  /** Public helper for Meta console / ops — no secrets. */
  @Get('webhook/info')
  info() {
    return {
      ok: true,
      webhookPath: this.webhook.getWebhookPath(),
      webhookUrl: this.webhook.getWebhookUrl(),
      verifyTokenConfigured: Boolean(this.webhook.getVerifyToken()),
      appSecretConfigured: Boolean(this.webhook.getAppSecret()),
      signatureMode: this.webhook.getAppSecret() ? 'required' : 'optional',
      subscribedFields: [
        'messages',
        'messaging_postbacks',
        'message_deliveries',
        'message_reads',
      ],
      note: 'Chatbot dùng chung Fanpage Auto Post. Khi có META_APP_SECRET, chữ ký X-Hub-Signature-256 bắt buộc (fail-closed).',
    };
  }

  @Get('webhook')
  @Header('Content-Type', 'text/plain')
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    return this.webhook.verifyChallenge(mode, token, challenge);
  }

  @Post('webhook')
  @HttpCode(200)
  receive(
    @Req() req: RequestWithRawBody,
    @Body() body: Record<string, unknown>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    if (!req.rawBody?.length) {
      this.logger.warn(
        'Meta webhook missing rawBody — signature verify may fail; check body parser',
      );
    }
    if (!this.webhook.verifySignature(req.rawBody, signature)) {
      this.logger.warn(
        `Invalid Meta webhook signature rawBody=${req.rawBody?.length ?? 0}B sig=${signature ? 'yes' : 'no'}`,
      );
      throw new ForbiddenException('Invalid signature');
    }

    const entry = Array.isArray(body.entry) ? (body.entry as Array<{ id?: string }>) : [];
    const pageIds = entry
      .map((e) => String(e?.id || '').trim())
      .filter(Boolean);
    this.logger.log(
      `Meta webhook POST object=${String(body.object || '-')} pages=${
        pageIds.length ? pageIds.map((p) => `••••${p.slice(-4)}`).join(',') : '-'
      } entries=${entry.length} sig=${signature ? 'yes' : 'no'}`,
    );

    // PRIMARY: process Chatbot CSKH immediately (multi-page). Never depend on messaging queue jobId.
    this.webhook.processPayloadAsync(body as never);

    // SECONDARY: messaging blast/webhook pipeline — isolated failures must not block chatbot
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body));
    void this.messagingIngress
      .ingestMessenger(raw, body, signature, { skipSignatureAssert: true, skipChatbotHandler: true })
      .catch((err) => {
        this.logger.warn(`Messaging ingress (non-fatal): ${(err as Error).message}`);
      });
    return { ok: true };
  }
}
