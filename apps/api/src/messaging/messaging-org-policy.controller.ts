import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { MessagingOrgPolicyService } from './messaging-org-policy.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { UpdateMessagingOrgPolicyDto } from './dto/messaging-org-policy.dto';

@Controller('automation/messaging-policy')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class MessagingOrgPolicyController {
  constructor(private readonly service: MessagingOrgPolicyService) {}

  @Get()
  @RequirePermissions('automation.view')
  get(@CurrentUser() user: AuthUser) {
    return this.service.getOrCreate(user.organizationId);
  }

  @Patch()
  @RequirePermissions('automation.integration.manage')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMessagingOrgPolicyDto) {
    return this.service.update(user.organizationId, dto, user.id);
  }
}
