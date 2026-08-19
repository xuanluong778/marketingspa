import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ZaloMarketingService } from './zalo-marketing.service';
import { ZaloOAuthService } from './zalo-oauth.service';

@Controller('zalo-marketing/public')
export class ZaloMarketingPublicController {
  constructor(
    private readonly service: ZaloMarketingService,
    private readonly oauth: ZaloOAuthService,
  ) {}

  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ) {
    let returnPath = '/zalo-marketing?tab=oa';
    try {
      if (error || !code || !state) {
        throw new Error(errorDescription || error || 'OAuth bị hủy hoặc thiếu mã');
      }
      const payload = this.oauth.verifyState(state);
      returnPath = payload.returnPath || returnPath;
      const result = await this.service.handleOAuthCallback(code, state);
      res.redirect(result.redirectUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'OAuth thất bại';
      res.redirect(this.oauth.buildErrorRedirect(msg, returnPath));
    }
  }
}
