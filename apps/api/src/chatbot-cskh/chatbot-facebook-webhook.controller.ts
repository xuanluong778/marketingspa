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

type RequestWithRawBody = Request & { rawBody?: Buffer };

/**
 * Public Meta Messenger webhook (no JWT).
 * Configure in Meta App → Webhooks → Callback URL:
 *   {API_URL}/api/v1/chatbot-cskh/facebook/webhook
 * Verify token: CSKH_FB_WEBHOOK_VERIFY_TOKEN
 */
@Controller('chatbot-cskh/facebook')
export class ChatbotFacebookWebhookController {
  private readonly logger = new Logger(ChatbotFacebookWebhookController.name);

  constructor(private readonly webhook: ChatbotFacebookWebhookService) {}

  /** Public helper for Meta console / ops — no secrets. */
  @Get('webhook/info')
  info() {
    return {
      ok: true,
      webhookPath: this.webhook.getWebhookPath(),
      webhookUrl: this.webhook.getWebhookUrl(),
      verifyTokenConfigured: Boolean(this.webhook.getVerifyToken()),
      note: 'Chatbot chỉ cần Page Access Token + Page ID. META_APP_ID không bắt buộc.',
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
    if (!this.webhook.verifySignature(req.rawBody, signature)) {
      this.logger.warn('Invalid Meta webhook signature');
      throw new ForbiddenException('Invalid signature');
    }

    this.webhook.processPayloadAsync(
      body as Parameters<ChatbotFacebookWebhookService['processPayload']>[0],
    );
    return { ok: true };
  }
}
