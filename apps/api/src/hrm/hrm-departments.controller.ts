import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { HrmDepartmentsService } from './hrm-departments.service';
import { CreateDepartmentDto, DepartmentQueryDto } from './dto/department.dto';

@Controller('hrm/departments')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class HrmDepartmentsController {
  constructor(private readonly departments: HrmDepartmentsService) {}

  @Get()
  @RequirePermissions('hrm.employee.read')
  findAll(@CurrentUser() user: AuthUser, @Query() query: DepartmentQueryDto) {
    return this.departments.findAll(user.organizationId, query);
  }

  @Post()
  @RequirePermissions('hrm.employee.write')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDepartmentDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.departments.create(user.organizationId, dto, {
      userId: user.id,
      ipAddress,
    });
  }
}
