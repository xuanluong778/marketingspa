import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAdminOpsService } from './platform-admin-ops.service';
import {
  AdminAuditQueryDto,
  AdminExtendSubscriptionDto,
  AdminGiftTimeDto,
  AdminJobsQueryDto,
  AdminListQueryDto,
  AdminReasonDto,
  AdminSetActiveDto,
  AdminSoftDeleteUserDto,
  AdminUsageQueryDto,
} from './dto/platform-admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformAdminController {
  constructor(
    private readonly admin: PlatformAdminService,
    private readonly ops: PlatformAdminOpsService,
  ) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('organizations')
  listOrganizations(@Query() query: AdminListQueryDto) {
    return this.admin.listOrganizations(query);
  }

  @Get('organizations/:id')
  getOrganization(@Param('id') id: string) {
    return this.admin.getOrganization(id);
  }

  @Patch('organizations/:id/status')
  setOrganizationStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminSetActiveDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.setOrganizationActive(user, id, dto, ip);
  }

  @Get('users')
  listUsers(@Query() query: AdminListQueryDto) {
    return this.admin.listUsers(query);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Patch('users/:id/status')
  setUserStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminSetActiveDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.setUserActive(user, id, dto, ip);
  }

  @Post('users/:id/force-logout')
  forceLogout(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminReasonDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.forceLogout(user, id, dto, ip);
  }

  /** Soft delete — giữ billing/audit; revoke session ngay */
  @Post('users/:id/soft-delete')
  @HttpCode(200)
  softDeleteUser(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminSoftDeleteUserDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.softDeleteUser(user, id, dto, ip);
  }

  /** Tặng thời gian (ngày/tháng/năm) — idempotent */
  @Post('users/:id/gift-time')
  @HttpCode(200)
  giftTime(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminGiftTimeDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.giftTimeToUser(user, id, dto, ip);
  }

  @Get('subscriptions')
  listSubscriptions(@Query() query: AdminListQueryDto) {
    return this.admin.listSubscriptions(query);
  }

  @Get('subscriptions/:id')
  getSubscription(@Param('id') id: string) {
    return this.admin.getSubscription(id);
  }

  @Post('subscriptions/:id/extend')
  extend(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminExtendSubscriptionDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.extendSubscription(user, id, dto, ip);
  }

  @Post('subscriptions/:id/upgrade-12m')
  upgrade12m(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminReasonDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.upgradeTo12m(user, id, dto, ip);
  }

  @Get('usage')
  usage(@Query() query: AdminUsageQueryDto) {
    return this.ops.listUsage(query);
  }

  @Get('integrations/health')
  integrationsHealth() {
    return this.ops.integrationsHealth();
  }

  @Get('jobs/failed')
  failedJobs(@Query() query: AdminJobsQueryDto) {
    return this.ops.listFailedJobs(query);
  }

  @Post('jobs/:type/:id/retry')
  retryJob(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: AdminReasonDto,
    @ClientIp() ip?: string,
  ) {
    return this.ops.retryJob(user, type, id, dto, ip);
  }

  @Get('audit-logs')
  auditLogs(@Query() query: AdminAuditQueryDto) {
    return this.ops.listAuditLogs(query);
  }
}
