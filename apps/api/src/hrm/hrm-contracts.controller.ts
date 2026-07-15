import { Body, Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { HrmContractsService } from './hrm-contracts.service';
import { UpdateEmploymentContractDto } from './dto/contract.dto';

@Controller('hrm/contracts')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class HrmContractsController {
  constructor(private readonly contracts: HrmContractsService) {}

  @Patch(':id')
  @RequirePermissions('hrm.contract.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmploymentContractDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.contracts.update(user.organizationId, id, dto, {
      userId: user.id,
      ipAddress,
    });
  }
}
