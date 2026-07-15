import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { HrmAuditService } from './hrm-audit.service';

@Controller('hrm/audit')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class HrmAuditController {
  constructor(private readonly audit: HrmAuditService) {}

  @Get()
  @RequirePermissions('hrm.audit.read')
  findAll(@CurrentUser() user: AuthUser) {
    return this.audit.findHrmLogs(user.organizationId);
  }
}
