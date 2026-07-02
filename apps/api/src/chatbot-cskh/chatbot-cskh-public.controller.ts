import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Options,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ChatbotCskhPublicService } from './chatbot-cskh-public.service';
import { PublicLeadDto, PublicMessageDto } from './dto/chatbot-cskh.dto';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

@Controller('chatbot-cskh/public')
export class ChatbotCskhPublicController {
  constructor(private readonly publicService: ChatbotCskhPublicService) {}

  @Options('config')
  @Options('message')
  @Options('lead')
  @HttpCode(204)
  preflight(@Res() res: Response) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.send();
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
