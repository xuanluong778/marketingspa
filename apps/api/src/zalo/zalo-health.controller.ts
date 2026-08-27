import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { ZaloConnectionsService } from './zalo-connections.service';

@Controller('zalo')
export class ZaloHealthController {
  constructor(private readonly service: ZaloConnectionsService) {}

  /** Platform-wide Zalo OA health (no secrets). */
  @Get('health')
  platformHealth() {
    return this.service.health();
  }

  /** Org-scoped Zalo OA health for authenticated tenant. */
  @Get('health/org')
  @UseGuards(JwtAuthGuard, TenantGuard)
  orgHealth(@CurrentUser() user: AuthUser) {
    return this.service.health(user.organizationId);
  }
}
