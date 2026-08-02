import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IntegrationProvider } from '@marketingspa/database';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { ConnectIntegrationDto } from './dto/integration.dto';

@Controller('integrations')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get()
  @RequirePermissions('automation.view')
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.organizationId);
  }

  @Post(':provider/connect')
  @RequirePermissions('automation.integration.manage')
  connect(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: IntegrationProvider,
    @Body() dto: ConnectIntegrationDto,
  ) {
    return this.service.connect(user.organizationId, provider, dto, user.id);
  }

  @Post(':provider/test')
  @RequirePermissions('automation.integration.manage')
  test(@CurrentUser() user: AuthUser, @Param('provider') provider: IntegrationProvider) {
    return this.service.test(user.organizationId, provider, user.id);
  }

  @Delete(':provider')
  @RequirePermissions('automation.integration.manage')
  disconnect(@CurrentUser() user: AuthUser, @Param('provider') provider: IntegrationProvider) {
    return this.service.disconnect(user.organizationId, provider, user.id);
  }

  @Get(':provider/campaigns')
  @RequirePermissions('automation.view')
  fetchCampaigns(@CurrentUser() user: AuthUser, @Param('provider') provider: IntegrationProvider) {
    return this.service.fetchCampaigns(user.organizationId, provider);
  }
}
