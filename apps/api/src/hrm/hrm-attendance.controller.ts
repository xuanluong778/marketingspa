import {
  Body,
  Controller,
  Get,
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
import { HrmAttendanceService } from './hrm-attendance.service';
import {
  AttendanceDaysQueryDto,
  AttendancePunchDto,
  CreateAttendanceAdjustmentDto,
  CreateAttendanceQrTokenDto,
} from './dto/attendance.dto';

@Controller('hrm/attendance')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class HrmAttendanceController {
  constructor(private readonly attendance: HrmAttendanceService) {}

  @Get('days')
  @RequirePermissions('hrm.attendance.read')
  listDays(@CurrentUser() user: AuthUser, @Query() query: AttendanceDaysQueryDto) {
    return this.attendance.listDays(user.organizationId, query);
  }

  @Post('punch')
  @RequirePermissions('hrm.attendance.write')
  punch(
    @CurrentUser() user: AuthUser,
    @Body() dto: AttendancePunchDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.attendance.punch(user.organizationId, dto, {
      userId: user.id,
      ipAddress,
    });
  }

  @Post('adjustments')
  @RequirePermissions('hrm.attendance.write')
  createAdjustment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAttendanceAdjustmentDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.attendance.createAdjustment(user.organizationId, dto, {
      userId: user.id,
      ipAddress,
    });
  }

  @Get('qr-tokens')
  @RequirePermissions('hrm.attendance.read')
  listQrTokens(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.attendance.listQrTokens(user.organizationId, branchId);
  }

  @Post('qr-tokens')
  @RequirePermissions('hrm.attendance.write')
  createQrToken(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAttendanceQrTokenDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.attendance.createQrToken(user.organizationId, dto, {
      userId: user.id,
      ipAddress,
    });
  }
}
