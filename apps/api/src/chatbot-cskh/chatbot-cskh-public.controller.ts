import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Options,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ChatbotCskhPublicService } from './chatbot-cskh-public.service';
import { ChatbotFacebookWebhookService } from './chatbot-facebook-webhook.service';
import { PublicLeadDto, PublicMessageDto } from './dto/chatbot-cskh.dto';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

@Controller('chatbot-cskh/public')
export class ChatbotCskhPublicController {
  constructor(
    private readonly publicService: ChatbotCskhPublicService,
    private readonly facebookWebhook: ChatbotFacebookWebhookService,
  ) {}

  @Options('config')
  @Options('message')
  @Options('lead')
  @Options('visitor-avatar')
  @HttpCode(204)
  preflight(@Res() res: Response) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.send();
  }

  /**
   * Avatar Messenger cho <img> (không JWT). HMAC(s) + UUID hội thoại.
   * Graph CDN hết hạn → proxy server-side + cache 7 ngày.
   */
  @Get('visitor-avatar')
  async visitorAvatar(
    @Query('c') conversationId: string,
    @Query('s') sig: string,
    @Res() res: Response,
  ) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    try {
      const { buffer, contentType } = await this.facebookWebhook.serveVisitorAvatar(
        conversationId,
        sig,
      );
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      // SVG fallback cũng cache ngắn hơn ở client khi content-type svg
      if (contentType.includes('svg')) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
      res.status(200).send(buffer);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        res.status(401).json({ message: 'Invalid avatar signature' });
        return;
      }
      if (err instanceof NotFoundException) {
        res.status(404).json({ message: 'Avatar unavailable' });
        return;
      }
      res.status(404).json({ message: 'Avatar unavailable' });
    }
  }

  @Get('config')
  async config(
    @Query('botId') botId: string,
    @Query('pageUrl') pageUrl: string,
    @Headers('origin') origin: string,
    @Res() res: Response,
  ) {
    const payload = await this.publicService.getPublicConfig(botId, pageUrl ?? '', origin ?? '');
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.json(payload);
  }

  @Post('message')
  async message(
    @Body() dto: PublicMessageDto,
    @Headers('origin') origin: string,
    @Headers('referer') referer: string,
    @Res() res: Response,
  ) {
    const payload = await this.publicService.processMessage(dto, origin ?? '', referer ?? '');
    const status = payload.code === 'rate_limited' ? 429 : 200;
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.status(status).json(payload);
  }

  @Post('lead')
  async lead(@Body() dto: PublicLeadDto, @Res() res: Response) {
    const payload = await this.publicService.submitLead(dto);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.json(payload);
  }
}
