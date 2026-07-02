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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateEmployeeDto, UpdateEmployeeDto, EmployeeQueryDto } from './dto/employee.dto';
import { EmployeePerformanceQueryDto } from './dto/performance.dto';

@Controller('employees')
@UseGuards(JwtAuthGuard, TenantGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: EmployeeQueryDto) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get(':id/performance')
  getPerformance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: EmployeePerformanceQueryDto,
  ) {
    return this.service.getPerformance(user.organizationId, id, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.service.create(user.organizationId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.service.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id);
  }
}
