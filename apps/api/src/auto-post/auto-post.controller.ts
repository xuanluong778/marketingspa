import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AutoPostService } from './auto-post.service';
import { AutoPostFacebookService } from './auto-post-facebook.service';
import { AutoPostMetaComplianceService } from './auto-post-meta-compliance.service';
import { AutoPostFacebookPageDetailsService } from './auto-post-facebook-page-details.service';
import { MetaGraphMetricsService } from './meta-graph-metrics.service';
import {
  GenerateAutoPostDto,
  PublishAutoPostDto,
  RewriteAutoPostDto,
  SaveAutoPostDraftDto,
  ScheduleAutoPostDto,
  SelectOAuthPagesDto,
  UpdateAutoPostDto,
  AutoPostListQueryDto,
} from './dto/auto-post.dto';

type MetaCallbackRequest = Request & { requestId?: string };

const FanpageGuards = [JwtAuthGuard, TenantGuard, PermissionsGuard] as const;

@Controller('auto-post')
export class AutoPostController {
  constructor(
    private readonly service: AutoPostService,
    private readonly facebook: AutoPostFacebookService,
    private readonly metaCompliance: AutoPostMetaComplianceService,
    private readonly pageDetails: AutoPostFacebookPageDetailsService,
    private readonly metrics: MetaGraphMetricsService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, TenantGuard)
  status(@CurrentUser() user: AuthUser) {
    return this.service.status(user);
  }

  @Post('ai/generate')
  @UseGuards(JwtAuthGuard, TenantGuard)
  generateAi(@CurrentUser() user: AuthUser, @Body() dto: GenerateAutoPostDto) {
    return this.service.generateAi(user, dto);
  }

  @Post('ai/rewrite')
  @UseGuards(JwtAuthGuard, TenantGuard)
  rewriteAi(@CurrentUser() user: AuthUser, @Body() dto: RewriteAutoPostDto) {
    return this.service.rewriteAi(user, dto);
  }

  @Post('drafts')
  @UseGuards(JwtAuthGuard, TenantGuard)
  saveDraft(@CurrentUser() user: AuthUser, @Body() dto: SaveAutoPostDraftDto) {
    return this.service.saveDraft(user, dto);
  }

  @Put('posts/:id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  updatePost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAutoPostDto,
  ) {
    return this.service.updatePost(user, { ...dto, id });
  }

  @Get('posts')
  @UseGuards(JwtAuthGuard, TenantGuard)
  listPosts(@CurrentUser() user: AuthUser, @Query() query: AutoPostListQueryDto) {
    return this.service.listPosts(user.id, user.organizationId, query.status, {
      industryId: query.industryId,
      customIndustry: query.customIndustry,
    });
  }

  @Get('posts/:id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  getPost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getPost(user.id, user.organizationId, id);
  }

  @Delete('posts/:id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  deletePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deletePost(user.id, user.organizationId, id);
  }

  @Post('publish')
  @UseGuards(JwtAuthGuard, TenantGuard)
  publishNow(@CurrentUser() user: AuthUser, @Body() dto: PublishAutoPostDto) {
    return this.service.publishNow(user.id, user.organizationId, dto);
  }

  @Post('schedule')
  @UseGuards(JwtAuthGuard, TenantGuard)
  schedule(@CurrentUser() user: AuthUser, @Body() dto: ScheduleAutoPostDto) {
    return this.service.schedule(user.id, user.organizationId, dto);
  }

