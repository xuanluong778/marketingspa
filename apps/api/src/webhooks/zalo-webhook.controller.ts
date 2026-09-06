import { Body, Controller, HttpCode, Logger, Post, Req, Headers } from '@nestjs/common';
import type { Request } from 'express';
import { MessagingWebhookIngressService } from '../messaging/messaging-webhook-ingress.service';

type RequestWithRawBody = Request & { rawBody?: Buffer };

/**
 * Public Zalo OA webhook — production callback URL:
 *   POST https://marketingautoaz.com/api/v1/webhooks/zalo
 *
 * Thin ingress: verify + enqueue via MessagingWebhookIngressService; always 200.
 * Alias of messaging path kept for backward compatibility.
 */
@Controller('webhooks')
export class ZaloWebhookController {
  private readonly logger = new Logger(ZaloWebhookController.name);

  constructor(private readonly ingress: MessagingWebhookIngressService) {}

  @Post('zalo')
  @HttpCode(200)
  receiveZalo(
    @Req() req: RequestWithRawBody,
    @Body() body: Record<string, unknown>,
    @Headers('x-zevent-signature') signature?: string,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}));
    void this.ingress.ingestZalo(raw, body, signature).catch((err) => {
      // Log lỗi xử lý — không log token/secret
      this.logger.warn(`Zalo webhook ingest error: ${(err as Error).message}`);
    });
    return { ok: true };
  }
}
