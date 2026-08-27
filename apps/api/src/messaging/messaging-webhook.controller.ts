import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Headers,
  Header,
} from '@nestjs/common';
import type { Request } from 'express';
import { MessagingWebhookIngressService } from './messaging-webhook-ingress.service';

type RequestWithRawBody = Request & { rawBody?: Buffer };

/** Public webhook ingress — controller chỉ nhận & enqueue, không gọi provider API */
@Controller('messaging/webhooks')
export class MessagingWebhookController {
  private readonly logger = new Logger(MessagingWebhookController.name);

  constructor(private readonly ingress: MessagingWebhookIngressService) {}

  @Get('messenger')
  @Header('Content-Type', 'text/plain')
  verifyMessenger(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    return this.ingress.verifyMessengerChallenge(mode, token, challenge);
  }

  @Post('messenger')
  @HttpCode(200)
  receiveMessenger(
    @Req() req: RequestWithRawBody,
    @Body() body: Record<string, unknown>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body));
    // Fail-closed sync trước khi trả 200 — không log token/secret
    this.ingress.assertMessengerSignature(raw, signature);
    void this.ingress.ingestMessenger(raw, body, signature).catch((err) => {
      this.logger.warn(`Messenger ingest error: ${(err as Error).message}`);
    });
    return { ok: true };
  }

  @Post('zalo')
  @HttpCode(200)
  async receiveZalo(
    @Req() req: RequestWithRawBody,
    @Body() body: Record<string, unknown>,
    @Headers('x-zevent-signature') signature?: string,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body));
    // Fail-closed sync trước khi trả 200
    await this.ingress.assertZaloSignature(raw, body, signature);
    void this.ingress.ingestZalo(raw, body, signature).catch((err) => {
      this.logger.warn(`Zalo ingest error: ${(err as Error).message}`);
    });
    return { ok: true };
  }
}