  @Post('schedule/:id/cancel')
  @UseGuards(JwtAuthGuard, TenantGuard)
  cancelSchedule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancelSchedule(user.id, user.organizationId, id);
  }

  @Post('posts/:id/retry')
  @UseGuards(JwtAuthGuard, TenantGuard)
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.retry(user.id, user.organizationId, id);
  }

  @Get('facebook/status')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.view')
  facebookStatus(@CurrentUser() user: AuthUser) {
    return this.facebook.getConnectionStatus(user.id, user.organizationId, user);
  }

  /** Metrics Graph an toàn (không token) — phục vụ canary / quan sát. */
  @Get('facebook/meta-metrics')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.view')
  facebookMetaMetrics() {
    return this.metrics.snapshot();
  }

  /**
   * Chẩn đoán quyền Fanpage: Configuration ID, granted/declined, Page ID, token type, updatedAt.
   * Không trả token.
   */
  @Get('facebook/permissions-diagnostics')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.view')
  facebookPermissionsDiagnostics(@CurrentUser() user: AuthUser) {
    return this.facebook.getPermissionsDiagnostics(user.id, user.organizationId);
  }

  @Get('facebook/oauth/start')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.integration.manage')
  facebookOAuthStart(@CurrentUser() user: AuthUser) {
    return this.facebook.getOAuthStartUrl(user);
  }

  /** SUPER_ADMIN / org allowlist: đồng bộ Fanpage từ META_PAGE_* (không lộ token). */
  @Post('facebook/connect/server-env')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.integration.manage')
  facebookConnectServerEnv(@CurrentUser() user: AuthUser) {
    return this.facebook.connectServerEnv(user);
  }

  @Get('facebook/oauth/callback')
  async facebookOAuthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const { redirectUrl } = await this.facebook.handleOAuthCallback(code, state, error);
    return res.redirect(redirectUrl);
  }

  @Post('facebook/disconnect')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.integration.manage')
  facebookDisconnect(@CurrentUser() user: AuthUser) {
    return this.facebook.disconnect(user.id, user.organizationId);
  }

  /**
   * Xem thông tin Fanpage (pages_read_engagement) — metadata + bài gần đây.
   * Query `refresh=true` bỏ cache ngắn (3–5 phút) và không fallback stale.
   */
  @Get('facebook/pages/:fanpageId/details')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.view')
  facebookPageDetails(
    @CurrentUser() user: AuthUser,
    @Param('fanpageId') fanpageId: string,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh =
      refresh === '1' || refresh === 'true' || refresh === 'yes';
    return this.pageDetails.getPageDetails(user.id, user.organizationId, fanpageId, {
      refresh: forceRefresh,
    });
  }

  /**
   * Đồng bộ live từ Facebook Graph (Page Access Token).
   * Không đọc cache / không fallback dữ liệu cũ — dùng cho App Review pages_read_engagement.
   */
  @Post('facebook/pages/:fanpageId/sync')
  @HttpCode(200)
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.view')
  facebookPageSync(@CurrentUser() user: AuthUser, @Param('fanpageId') fanpageId: string) {
    return this.pageDetails.syncPageDetails(user.id, user.organizationId, fanpageId);
  }

  @Delete('facebook/pages/:fanpageId')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.integration.manage')
  facebookDisconnectPage(
    @CurrentUser() user: AuthUser,
    @Param('fanpageId') fanpageId: string,
  ) {
    return this.facebook.disconnectPage(user.id, user.organizationId, fanpageId);
  }

  @Post('facebook/pages/refresh')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.integration.manage')
  refreshPages(@CurrentUser() user: AuthUser) {
    return this.facebook.refreshPages(user.id, user.organizationId, user);
  }

  // OAuth: lấy danh sách Fanpage để user chủ động chọn (không trả token)
  @Get('facebook/oauth/pages')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.integration.manage')
  oauthListPages(@CurrentUser() user: AuthUser) {
    return this.facebook.listOAuthManagedPages(user.id, user.organizationId, user);
  }

  @Post('facebook/oauth/select')
  @HttpCode(200)
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.integration.manage')
  oauthSelectPage(@CurrentUser() user: AuthUser, @Body() dto: SelectOAuthPagesDto & { pageId?: string }) {
    const pageIds =
      Array.isArray(dto?.pageIds) && dto.pageIds.length > 0
        ? dto.pageIds
        : dto?.pageId
          ? [dto.pageId]
          : [];
    if (pageIds.length === 0) {
      throw new BadRequestException('pageIds is required');
    }
    return this.facebook.selectOAuthPages(user.id, user.organizationId, pageIds);
  }

  /**
   * Meta Deauthorize Callback (public, no JWT).
   * App Dashboard → Facebook Login → Settings → Deauthorize Callback URL
   * POST application/x-www-form-urlencoded: signed_request=...
   */
  @Post('facebook/deauthorize')
  facebookDeauthorize(
    @Req() req: MetaCallbackRequest,
    @Body() body: { signed_request?: string },
  ) {
    const signedRequest = this.extractSignedRequest(req, body);
    return this.metaCompliance.handleDeauthorize({
      signedRequest,
      ipAddress: req.ip,
      requestId: req.requestId,
      secure: req.secure,
      forwardedProto: req.headers['x-forwarded-proto'],
    });
  }

  /**
   * Meta Data Deletion Request Callback (public, no JWT).
   * Returns { url, confirmation_code } per Meta Platform Terms.
   */
  @Post('facebook/data-deletion')
  facebookDataDeletion(
    @Req() req: MetaCallbackRequest,
    @Body() body: { signed_request?: string },
  ) {
    const signedRequest = this.extractSignedRequest(req, body);
    return this.metaCompliance.handleDataDeletion({
      signedRequest,
      ipAddress: req.ip,
      requestId: req.requestId,
      secure: req.secure,
      forwardedProto: req.headers['x-forwarded-proto'],
    });
  }

  /** Public status check for Meta data deletion confirmation_code */
  @Get('facebook/data-deletion/status/:code')
  facebookDataDeletionStatus(@Param('code') code: string) {
    return this.metaCompliance.getDeletionStatus(code);
  }

  private extractSignedRequest(
    req: MetaCallbackRequest,
    body: { signed_request?: string },
  ): string {
    const fromBody =
      (typeof body?.signed_request === 'string' && body.signed_request) ||
      (typeof (req.body as { signed_request?: string })?.signed_request === 'string' &&
        (req.body as { signed_request?: string }).signed_request) ||
      '';
    const fromQuery =
      typeof req.query?.signed_request === 'string' ? req.query.signed_request : '';
    const signedRequest = (fromBody || fromQuery).trim();
    if (!signedRequest) {
      throw new BadRequestException('signed_request is required');
    }
    return signedRequest;
  }
}
