import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { createUploadMulterOptions } from '../common/uploads/upload-policy';
import { HrmLeaveService } from './hrm-leave.service';
import {
  CreateLeaveRequestDto,
  CreateOvertimeRequestDto,
  LeaveBalanceQueryDto,
  LeaveCancelDto,
  LeaveDecisionDto,
  LeaveRejectDto,
  LeaveRequestQueryDto,
  OvertimeRequestQueryDto,
} from './dto/leave.dto';

@Controller('hrm/leave-requests')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class HrmLeaveController {
  constructor(private readonly leave: HrmLeaveService) {}

  @Get()
  @RequirePermissions('hrm.leave.read')
  list(@CurrentUser() user: AuthUser, @Query() query: LeaveRequestQueryDto) {
    return this.leave.listLeave(user.organizationId, query, user);
  }

  @Get('balance')
  @RequirePermissions('hrm.leave.read')
  balance(@CurrentUser() user: AuthUser, @Query() query: LeaveBalanceQueryDto) {
    return this.leave.getBalance(user.organizationId, query, user);
  }

  @Post()
  @RequirePermissions('hrm.leave.write')
  @UseInterceptors(FileInterceptor('file', createUploadMulterOptions('document')))
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLeaveRequestDto,
    @UploadedFile()
    file:
      | {
          originalname?: string;
          mimetype?: string;
          size?: number;
          buffer?: Buffer;
        }
      | undefined,
    @ClientIp() ipAddress?: string,
  ) {
    return this.leave.createLeave(user.organizationId, dto, file, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }

  @Get(':id/attachment')
  @RequirePermissions('hrm.leave.read')
  async attachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, mime, filename } = await this.leave.getLeaveAttachment(
      user.organizationId,
      id,
      user,
    );
    res.setHeader('Content-Type', mime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(filename)}"`,
    );
    return file;
  }

  @Post(':id/approve')
  @RequirePermissions('hrm.leave.approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LeaveDecisionDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.leave.approveLeave(user.organizationId, id, dto, user.id, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }

  @Post(':id/reject')
  @RequirePermissions('hrm.leave.approve')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LeaveRejectDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.leave.rejectLeave(user.organizationId, id, dto, user.id, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }

  @Post(':id/cancel')
  @RequirePermissions('hrm.leave.write')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LeaveCancelDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.leave.cancelLeave(user.organizationId, id, dto, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }
}

@Controller('hrm/overtime-requests')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class HrmOvertimeController {
  constructor(private readonly leave: HrmLeaveService) {}

  @Get()
  @RequirePermissions('hrm.leave.read')
  list(@CurrentUser() user: AuthUser, @Query() query: OvertimeRequestQueryDto) {
    return this.leave.listOvertime(user.organizationId, query, user);
  }

  @Post()
  @RequirePermissions('hrm.leave.write')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOvertimeRequestDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.leave.createOvertime(user.organizationId, dto, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }

  @Post(':id/approve')
  @RequirePermissions('hrm.leave.approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LeaveDecisionDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.leave.approveOvertime(user.organizationId, id, dto, user.id, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }

  @Post(':id/reject')
  @RequirePermissions('hrm.leave.approve')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LeaveRejectDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.leave.rejectOvertime(user.organizationId, id, dto, user.id, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }

  @Post(':id/cancel')
  @RequirePermissions('hrm.leave.write')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LeaveCancelDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.leave.cancelOvertime(user.organizationId, id, dto, {
      userId: user.id,
      ipAddress,
      role: user.role,
      employeeId: user.employeeId,
    });
  }
}
