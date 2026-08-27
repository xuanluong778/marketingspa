import { Controller, Get, Header, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { EmailMarketingService } from './email-marketing.service';

const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

type RequestWithRawBody = Request & { rawBody?: Buffer; body?: unknown };

function readWebhookPayload(req: RequestWithRawBody): unknown {
  if (req.rawBody?.length) {
    const text = req.rawBody.toString('utf8');
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as unknown;
    } catch {
      return req.body;
    }
  }
  return req.body ?? {};
}

@Controller('email-marketing/public')
export class EmailMarketingPublicController {
  constructor(private readonly service: EmailMarketingService) {}

  @Get('unsubscribe')
  unsubscribe(@Query('rid') rid: string) {
    return this.service.unsubscribeByRecipient(rid);
  }

  @Get('open/:rid')
  @Header('Content-Type', 'image/gif')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async open(@Param('rid') rid: string, @Res() res: Response) {
    await this.service.trackOpen(rid);
    res.setHeader('Content-Type', 'image/gif');
    res.end(PIXEL);
  }

  @Get('click/:rid')
  async click(@Param('rid') rid: string, @Query('url') url: string | undefined, @Res() res: Response) {
    const dest = await this.service.trackClick(rid, url);
    res.redirect(dest.startsWith('http') ? dest : '/');
  }

  @Post('ses-events')
  @HttpCode(200)
  async sesEvents(@Req() req: RequestWithRawBody, @Res({ passthrough: true }) res: Response) {
    const payload = readWebhookPayload(req);
    const rawBody = req.rawBody?.length ? req.rawBody.toString('utf8') : undefined;
    const testSignatureHeader =
      typeof req.headers['x-sns-test-signature'] === 'string'
        ? req.headers['x-sns-test-signature']
        : undefined;
    const result = await this.service.handleSesEvent(payload, { rawBody, testSignatureHeader });
    if (!result.ok && typeof result.statusCode === 'number' && result.statusCode !== 200) {
      res.status(result.statusCode);
    }
    return result;
  }
}
