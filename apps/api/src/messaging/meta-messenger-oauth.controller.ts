import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { MetaMessengerOAuthService } from './meta-messenger-oauth.service';

@Controller('messaging/facebook/oauth')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class MetaMessengerOAuthController {
  constructor(private readonly messengerOAuth: MetaMessengerOAuthService) {}

  @Get('start')
  @RequirePermissions('automation.integration.manage')
  start(@CurrentUser() user: AuthUser) {
    return this.messengerOAuth.getOAuthStartUrl(user.id, user.organizationId);
  }
}
