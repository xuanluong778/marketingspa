import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { HrmShiftPoliciesService } from './hrm-shift-policies.service';
import {
  CreateWorkShiftPolicyDto,
  UpdateWorkShiftPolicyDto,
} from './dto/shift.dto';

@Controller('hrm/shift-policies')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class HrmShiftPoliciesController {
  constructor(private readonly policies: HrmShiftPoliciesService) {}

  @Get()
  @RequirePermissions('hrm.attendance.read')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.policies.findAll(user.organizationId, {
      branchId,
      includeInactive: includeInactive === 'true' || includeInactive === '1',
    });
  }

  @Post()
  @RequirePermissions('hrm.attendance.write')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWorkShiftPolicyDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.policies.create(user.organizationId, dto, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }

  @Get(':id')
  @RequirePermissions('hrm.attendance.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.policies.findOne(user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions('hrm.attendance.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkShiftPolicyDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.policies.update(user.organizationId, id, dto, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }

  @Post(':id/deactivate')
  @RequirePermissions('hrm.attendance.write')
  deactivate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ClientIp() ipAddress?: string,
  ) {
    return this.policies.setActive(user.organizationId, id, false, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }

  @Post(':id/activate')
  @RequirePermissions('hrm.attendance.write')
  activate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ClientIp() ipAddress?: string,
  ) {
    return this.policies.setActive(user.organizationId, id, true, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }

  @Delete(':id')
  @RequirePermissions('hrm.attendance.write')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ClientIp() ipAddress?: string,
  ) {
    return this.policies.remove(user.organizationId, id, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }
}
