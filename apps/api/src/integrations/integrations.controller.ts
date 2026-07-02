import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IntegrationProvider } from '@marketingspa/database';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { ConnectIntegrationDto } from './dto/integration.dto';

@Controller('integrations')
@UseGuards(JwtAuthGuard, TenantGuard)
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.organizationId);
  }

  @Post(':provider/connect')
  connect(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: IntegrationProvider,
    @Body() dto: ConnectIntegrationDto,
  ) {
    return this.service.connect(user.organizationId, provider, dto);
  }

  @Post(':provider/test')
  test(@CurrentUser() user: AuthUser, @Param('provider') provider: IntegrationProvider) {
    return this.service.test(user.organizationId, provider);
  }

  @Delete(':provider')
  disconnect(@CurrentUser() user: AuthUser, @Param('provider') provider: IntegrationProvider) {
    return this.service.disconnect(user.organizationId, provider);
  }

  @Get(':provider/campaigns')
  fetchCampaigns(@CurrentUser() user: AuthUser, @Param('provider') provider: IntegrationProvider) {
    return this.service.fetchCampaigns(user.organizationId, provider);
  }
}
