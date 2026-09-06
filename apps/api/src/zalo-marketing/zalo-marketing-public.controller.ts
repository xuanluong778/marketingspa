import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZaloMarketingService } from './zalo-marketing.service';
import { ZALO_OA_OAUTH_COOKIE, ZaloOAuthService } from './zalo-oauth.service';

@Controller('zalo-marketing/public')
export class ZaloMarketingPublicController {
  private readonly logger = new Logger(ZaloMarketingPublicController.name);

  constructor(
    private readonly service: ZaloMarketingService,
    private readonly oauth: ZaloOAuthService,
  ) {}

  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('oa_id') oaId: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Query('error_reason') errorReason: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let returnPath = '/zalo-marketing?tab=oa';
    const redirectUri = this.oauth.getRedirectUri();
    const appId = this.oauth.getAppId();
    const cookieValue =
      typeof req.cookies?.[ZALO_OA_OAUTH_COOKIE] === 'string'
        ? req.cookies[ZALO_OA_OAUTH_COOKIE]
        : undefined;
    try {
      if (error || !code) {
        const reason = [error, errorReason, errorDescription]
          .filter(Boolean)
          .join(' | ')
          .slice(0, 200);
        this.logger.warn(
          `Zalo OA OAuth callback rejected appId=…${appId.slice(-6)} redirectUri=${redirectUri} reason=${reason || 'missing_code'} hasCookie=${Boolean(cookieValue)} hasState=${Boolean(state)}`,
        );
        throw new Error(
          errorDescription || errorReason || error || 'OAuth bị hủy hoặc thiếu mã',
        );
      }
      const payload = this.oauth.resolveCallbackSession(state, cookieValue);
      returnPath = payload.returnPath || returnPath;
      const result = await this.service.handleOAuthCallback(code, state, cookieValue, oaId);
      this.logger.log(
        `Zalo OA OAuth callback OK appId=…${appId.slice(-6)} redirectUri=${redirectUri} oa=…${String(result.oaId || oaId || '').slice(-6)} org=…${String(result.organizationId).slice(-6)}`,
      );
      res.clearCookie(ZALO_OA_OAUTH_COOKIE, { path: '/' });
      res.redirect(result.redirectUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'OAuth thất bại';
      this.logger.warn(
        `Zalo OA OAuth callback FAIL appId=…${appId.slice(-6)} redirectUri=${redirectUri} msg=${msg.slice(0, 160)}`,
      );
      res.redirect(this.oauth.buildErrorRedirect(msg, returnPath));
    }
  }

  /** Safe public config for ops — no secrets */
  @Get('oauth/config')
  oauthConfig() {
    return this.oauth.getPublicConfig();
  }
}
