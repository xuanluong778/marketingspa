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
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateEmployeeDto, UpdateEmployeeDto, EmployeeQueryDto } from './dto/employee.dto';
import { EmployeePerformanceQueryDto } from './dto/performance.dto';

@Controller('employees')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  @RequirePermissions('hrm.employee.read')
  findAll(@CurrentUser() user: AuthUser, @Query() query: EmployeeQueryDto) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get(':id/performance')
  @RequirePermissions('hrm.employee.read')
  getPerformance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: EmployeePerformanceQueryDto,
  ) {
    return this.service.getPerformance(user.organizationId, id, query);
  }

  @Get(':id')
  @RequirePermissions('hrm.employee.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('hrm.employee.write')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEmployeeDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.service.create(user.organizationId, dto, {
      userId: user.id,
      ipAddress,
    });
  }

  @Patch(':id')
  @RequirePermissions('hrm.employee.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.service.update(user.organizationId, id, dto, {
      userId: user.id,
      ipAddress,
    });
  }

  @Delete(':id')
  @RequirePermissions('hrm.employee.write')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ClientIp() ipAddress?: string,
  ) {
    return this.service.remove(user.organizationId, id, {
      userId: user.id,
      ipAddress,
    });
  }
}
