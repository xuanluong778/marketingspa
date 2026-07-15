import { Controller, Delete, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { HrmDocumentsService } from './hrm-documents.service';

@Controller('hrm/documents')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class HrmDocumentsController {
  constructor(private readonly documents: HrmDocumentsService) {}

  @Delete(':id')
  @RequirePermissions('hrm.document.write')
  archive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ClientIp() ipAddress?: string,
  ) {
    return this.documents.archive(user.organizationId, id, {
      userId: user.id,
      ipAddress,
    });
  }
}
