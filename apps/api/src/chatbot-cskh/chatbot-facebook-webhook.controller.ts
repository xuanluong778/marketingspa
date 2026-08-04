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
    const pageId = String(entry[0]?.id || '').trim();
    this.logger.log(
      `Meta webhook POST object=${String(body.object || '-')} pageId=${
        pageId ? `••••${pageId.slice(-4)}` : '-'
      } entries=${entry.length} sig=${signature ? 'yes' : 'no'}`,
    );

    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body));
    // ingestMessenger → chatbot handler + messaging queue (một lần, chống double-process)
    void this.messagingIngress.ingestMessenger(raw, body, signature).catch((err) => {
      this.logger.warn(`Messaging/chatbot ingress: ${(err as Error).message}`);
    });
    return { ok: true };
  }
}
