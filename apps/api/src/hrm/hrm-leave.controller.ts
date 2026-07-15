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
import { HrmLeaveService } from './hrm-leave.service';
import {
  CreateLeaveRequestDto,
  CreateOvertimeRequestDto,
  LeaveDecisionDto,
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
    return this.leave.listLeave(user.organizationId, query);
  }

  @Post()
  @RequirePermissions('hrm.leave.write')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLeaveRequestDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.leave.createLeave(user.organizationId, dto, {
      userId: user.id,
      ipAddress,
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
    return this.leave.approveLeave(user.organizationId, id, dto, user.id, {
      userId: user.id,
      ipAddress,
    });
  }

  @Post(':id/reject')
  @RequirePermissions('hrm.leave.approve')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LeaveDecisionDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.leave.rejectLeave(user.organizationId, id, dto, user.id, {
      userId: user.id,
      ipAddress,
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
    return this.leave.listOvertime(user.organizationId, query);
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
    });
  }

  @Post(':id/reject')
  @RequirePermissions('hrm.leave.approve')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LeaveDecisionDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.leave.rejectOvertime(user.organizationId, id, dto, user.id, {
      userId: user.id,
      ipAddress,
    });
  }
}
