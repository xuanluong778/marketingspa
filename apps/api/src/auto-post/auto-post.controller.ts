import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AutoPostStatus } from '@marketingspa/database';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AutoPostService } from './auto-post.service';
import { AutoPostFacebookService } from './auto-post-facebook.service';
import { AutoPostMetaComplianceService } from './auto-post-meta-compliance.service';
import {
  GenerateAutoPostDto,
  PublishAutoPostDto,
  RewriteAutoPostDto,
  SaveAutoPostDraftDto,
  ScheduleAutoPostDto,
  UpdateAutoPostDto,
} from './dto/auto-post.dto';

type MetaCallbackRequest = Request & { requestId?: string };

const FanpageGuards = [JwtAuthGuard, TenantGuard, PermissionsGuard] as const;

@Controller('auto-post')
export class AutoPostController {
  constructor(
    private readonly service: AutoPostService,
    private readonly facebook: AutoPostFacebookService,
    private readonly metaCompliance: AutoPostMetaComplianceService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, TenantGuard)
  status() {
    return this.service.status();
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
  listPosts(@CurrentUser() user: AuthUser, @Query('status') status?: AutoPostStatus) {
    return this.service.listPosts(user.id, status);
  }

  @Get('posts/:id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  getPost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getPost(user.id, id);
  }

  @Delete('posts/:id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  deletePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deletePost(user.id, id);
  }

  @Post('publish')
  @UseGuards(JwtAuthGuard, TenantGuard)
  publishNow(@CurrentUser() user: AuthUser, @Body() dto: PublishAutoPostDto) {
    return this.service.publishNow(user.id, dto.postId);
  }

  @Post('schedule')
  @UseGuards(JwtAuthGuard, TenantGuard)
  schedule(@CurrentUser() user: AuthUser, @Body() dto: ScheduleAutoPostDto) {
    return this.service.schedule(user.id, dto);
  }

  @Post('schedule/:id/cancel')
  @UseGuards(JwtAuthGuard, TenantGuard)
  cancelSchedule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancelSchedule(user.id, id);
  }

  @Post('posts/:id/retry')
  @UseGuards(JwtAuthGuard, TenantGuard)
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.retry(user.id, id);
  }

  @Get('facebook/status')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.view')
  facebookStatus(@CurrentUser() user: AuthUser) {
    return this.facebook.getConnectionStatus(user.id);
  }

  @Get('facebook/oauth/start')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.integration.manage')
  facebookOAuthStart(@CurrentUser() user: AuthUser) {
    return this.facebook.getOAuthStartUrl(user);
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
    return this.facebook.disconnect(user.id);
  }

  @Post('facebook/pages/refresh')
  @UseGuards(...FanpageGuards)
  @RequirePermissions('automation.integration.manage')
  refreshPages(@CurrentUser() user: AuthUser) {
    return this.facebook.refreshPages(user.id, user);
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
