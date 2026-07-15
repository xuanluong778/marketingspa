import {
  Body,
  Controller,
  Get,
  Param,
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
import { HrmTimesheetService } from './hrm-timesheet.service';
import {
  CreateTimesheetPeriodDto,
  TimesheetPeriodQueryDto,
  UnlockTimesheetPeriodDto,
} from './dto/attendance.dto';

@Controller('hrm/timesheet-periods')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class HrmTimesheetController {
  constructor(private readonly timesheet: HrmTimesheetService) {}

  @Get()
  @RequirePermissions('hrm.attendance.read')
  list(@CurrentUser() user: AuthUser, @Query() query: TimesheetPeriodQueryDto) {
    return this.timesheet.list(user.organizationId, query);
  }

  @Post()
  @RequirePermissions('hrm.attendance.write')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTimesheetPeriodDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.timesheet.create(user.organizationId, dto, {
      userId: user.id,
      ipAddress,
    });
  }

  @Post(':id/lock')
  @RequirePermissions('hrm.attendance.lock')
  lock(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ClientIp() ipAddress?: string,
  ) {
    return this.timesheet.lock(user.organizationId, id, {
      userId: user.id,
      ipAddress,
    });
  }

  @Post(':id/unlock')
  @RequirePermissions('hrm.attendance.lock')
  unlock(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UnlockTimesheetPeriodDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.timesheet.unlock(user.organizationId, id, dto.reason, {
      userId: user.id,
      ipAddress,
    });
  }
}
