import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BrevoWebhookService } from '../email-marketing/brevo-webhook.service';

type RequestWithRawBody = Request & { rawBody?: Buffer };

/**
 * Public Brevo transactional webhook:
 *   POST https://marketingautoaz.com/api/v1/webhooks/brevo
 *
 * Auth: header `x-maz-brevo-secret` (or `x-brevo-webhook-secret`) = BREVO_WEBHOOK_SECRET.
 * Always responds quickly with 2xx after accept; processing is sync but lightweight.
 * Không log API key / full email.
 */
@Controller('webhooks')
export class BrevoWebhookController {
  private readonly logger = new Logger(BrevoWebhookController.name);

  constructor(private readonly brevoWebhooks: BrevoWebhookService) {}

  @Post('brevo')
  @HttpCode(200)
  async receiveBrevo(
    @Req() req: RequestWithRawBody,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-maz-brevo-secret') mazSecret?: string,
    @Headers('x-brevo-webhook-secret') brevoSecret?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const secret =
      mazSecret ||
      brevoSecret ||
      (authorization?.toLowerCase().startsWith('bearer ')
        ? authorization.slice(7).trim()
        : undefined);

    if (!this.brevoWebhooks.verifySecret(secret)) {
      this.logger.warn('[brevo-webhook] unauthorized');
      throw new UnauthorizedException('Invalid Brevo webhook secret');
    }

    const body = req.body;
    // Fire processing; return 200 quickly — await still usually <100ms; keep await for reliability
    try {
      const result = await this.brevoWebhooks.handlePayload(body);
      return result;
    } catch (err) {
      this.logger.warn(
        `[brevo-webhook] process error: ${err instanceof Error ? err.message : 'error'}`,
      );
      // Still 200 to avoid Brevo retry storms on poison payloads after auth passed
      res.status(200);
      return { ok: true, accepted: 0, error: 'process_error' };
    }
  }
}
