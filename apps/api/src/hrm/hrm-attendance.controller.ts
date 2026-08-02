import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
  AttendanceExportQueryDto,
  AttendancePunchDto,
  CorrectAttendanceDayDto,
  CreateAttendanceAdjustmentDto,
  CreateAttendanceQrTokenDto,
} from './dto/attendance.dto';

@Controller('hrm/attendance')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class HrmAttendanceController {
  constructor(private readonly attendance: HrmAttendanceService) {}

  @Get('days/export')
  @RequirePermissions('hrm.attendance.read')
  async exportDays(
    @CurrentUser() user: AuthUser,
    @Query() query: AttendanceExportQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.attendance.exportDays(user.organizationId, query, user);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.content);
  }

  @Get('days')
  @RequirePermissions('hrm.attendance.read')
  listDays(@CurrentUser() user: AuthUser, @Query() query: AttendanceDaysQueryDto) {
    return this.attendance.listDays(user.organizationId, query, user);
  }

  @Get('today')
  @RequirePermissions('hrm.attendance.read')
  today(@CurrentUser() user: AuthUser) {
    return this.attendance.getTodayPunchState(user.organizationId, user);
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
      role: user.role,
      employeeId: user.employeeId,
    });
  }

  @Post('days/:id/correct')
  @RequirePermissions('hrm.attendance.write')
  correctDay(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CorrectAttendanceDayDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.attendance.correctDay(user.organizationId, id, dto, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
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
      role: user.role,
      employeeId: user.employeeId,
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
