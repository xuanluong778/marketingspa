import {
  Body,
  Controller,
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
import { HrmShiftAssignmentsService } from './hrm-shift-assignments.service';
import {
  CreateShiftAssignmentDto,
  ShiftAssignmentQueryDto,
  UpdateShiftAssignmentDto,
} from './dto/shift.dto';

@Controller('hrm/shift-assignments')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class HrmShiftAssignmentsController {
  constructor(private readonly assignments: HrmShiftAssignmentsService) {}

  @Get()
  @RequirePermissions('hrm.attendance.read')
  findAll(@CurrentUser() user: AuthUser, @Query() query: ShiftAssignmentQueryDto) {
    return this.assignments.findAll(user.organizationId, query);
  }

  @Post()
  @RequirePermissions('hrm.attendance.write')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateShiftAssignmentDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.assignments.create(user.organizationId, dto, {
      userId: user.id,
      ipAddress,
    });
  }

  @Patch(':id')
  @RequirePermissions('hrm.attendance.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateShiftAssignmentDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.assignments.update(user.organizationId, id, dto, {
      userId: user.id,
      ipAddress,
    });
  }
}
